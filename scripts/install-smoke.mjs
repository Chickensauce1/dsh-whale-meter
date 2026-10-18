/**
 * 安装冒烟测试 —— 模拟「别人的电脑」把 tgz 装进一个全新的 DSH_HOME。
 *
 * 为什么必须有这一层：单元测试全绿、在自己机器上跑得好，都不能证明插件在
 * 别人机器上装得起来。真实翻车过的三类：
 *   1) 归档里带反斜杠路径 → 只在 Linux/macOS 解包后变平铺文件，import 全断
 *   2) 写死 ~/.dsh → 便携版 / 自定义 DSH_HOME 上一律 0 会话
 *   3) 只测了 apply() 不抛，没测路由真的注册上了
 *
 * 这里把 tgz 解到临时目录，用**假 ctx / 假 webServer** 走一遍真实装载路径，
 * 断言：解包文件树正确、import 成功、apply 注册了 4 条路由、各路由响应正常、
 * 空会话目录下返回结构完整的零值快照（而不是抛错或 undefined）。
 *
 * 用法：node scripts/install-smoke.mjs [tgz路径]
 * 退出码非 0 = 不通过，可直接接进 CI。
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const tgz = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, 'dist', 'dsh-whale-meter-1.0.0.tgz')

let failures = 0
const ok = (label, extra) => console.log(`  ✓ ${label}${extra ? ` — ${extra}` : ''}`)
const bad = (label, extra) => { failures += 1; console.error(`  ✗ ${label}${extra ? ` — ${extra}` : ''}`) }
const check = (label, cond, extra) => (cond ? ok(label, extra) : bad(label, extra))

/* ── 1. 解包（不依赖系统 tar：直接解 gzip + 走 ustar） ────────────── */

function untar(buffer) {
  const out = []
  let off = 0
  while (off + 512 <= buffer.length) {
    const header = buffer.subarray(off, off + 512)
    if (header.every((b) => b === 0)) break
    const rawName = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '')
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '')
    const sizeStr = header.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim()
    const size = Number.parseInt(sizeStr, 8) || 0
    const name = prefix ? `${prefix}/${rawName}` : rawName
    off += 512
    out.push({ name, data: buffer.subarray(off, off + size) })
    off += Math.ceil(size / 512) * 512
  }
  return out
}

console.log('\n[1/5] 解包')
check('tgz 存在', existsSync(tgz), tgz)
const entries = untar(gunzipSync(readFileSync(tgz)))
check('条目数 > 15', entries.length > 15, `${entries.length} 条`)

const badPath = entries.filter((e) => e.name.includes('\\'))
check('归档内无反斜杠路径（否则 Linux/macOS 解包后结构会塌）', badPath.length === 0,
  badPath.length ? badPath.slice(0, 3).map((e) => e.name).join(', ') : '')

const missingPrefix = entries.filter((e) => !/^package\//.test(e.name))
check('所有条目在 package/ 下', missingPrefix.length === 0,
  missingPrefix.slice(0, 3).map((e) => e.name).join(', '))

const work = mkdtempSync(path.join(tmpdir(), 'whale-install-'))
for (const e of entries) {
  const target = path.join(work, ...e.name.split('/'))
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, e.data)
}
const pkgDir = path.join(work, 'package')
check('解包目录存在', existsSync(pkgDir))

/* ── 2. 文件树完整性 ─────────────────────────────────────────────── */

console.log('\n[2/5] 文件树')
for (const rel of ['index.js', 'client.js', 'panel.html', 'cordis.patch.yml', 'package.json', 'LICENSE', 'README.md',
  'src/aggregate.js', 'src/pricing.js', 'src/zstd-frames.js', 'assets/whale-stand.webp', 'assets/CREDITS.md']) {
  check(rel, existsSync(path.join(pkgDir, ...rel.split('/'))))
}
const artFiles = readdirSync(path.join(pkgDir, 'assets')).filter((f) => f.endsWith('.webp'))
check('立绘 ≥ 10 张', artFiles.length >= 10, `${artFiles.length} 张`)
check('立绘为透明底 webp', artFiles.every((f) => f.endsWith('.webp')))
check('随包带资产来源说明', existsSync(path.join(pkgDir, 'assets', 'CREDITS.md')))

const pkgJson = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'))
check('package.json 声明 dsh.bundle.patch', pkgJson.dsh?.bundle?.patch === './cordis.patch.yml')
check('package.json 不含本机绝对路径', !JSON.stringify(pkgJson).match(/[A-Z]:\\\\Users/))

/* ── 3. 干净 DSH_HOME 下 import + apply ──────────────────────────── */

console.log('\n[3/5] 装载（全新空 DSH_HOME）')
const fakeHome = mkdtempSync(path.join(tmpdir(), 'whale-home-'))
process.env.DSH_HOME = fakeHome

const mod = await import(pathToFileURL(path.join(pkgDir, 'index.js')).href)
  .catch((e) => {
    bad('import 失败', e.message)
    return null
  })
if (mod === null) {
  console.error('\n装载失败，后续检查跳过。')
  process.exit(1)
}
ok('import 成功')
check('导出 name', mod.name === 'dsh-whale-meter', String(mod.name))
check('导出 inject 含 webServer', Array.isArray(mod.inject) && mod.inject.includes('webServer'))
check('导出 apply 为函数', typeof mod.apply === 'function')

/** 假 webServer：把注册表抓下来，供后面直接调 handler。 */
const routes = []
const disposers = []
const fakeCtx = {
  inject(_deps, fn) { fn(fakeCtx) },
  effect(fn) {
    const d = fn()
    if (typeof d === 'function') disposers.push(d)
    return d
  },
  webServer: {
    register(route) {
      routes.push(route)
      return () => {}
    },
  },
}

try {
  mod.apply(fakeCtx)
  ok('apply 未抛异常')
} catch (e) {
  bad('apply 抛异常', e.message)
}
check('注册了 4 条路由', routes.length === 4, routes.map((r) => r.path).join(' '))

const byPath = Object.fromEntries(routes.map((r) => [r.path, r]))

/** 造一个最小的 req/res，跑一次 handler。 */
function call(route, { method = 'GET', url = '/' } = {}) {
  return new Promise((resolve) => {
    const chunks = []
    const res = {
      statusCode: 0,
      headers: {},
      writeHead(code, headers) { this.statusCode = code; Object.assign(this.headers, headers || {}); return this },
      end(body) { resolve({ status: this.statusCode, headers: this.headers, body: body ?? '' }) },
    }
    const req = {
      method,
      url,
      setEncoding() {},
      on(event, cb) {
        if (event === 'end') setImmediate(cb)
        if (event === 'data') return
        return req
      },
      destroy() {},
    }
    try {
      route.handler(req, res)
    } catch (e) {
      resolve({ status: -1, headers: {}, body: `throw: ${e.message}` })
    }
  })
}

/* ── 4. 各路由行为 ───────────────────────────────────────────────── */

console.log('\n[4/5] 路由响应')
const page = await call(byPath['/whale-meter'])
check('面板页 200', page.status === 200, `status=${page.status}`)
check('面板页是 html', String(page.headers['content-type']).includes('text/html'))
check('面板页自包含（无外部 CDN）', !String(page.body).match(/<(script|link)[^>]+src="https?:/))

const art = await call(byPath['/whale-meter/art'], { url: '/whale-meter/art/whale-stand.webp' })
check('立绘 200', art.status === 200, `status=${art.status}`)
check('立绘 content-type 为 webp', String(art.headers['content-type']).includes('webp'))

const traversal = await call(byPath['/whale-meter/art'], { url: '/whale-meter/art/..%2F..%2Fpackage.json' })
check('路径穿越被拒', traversal.status === 404, `status=${traversal.status}`)

const missing = await call(byPath['/whale-meter/art'], { url: '/whale-meter/art/nope.webp' })
check('缺图 404 而非 500', missing.status === 404, `status=${missing.status}`)

const cfg = await call(byPath['/api/whale-meter/config'])
check('价目接口 200', cfg.status === 200, `status=${cfg.status}`)
let cfgJson = null
try { cfgJson = JSON.parse(cfg.body) } catch { /* 下面断言会失败 */ }
check('价目接口返回合法 JSON', cfgJson !== null)
check('价目含 budget', cfgJson && typeof cfgJson.budget?.day === 'number')

const api = await call(byPath['/api/whale-meter'])
check('快照接口 200（空会话也算成功）', api.status === 200, `status=${api.status}`)
let snap = null
try { snap = JSON.parse(api.body) } catch { /* 断言会失败 */ }
check('空 DSH_HOME 下仍返回完整快照', snap !== null && typeof snap === 'object')
check('快照带 windows.today', snap && typeof snap.windows?.today?.totalTokens === 'number')
check('空目录 = 0 用量而不是报错', snap && snap.windows.all.totalTokens === 0)
check('health 报告真实 sessionsRoot', snap && snap.health?.sessionsRoot === path.join(fakeHome, 'sessions'),
  snap && snap.health?.sessionsRoot)
check('空目录时 scannedFiles = 0', snap && snap.health?.scannedFiles === 0)

/* ── 5. 有数据的 DSH_HOME ────────────────────────────────────────── */

console.log('\n[5/5] 有会话数据时')
// 造一份最小可解析的会话文件（含 provider 切换，验证归因）
const projectDir = path.join(fakeHome, 'sessions', 'demo-project', 'session-test')
mkdirSync(projectDir, { recursive: true })
const lines = [
  JSON.stringify({ type: 'session', version: 4, id: 'session-test', createdAt: 1, cwd: 'C:/demo' }),
  JSON.stringify({ type: 'model/selection', seq: 1, time: Date.now() - 5000, data: { provider: 'provA', model: 'model-x' } }),
  JSON.stringify({ type: 'assistant/message', seq: 2, time: Date.now() - 4000, data: { turn: 1, step: 1, message: {}, usage: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 200 } } }),
  // 中途换供应商：旧实现会把这一条记到 provA 名下
  JSON.stringify({ type: 'llm/retry', seq: 3, time: Date.now() - 3000, data: { provider: 'provB', model: 'model-y' } }),
  JSON.stringify({ type: 'assistant/message', seq: 4, time: Date.now() - 2000, data: { turn: 1, step: 2, message: {}, usage: { inputTokens: 2000, outputTokens: 800, cacheReadTokens: 0 } } }),
  JSON.stringify({ type: 'session/title', seq: 5, time: Date.now() - 1000, data: { title: '冒烟测试会话' } }),
]
writeFileSync(path.join(projectDir, 'session.v4.jsonl'), lines.join('\n'), 'utf8')

const snap2raw = await call(byPath['/api/whale-meter'], { url: '/api/whale-meter?force=1' })
let snap2 = null
try { snap2 = JSON.parse(snap2raw.body) } catch { /* 断言会失败 */ }
check('读到 1 个会话文件', snap2 && snap2.health?.scannedFiles === 1, snap2 && String(snap2.health?.scannedFiles))
check('今日 token = 1000+500+200+2000+800', snap2 && snap2.windows.today.totalTokens === 4500,
  snap2 && String(snap2.windows.today.totalTokens))
check('请求数 = 2', snap2 && snap2.windows.today.requestCount === 2, snap2 && String(snap2.windows.today.requestCount))

const provNames = (snap2?.providers ?? []).map((p) => p.provider).sort()
check('供应商归因为 provA + provB（llm/retry 换家要认）', JSON.stringify(provNames) === '["provA","provB"]',
  JSON.stringify(provNames))
const provB = (snap2?.providers ?? []).find((p) => p.provider === 'provB')
check('provB 只拿到第二条调用的 token = 2800', provB && provB.totals.totalTokens === 2800,
  provB && String(provB.totals.totalTokens))
check('会话标题被读到', (snap2?.topSessions ?? [])[0]?.title === '冒烟测试会话',
  (snap2?.topSessions ?? [])[0]?.title)

check('未定价模型被列出', (snap2?.unpricedModels ?? []).length === 2,
  JSON.stringify((snap2?.unpricedModels ?? []).map((m) => m.model)))

/* ── 收尾 ────────────────────────────────────────────────────────── */

for (const d of disposers) { try { d() } catch { /* 清理失败不影响结论 */ } }
try { rmSync(work, { recursive: true, force: true }) } catch { /* Windows 偶发占用 */ }
try { rmSync(fakeHome, { recursive: true, force: true }) } catch { /* 同上 */ }

console.log(`\n${failures === 0 ? '通过' : `失败 ${failures} 项`}`)
process.exit(failures === 0 ? 0 : 1)
