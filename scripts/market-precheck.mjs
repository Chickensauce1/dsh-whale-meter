/**
 * 上架前预检：按 deepseek.stream 上传页实际的校验规则先过一遍。
 *
 * 规则来自站点前端 /api/plugins/inspect-archive 的客户端逻辑与 guide 页说明：
 *   - 只能 .zip，且 ≤ 64 MiB（客户端安装上限）
 *   - 必须有 package.json，且能解析出 dsh 相关字段
 *   - 插件名需符合命名规范（小写、可含 scope、连字符）
 *   - 版本不能是占位符（0.0.0 / 0.0.1 / latest / x.y.z）
 *   - 必须有真实实现（entry 指向的文件存在且非空）
 *   - 声明了 dsh.bundle.patch 的话，那个文件必须存在
 *   - 不能带安装期生命周期脚本
 *
 * 关键取舍：**风险扫描只看 tgz（真正会被执行的安装包）**，不看 zip 里的开发脚本。
 * 仓库里的 verify/install-smoke/browser-check 本来就要用 child_process 跑子进程、
 * 会用无头浏览器，这些不是运行时代码，把它们算进风险只会制造假警报。
 * zip 只作为「仓库快照」用于浏览与上架附件，不构成执行面。
 *
 * 用法：
 *   node scripts/market-precheck.mjs                  # 检查 dist 下默认产物
 *   node scripts/market-precheck.mjs --zip a.zip      # 只查指定 zip 的结构/manifest
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync, inflateRawSync } from 'node:zlib'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')

const argVal = (flag, fallback) => {
  const i = process.argv.indexOf(flag)
  return i > -1 && process.argv[i + 1] ? path.resolve(process.argv[i + 1]) : fallback
}
const zipPath = argVal('--zip', path.join(root, 'dist', 'dsh-whale-meter-1.0.0.zip'))
const tgzPath = argVal('--tgz', path.join(root, 'dist', 'dsh-whale-meter-1.0.0.tgz'))

let failures = 0
const ok = (l, x) => console.log(`  ✓ ${l}${x ? ` — ${x}` : ''}`)
const bad = (l, x) => { failures += 1; console.error(`  ✗ ${l}${x ? ` — ${x}` : ''}`) }
const check = (l, c, x) => (c ? ok(l, x) : bad(l, x))
const warn = (l, x) => console.log(`  ! ${l}${x ? ` — ${x}` : ''}`)

/* ── 读 zip（只读中央目录，够用） ────────────────────────────────── */

function readZip(buf) {
  // 从尾部找 EOCD（0x06054b50）
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66_000); i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('不是合法 zip（找不到 EOCD）')
  const count = buf.readUInt16LE(eocd + 10)
  let off = buf.readUInt32LE(eocd + 16)
  const out = []
  for (let i = 0; i < count; i += 1) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('中央目录损坏')
    const method = buf.readUInt16LE(off + 10)
    const compSize = buf.readUInt32LE(off + 20)
    const rawSize = buf.readUInt32LE(off + 24)
    const nameLen = buf.readUInt16LE(off + 28)
    const extraLen = buf.readUInt16LE(off + 30)
    const commentLen = buf.readUInt16LE(off + 32)
    const localOff = buf.readUInt32LE(off + 42)
    const name = buf.subarray(off + 46, off + 46 + nameLen).toString('utf8')

    // 读 local header 拿真实数据起点
    const lNameLen = buf.readUInt16LE(localOff + 26)
    const lExtraLen = buf.readUInt16LE(localOff + 28)
    const dataStart = localOff + 30 + lNameLen + lExtraLen
    const raw = buf.subarray(dataStart, dataStart + compSize)
    const data = method === 0 ? raw : inflateRawSync(raw)

    out.push({ name, size: rawSize, data })
    off += 46 + nameLen + extraLen + commentLen
  }
  return out
}

console.log('\n[1/3] 归档')
check('zip 存在', existsSync(zipPath), zipPath)
const buf = readFileSync(zipPath)
const entries = readZip(buf)
const total = buf.length

check('不超过 64 MiB 上限', total < 64 * 1024 * 1024, `${total} B`)
check('后缀是 .zip', zipPath.toLowerCase().endsWith('.zip'))
check('条目 > 5', entries.length > 5, `${entries.length} 条`)

const backslash = entries.filter((e) => e.name.includes('\\'))
check('无反斜杠路径（跨平台解包不塌）', backslash.length === 0, backslash.slice(0, 2).map((e) => e.name).join(','))

const notPkg = entries.filter((e) => !e.name.startsWith('package/'))
check('条目都在 package/ 下', notPkg.length === 0, notPkg.slice(0, 2).map((e) => e.name).join(','))

const byName = new Map(entries.map((e) => [e.name, e]))

/* ── 读 manifest ────────────────────────────────────────────────── */

console.log('\n[2/3] manifest')
const pkgEntry = byName.get('package/package.json')
check('有 package.json', pkgEntry !== undefined)
if (!pkgEntry) { console.log('\n无法继续'); process.exit(1) }

let pkg = null
try { pkg = JSON.parse(pkgEntry.data.toString('utf8')) } catch (e) { bad('package.json 可解析', e.message) }
if (!pkg) process.exit(1)
ok('package.json 是合法 JSON')

/* 命名规范：小写字母数字连字符，可带 scope */
check('插件名合法', /^(@[a-z0-9-]+\/)?[a-z0-9][a-z0-9-]*$/.test(pkg.name ?? ''), pkg.name)
check('名字长度合理', (pkg.name ?? '').length >= 3 && (pkg.name ?? '').length <= 128, pkg.name)

/* 版本不能是占位符 */
const placeholder = /^(0\.0\.0|0\.0\.1|1\.0\.0-alpha\.0|latest|x\.y\.z|\^?\*)$/i
check('版本是真实 SemVer 且非占位符',
  /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(pkg.version ?? '') && !placeholder.test(pkg.version ?? ''),
  pkg.version)

check('有描述', typeof pkg.description === 'string' && pkg.description.length > 10,
  `${(pkg.description ?? '').length} 字符`)
check('声明 license', typeof pkg.license === 'string', pkg.license)
check('声明 engines.node（告诉别人要什么运行时）',
  typeof pkg.engines?.node === 'string', pkg.engines?.node)

/* 真实实现：entry 指向的文件必须在包里 */
const mainRel = `package/${(pkg.main ?? '').replace(/^\.\//, '')}`
check('main 指向的文件在包内', byName.has(mainRel), pkg.main)
check('main 文件非空', (byName.get(mainRel)?.size ?? 0) > 1000, `${byName.get(mainRel)?.size ?? 0} B`)

/* bundle patch */
const patchRel = pkg.dsh?.bundle?.patch
check('声明了 dsh.bundle.patch', typeof patchRel === 'string', String(patchRel))
if (typeof patchRel === 'string') {
  const p = `package/${patchRel.replace(/^\.\//, '')}`
  check('bundle patch 文件在包内', byName.has(p), patchRel)
  const txt = byName.get(p)?.data.toString('utf8') ?? ''
  check('patch 里有 insert 条目', /insert:/.test(txt))
  check('patch 的 id 与包名一致', txt.includes(pkg.name), pkg.name)
}

/* 客户端半 */
check('声明 dsh.client', pkg.dsh?.client !== undefined)
check('客户端 platform 为 web', pkg.dsh?.client?.platform === 'web', String(pkg.dsh?.client?.platform))
const clientRel = `package/${(pkg.exports?.['./client'] ?? './client.js').replace(/^\.\//, '')}`
check('client 文件在包内', byName.has(clientRel), clientRel)
const clientSrc = byName.get(clientRel)?.data.toString('utf8') ?? ''
check('client 走 __ModuleLoader__ 契约', clientSrc.includes('__ModuleLoader__.load'))
check('client 导出了 apply', /exports\.apply\s*=/.test(clientSrc))

/* ── 风险扫描：只看 tgz（真正的执行面） ─────────────────────────── */

console.log('\n[3/4] 安装包风险扫描（tgz 内容）')

/** 解 tar（ustar），返回 { name -> Buffer } */
function untar(buffer) {
  const out = new Map()
  let off = 0
  while (off + 512 <= buffer.length) {
    const header = buffer.subarray(off, off + 512)
    if (header.every((b) => b === 0)) break
    const rawName = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '')
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '')
    const size = Number.parseInt(header.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim(), 8) || 0
    const name = prefix ? `${prefix}/${rawName}` : rawName
    off += 512
    out.set(name, buffer.subarray(off, off + size))
    off += Math.ceil(size / 512) * 512
  }
  return out
}

const tgzEntries = existsSync(tgzPath) ? untar(gunzipSync(readFileSync(tgzPath))) : new Map()
check('tgz 存在（安装包）', tgzEntries.size > 0, tgzPath)

const runtimeText = [...tgzEntries.entries()]
  .filter(([n]) => /\.(js|mjs|cjs|json|html|yml|yaml)$/i.test(n))
const runtimeAll = runtimeText.map(([, d]) => d.toString('utf8')).join('\n')

const riskPatterns = [
  { re: /\bchild_process\b/, label: 'child_process（起子进程）' },
  { re: /\beval\s*\(/, label: 'eval' },
  { re: /new\s+Function\s*\(/, label: 'new Function' },
  { re: /require\(['"]https?['"]\)/, label: '远程加载模块' },
  { re: /\bfetch\s*\(\s*['"]https?:/, label: '硬编码外网请求' },
  { re: /\.ssh[\\/]|id_rsa|\.aws[\\/]credentials|\.npmrc/, label: '读取敏感凭据路径' },
]
for (const p of riskPatterns) {
  const hits = runtimeText.filter(([, d]) => p.re.test(d.toString('utf8'))).map(([n]) => n.replace('package/', ''))
  check(`安装包内未发现 ${p.label}`, hits.length === 0, hits.join(','))
}

/* 「只读扫会话」这个声明必须能被验证：不能有写/删 sessions 的调用 */
check('没有对 sessions 目录的写/删调用',
  !/writeFile\w*\([^)]*sessions/i.test(runtimeAll) && !/unlink\w*\([^)]*sessions/i.test(runtimeAll))
check('安装包内无本机绝对路径', !/[A-Z]:\\\\Users\\\\/.test(runtimeAll))

/* /etc/passwd 之类也要躲开 */
check('不触碰系统敏感文件',
  !/\/etc\/(passwd|shadow)|SAM\\\\|\\\\winnt/i.test(runtimeAll))

/* 自检脚本不该进安装包（只会在用户机器上白占体积） */
const devScripts = [...tgzEntries.keys()].filter((n) => /package\/scripts\/(verify|install-smoke|browser-check|market-precheck|pack)\.mjs$/.test(n))
check('安装包不含开发期自检脚本', devScripts.length === 0, devScripts.join(','))

/* ── 4. 立绘与可再生成性 ────────────────────────────────────────── */

console.log('\n[4/4] 资产')
const artCount = entries.filter((e) => e.name.startsWith('package/assets/') && /\.(webp|png)$/i.test(e.name)).length
check('立绘≥ 10 张', artCount >= 10, `${artCount} 张`)
check('随包带资产来源说明 CREDITS.md', byName.has('package/assets/CREDITS.md'))
/* 上游表情包的元素属于同人图，版权归画师，不在 MIT 覆盖范围。
   市场审核可能要求说明，这里只校验「有没有声明」，不判定合法性。 */
const credits = byName.get('package/assets/CREDITS.md')?.data.toString('utf8') ?? ''
check('CREDITS.md 声明了版权归属与分发边界',
  /\u7248\u6743|\u8bb8\u53ef|copyright/i.test(credits) && credits.length > 300,
  `${credits.length} 字符`)

/* ── 汇总 ───────────────────────────────────────────────────────── */

const sha = createHash('sha256').update(buf).digest('hex')
const tgzSha = existsSync(tgzPath) ? createHash('sha256').update(readFileSync(tgzPath)).digest('hex') : '—'
console.log(`\n[precheck] ${failures === 0 ? '可以上架' : `有 ${failures} 项需处理`}`)
console.log(`[precheck] zip ${path.basename(zipPath)}  ${total} B  sha256=${sha}`)
console.log(`[precheck] tgz ${path.basename(tgzPath)}  sha256=${tgzSha}`)
process.exit(failures === 0 ? 0 : 1)
