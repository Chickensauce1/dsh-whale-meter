/**
 * 打包脚本：产出一份可直接上架市场的发行物。
 *
 * 为什么手写 tar/zip 而不用系统命令：
 *  - Windows 自带的是 bsdtar，不认 `--sort` / `--owner=0`，打出来的包每次 mtime 都不同；
 *  - `npm pack` 会跑 prepack、按 .npmignore 猜文件，产物不可控；
 *  - Compress-Archive 在 PowerShell 5.1 上对 UTF-8 文件名会乱码。
 * 手写之后：uid/gid/mtime 全部归零、条目按名字排序、gzip mtime 取 0，
 * 于是**同一份源码在任何机器上打出来的 tgz 字节完全一致**，sha256 才有核对价值。
 *
 * 产物：
 *   dist/<name>-<version>.tgz      安装器用（根目录 package/）
 *   dist/<name>-<version>.zip      市场上传口用（只收 zip）
 *   dist/MANIFEST.json             逐文件 + 产物哈希
 *
 * 用法：node scripts/pack.mjs [--out 目录]
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const outIdx = process.argv.indexOf('--out')
const outDir = outIdx > -1 ? path.resolve(process.argv[outIdx + 1]) : path.join(root, 'dist')

/**
 * 打进 tgz 的路径白名单 —— **只放运行时真正需要的东西**。
 *
 * 自检脚本（verify / install-smoke / browser-check）刻意不放进来，原因有二：
 *  1. 它们只用 `node:child_process` 跑 `node --check` 与启动无头浏览器，
 *     装到用户机器上纯属多余；而市场审核的静态扫描看到 child_process
 *     就要人肉确认一遍，白白拉长审核。
 *  2. 用户机器上未必有 Edge，跑不起来的脚本放在包里只会制造困惑。
 * 它们在仓库里照旧可跑（zip 里有），只是不进安装包。
 */
const INCLUDE = [
  'index.js',
  'client.js',
  'panel.html',
  'cordis.patch.yml',
  'package.json',
  'README.md',
  'LICENSE',
  'src',
  'assets',
]

/** 只进 zip，不进 tgz（仓库里该有，安装器用不上）。 */
const ZIP_ONLY = ['scripts/pack.mjs', 'scripts/browser-check.mjs', 'scripts/verify.mjs',
  'scripts/install-smoke.mjs', 'scripts/live-serve-check.mjs', 'scripts/widget-dom-check.mjs', 'scripts/bubble-position-check.mjs', 'scripts/pricing-ui-check.mjs',
  'scripts/market-precheck.mjs', 'scripts/harness.html',
  'scripts/gen-art.mjs', 'tools/push-via-api.mjs', 'docs/MARKET-SUBMISSION.md',
  'KNOWN-GAPS.md', '.gitignore']

/* ── 文件清单 ────────────────────────────────────────────────────── */

function walk(rel, out) {
  const abs = path.join(root, rel)
  if (!existsSync(abs)) throw new Error(`打包清单里的路径不存在：${rel}`)
  if (statSync(abs).isFile()) { out.push(rel); return out }
  for (const name of readdirSync(abs).sort()) walk(path.join(rel, name), out)
  return out
}

/**
 * 归档路径一律用正斜杠。
 *
 * 这是最容易在「别人的电脑」上炸的一处：Node 的 path.join 在 Windows 上产出
 * `src\aggregate.js`，直接塞进 tar/zip 后，Windows 解压正常（它两种分隔符都认），
 * 而 Linux/macOS 会把整个反斜杠串当成**一个文件名**，于是展开后是根目录下一个
 * 叫 `src\aggregate.js` 的文件，`import './src/aggregate.js'` 直接 ENOENT。
 * 插件只在非 Windows 上坏 —— 最难在自己机器上发现的一类 bug。
 */
const toPosix = (p) => p.split(path.sep).join('/')

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

/* ── 最小 tar（ustar）writer ─────────────────────────────────────── */

function octal(value, width) {
  // tar 的数值字段：width-1 位八进制 + NUL
  return value.toString(8).padStart(width - 1, '0') + '\0'
}

function tarHeader({ name, size, mode = 0o644, type = '0' }) {
  const buf = Buffer.alloc(512, 0)
  // ustar 把长路径拆成 prefix(155) + name(100)
  let prefix = ''
  let shortName = name
  if (Buffer.byteLength(name) > 100) {
    const cut = name.lastIndexOf('/', name.length - 1)
    if (cut < 0) throw new Error(`路径过长且无法拆分：${name}`)
    prefix = name.slice(0, cut)
    shortName = name.slice(cut + 1)
    if (Buffer.byteLength(shortName) > 100 || Buffer.byteLength(prefix) > 155) {
      throw new Error(`路径超过 ustar 上限：${name}`)
    }
  }
  buf.write(shortName, 0, 100, 'utf8')
  buf.write(octal(mode, 8), 100, 8, 'ascii')
  buf.write(octal(0, 8), 108, 8, 'ascii')          // uid = 0
  buf.write(octal(0, 8), 116, 8, 'ascii')          // gid = 0
  buf.write(octal(size, 12), 124, 12, 'ascii')
  buf.write(octal(0, 12), 136, 12, 'ascii')        // mtime = 0（1970）→ 可复现
  buf.write('        ', 148, 8, 'ascii')           // checksum 先填空格
  buf.write(type, 156, 1, 'ascii')
  buf.write('ustar\0', 257, 6, 'ascii')
  buf.write('00', 263, 2, 'ascii')
  buf.write('root', 265, 32, 'ascii')
  buf.write('root', 297, 32, 'ascii')
  buf.write(octal(0, 8), 329, 8, 'ascii')          // devmajor
  buf.write(octal(0, 8), 337, 8, 'ascii')          // devminor
  buf.write(prefix, 345, 155, 'utf8')
  // checksum = 所有字节之和，写成 6 位八进制 + NUL + 空格
  let sum = 0
  for (const byte of buf) sum += byte
  buf.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii')
  return buf
}

function tarOf(entries) {
  const chunks = []
  for (const entry of entries) {
    const data = entry.data
    chunks.push(tarHeader({ name: entry.name, size: data.length, mode: entry.mode ?? 0o644 }))
    chunks.push(data)
    const pad = (512 - (data.length % 512)) % 512
    if (pad > 0) chunks.push(Buffer.alloc(pad, 0))
  }
  chunks.push(Buffer.alloc(1024, 0)) // 两个全零块收尾
  return Buffer.concat(chunks)
}

/* ── 最小 zip writer（deflate + UTF-8 名） ───────────────────────── */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0 ^ -1
  for (const byte of buf) c = (c >>> 8) ^ CRC_TABLE[(c ^ byte) & 0xff]
  return (c ^ -1) >>> 0
}

function zipOf(entries) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8')
    const raw = entry.data
    const deflated = zlib.deflateRawSync(raw, { level: 9 })
    // 压不下去就存原文，避免体积反而变大
    const useDeflate = deflated.length < raw.length
    const payload = useDeflate ? deflated : raw
    const method = useDeflate ? 8 : 0
    const crc = crc32(raw)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)             // version needed
    local.writeUInt16LE(0x0800, 6)         // bit 11 = UTF-8 文件名
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(0, 10)             // mod time → 0，可复现
    local.writeUInt16LE(0x0021, 12)        // mod date = 1980-01-01
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(payload.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, nameBuf, payload)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)           // version made by
    central.writeUInt16LE(20, 6)           // version needed
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0x0021, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(payload.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)           // external attrs
    central.writeUInt32LE(offset, 42)
    centrals.push(central, nameBuf)

    offset += local.length + nameBuf.length + payload.length
  }
  const centralBuf = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)
  return Buffer.concat([...locals, centralBuf, eocd])
}

/* ── 主流程 ──────────────────────────────────────────────────────── */

const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
mkdirSync(outDir, { recursive: true })

const files = []
for (const rel of INCLUDE) walk(rel, files)
files.sort()

const entries = files.map((rel) => ({
  name: `package/${toPosix(rel)}`,
  data: readFileSync(path.join(root, rel)),
}))

// gzip 的 header mtime 固定为 0，OS 字节也不写平台信息 → 跨平台字节一致
const tarBuf = tarOf(entries)
const gz = zlib.gzipSync(tarBuf, { level: 9 })
// Node 的 gzip 输出在 offset 4..8 是 mtime，9 是 XFL，10 是 OS；显式抹平
gz[4] = 0; gz[5] = 0; gz[6] = 0; gz[7] = 0; gz[9] = 3

const tgzName = `${pkg.name}-${pkg.version}.tgz`
const tgzPath = path.join(outDir, tgzName)
writeFileSync(tgzPath, gz)

// zip：tgz 内容 + zip-only 的几项
const zipEntries = [...entries]
for (const rel of ZIP_ONLY) {
  const abs = path.join(root, rel)
  if (!existsSync(abs)) continue
  zipEntries.push({ name: `package/${toPosix(rel)}`, data: readFileSync(abs) })
}
zipEntries.sort((a, b) => a.name.localeCompare(b.name))
const zipName = `${pkg.name}-${pkg.version}.zip`
const zipPath = path.join(outDir, zipName)
writeFileSync(zipPath, zipOf(zipEntries))

const manifest = {
  name: pkg.name,
  version: pkg.version,
  generatedAt: new Date().toISOString(),
  reproducible: '同源码重复打包 sha256 一致（mtime/uid/gid 归零、条目排序）',
  artifacts: {},
  files: entries.map((e) => ({
    path: e.name.replace(/^package\//, ''),
    bytes: e.data.length,
    sha256: sha256(e.data),
  })),
}
for (const [key, p] of [['tgz', tgzPath], ['zip', zipPath]]) {
  const buf = readFileSync(p)
  manifest.artifacts[key] = { file: path.basename(p), bytes: buf.length, sha256: sha256(buf) }
}
writeFileSync(path.join(outDir, 'MANIFEST.json'), JSON.stringify(manifest, null, 2), 'utf8')

console.log(`[pack] ${entries.length} files → ${outDir}`)
for (const [key, a] of Object.entries(manifest.artifacts)) {
  console.log(`[pack] ${key.padEnd(3)} ${a.file.padEnd(30)} ${String(a.bytes).padStart(8)} B  sha256=${a.sha256}`)
}
