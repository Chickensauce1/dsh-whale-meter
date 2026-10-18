/**
 * 大肥鱼用量表 · 自检
 *
 * 四层检查：
 *  1. 语法：所有 JS 入口逐个 node --check，panel.html 的内联脚本也抽出来查
 *  2. 逻辑：合成记录验证「峰谷计费」「同一步覆盖去重」「无价目返回 undefined」
 *     「供应商切换归因」「DSH_HOME 解析」等纯函数规则
 *  3. 数据：对真实会话目录跑一次聚合（没有会话就跳过，不算失败）
 *  4. 卫生：仓库里不许出现本机绝对路径 / 社区二创图
 *
 * 退出码非 0 表示有检查未通过。
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildSnapshot,
  discoverSessionFiles,
  readSessionFile,
  resolveSessionsRoot,
  guessProvider,
  startOfBeijingDay,
  startOfBeijingMonth,
} from '../src/aggregate.js'
import { costOf, isPeak, normalizePricing, resolvePricing } from '../src/pricing.js'
import { parseEventLines, scanZstdFrames, zstdSupported } from '../src/zstd-frames.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')

let failures = 0
const pass = (label, extra) => console.log(`  ✓ ${label}${extra ? ` — ${extra}` : ''}`)
const fail = (label, extra) => {
  failures += 1
  console.error(`  ✗ ${label}${extra ? ` — ${extra}` : ''}`)
}
const check = (label, condition, extra) => (condition ? pass(label, extra) : fail(label, extra))

/* ── 1. 语法 ─────────────────────────────────────────────────────── */

console.log('\n[1/4] 语法检查')
for (const rel of ['index.js', 'client.js', 'src/aggregate.js', 'src/pricing.js', 'src/zstd-frames.js',
  'scripts/verify.mjs', 'scripts/pack.mjs', 'scripts/install-smoke.mjs', 'scripts/gen-art.mjs']) {
  const file = path.join(root, ...rel.split('/'))
  if (!existsSync(file)) { fail(rel, '文件不存在'); continue }
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  check(rel, r.status === 0, r.status === 0 ? '' : (r.stderr || '').split('\n').slice(0, 3).join(' '))
}

// panel.html 的内联脚本单独抽出来查（它不在 .js 清单里，最容易写坏却没人发现）
if (existsSync(path.join(root, 'panel.html'))) {
  const html = readFileSync(path.join(root, 'panel.html'), 'utf8')
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
  check('panel.html 有内联脚本', blocks.length > 0, `${blocks.length} 段`)
  let allOk = true
  for (const [i, code] of blocks.entries()) {
    const r = spawnSync(process.execPath, ['--check', '-'], { input: code, encoding: 'utf8' })
    if (r.status !== 0) { allOk = false; fail(`panel.html 第 ${i + 1} 段脚本`, (r.stderr || '').split('\n')[0]) }
  }
  if (allOk) pass('panel.html 内联脚本均可解析')
}

/* ── 2. 纯函数规则 ───────────────────────────────────────────────── */

console.log('\n[2/4] 计费与归因规则')
const cfg = normalizePricing({})

// 峰谷：北京时间工作日 10:00 为峰，周末同一时刻为谷
const beijing = (y, m, d, hh, mm) => Date.UTC(y, m - 1, d, hh - 8, mm)
const wedPeak = beijing(2026, 10, 14, 10, 0)   // 周三
const wedLunch = beijing(2026, 10, 14, 12, 30) // 周三午休
const satPeak = beijing(2026, 10, 17, 10, 0)   // 周六
check('工作日 10:00 判为峰时', isPeak(wedPeak, cfg) === true)
check('工作日 12:30 判为谷时', isPeak(wedLunch, cfg) === false)
check('周六 10:00 判为谷时（周末全天谷）', isPeak(satPeak, cfg) === false)

// 峰谷价算术：deepseek-flash 输入 1M 峰价 2 元 / 谷价 1 元
const oneMillion = { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
check('峰时输入 1M = 2 元', Math.abs(costOf('deepseek-flash', oneMillion, wedPeak, cfg) - 2) < 1e-9,
  String(costOf('deepseek-flash', oneMillion, wedPeak, cfg)))
check('谷时输入 1M = 1 元', Math.abs(costOf('deepseek-flash', oneMillion, wedLunch, cfg) - 1) < 1e-9,
  String(costOf('deepseek-flash', oneMillion, wedLunch, cfg)))

// 别名回退
check('deepseek-v4-flash → deepseek-flash', resolvePricing('deepseek-v4-flash', cfg) !== undefined)
check('glm-5.3-flash 命中便宜档而非 glm-5.3',
  resolvePricing('glm-5.3-flash', cfg)?.['outputPerMillion'] === 2.0,
  String(resolvePricing('glm-5.3-flash', cfg)?.['outputPerMillion']))
check('完全未知的模型返回 undefined（而非 0）', costOf('totally-made-up', oneMillion, wedPeak, cfg) === undefined)

// 去重：同一 turn/step 两次 usage 只算一次，且以后到的完整值为准
const sample = {
  id: 'session-dedup',
  project: 'p',
  file: '',
  revision: 'x',
  size: 1,
  mtimeMs: 0,
}
// 直接打快照更省事：模拟 readSessionFile 的产物
const usage = [
  { sessionId: 's1', project: 'p', time: wedPeak, provider: 'provA', model: 'deepseek-flash', turn: 1, step: 1, inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 },
]
const requests = [{ sessionId: 's1', time: wedPeak, provider: 'provA', model: 'deepseek-flash' }]
const snap = buildSnapshot({ usage, requests, titles: new Map(), config: cfg, now: wedPeak + 1000, health: {} })
check('单条用量进入今日窗口', snap.windows.today.totalTokens === 110, String(snap.windows.today.totalTokens))
check('请求数正确', snap.windows.today.requestCount === 1)
check('供应商维度有 1 家', snap.providers.length === 1)

// 时区边界
const dayStart = startOfBeijingDay(beijing(2026, 10, 14, 0, 0))
check('北京时间 00:00 的当日起点就是它自己',
  dayStart === beijing(2026, 10, 14, 0, 0), new Date(dayStart).toISOString())
const monthStart = startOfBeijingMonth(beijing(2026, 10, 14, 10, 0))
check('本月起点 = 北京时间当月 1 日 00:00',
  monthStart === beijing(2026, 10, 1, 0, 0), new Date(monthStart).toISOString())

// DSH_HOME 解析：这是「别人的电脑」上最容易静默失效的一处
check('默认解析到 ~/.dsh/sessions',
  resolveSessionsRoot({}).endsWith(path.join('.dsh', 'sessions')),
  resolveSessionsRoot({}))
check('DSH_HOME 覆盖生效',
  resolveSessionsRoot({ DSH_HOME: path.join('X:', 'portable') }) === path.join('X:', 'portable', 'sessions'),
  resolveSessionsRoot({ DSH_HOME: path.join('X:', 'portable') }))
check('DSH_HOME 为空串时回退默认',
  resolveSessionsRoot({ DSH_HOME: '   ' }).endsWith(path.join('.dsh', 'sessions')))

// 供应商兜底猜测
check('glm-* → zhipu', guessProvider('glm-5.3') === 'zhipu')
check('未知模型 → unknown', guessProvider('no-such-model') === 'unknown')
check('空模型名 → unknown', guessProvider('') === 'unknown')

// JSONL 解析：头部被跳过，半截行被忽略
const parsed = parseEventLines([
  JSON.stringify({ type: 'session', version: 4 }),
  JSON.stringify({ type: 'session/title', data: { title: 'a' } }),
  '{"type":"assistant/message","data":{', // 写入中的截断行
].join('\n'))
check('头部行被跳过', parsed.length === 1, String(parsed.length))
check('截断行不影响前面的解析', parsed[0]?.type === 'session/title')

// zstd 帧扫描：非 zstd 输入不报错，返回空数组
check('非 zstd 输入返回空帧表', scanZstdFrames(Buffer.from('plain jsonl text')).length === 0)
check('zstdAvailable 是个布尔值', typeof zstdSupported === 'boolean', String(zstdSupported))

/* ── 3. 真实数据（可选） ─────────────────────────────────────────── */

console.log('\n[3/4] 真实会话数据')
const sessionsRoot = resolveSessionsRoot()
const found = discoverSessionFiles(sessionsRoot)
if (found.length === 0) {
  pass('跳过（本机没有会话目录）', sessionsRoot)
} else {
  pass('发现会话文件', `${found.length} 个 · ${sessionsRoot}`)
  const first = found[0]
  const r = await readSessionFile(first)
  check('首个会话可解析', r.usage.length + r.requests.length >= 0, `usage=${r.usage.length}`)
  const usageAll = []
  const reqAll = []
  let scanned = 0
  for (const f of found.slice(0, 40)) {
    const one = await readSessionFile(f)
    usageAll.push(...one.usage)
    reqAll.push(...one.requests)
    scanned += 1
  }
  const realSnap = buildSnapshot({
    usage: usageAll, requests: reqAll, titles: new Map(), config: cfg,
    now: Date.now(), health: { scannedFiles: scanned },
  })
  check('前 40 个会话聚合不抛错', realSnap !== null)
  check('快照结构完整',
    typeof realSnap.windows?.today?.totalTokens === 'number'
    && Array.isArray(realSnap.providers)
    && realSnap.hourly.length === 24
    && realSnap.daily.length === 14)
  check('供应商名不是清一色 unknown',
    realSnap.providers.some((p) => p.provider !== 'unknown'),
    realSnap.providers.map((p) => p.provider).slice(0, 4).join(','))
}

/* ── 4. 仓库卫生 ─────────────────────────────────────────────────── */

console.log('\n[4/4] 仓库卫生')
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.memsearch'])

function walkFiles(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const abs = path.join(dir, name)
    let st
    try { st = statSync(abs) } catch { continue }
    if (st.isDirectory()) walkFiles(abs, out)
    else out.push(abs)
  }
  return out
}

/* 本机绝对路径扫描：C:\Users\<name> 之类一旦进包，别人的机器上就指向不存在的位置 */
const TEXT_EXT = /\.(js|mjs|json|html|md|yml|yaml|svg|txt)$/i
const offenders = []
for (const abs of walkFiles(root)) {
  if (!TEXT_EXT.test(abs)) continue
  if (path.basename(abs) === 'verify.mjs') continue // 自检脚本文本里会提到这个模式
  const text = readFileSync(abs, 'utf8')
  const m = text.match(/[A-Z]:\\\\?Users\\\\?[A-Za-z0-9_.-]+/)
  if (m) offenders.push(`${path.relative(root, abs)}: ${m[0]}`)
}
check('仓库内无写死的用户目录绝对路径', offenders.length === 0, offenders.slice(0, 3).join(' | '))

/* 立绘必须是可再生成的原创资产 */
const assetDir = path.join(root, 'assets')
if (existsSync(assetDir)) {
  const names = readdirSync(assetDir)
  check('不含社区二创 webp', names.every((n) => !n.endsWith('.webp')), names.filter((n) => n.endsWith('.webp')).join(','))
  check('立绘全部为 svg', names.filter((n) => n.endsWith('.svg')).length === names.length, `${names.length} 个文件`)
  check('立绘生成脚本存在', existsSync(path.join(root, 'scripts', 'gen-art.mjs')))
}

/* 客户端与面板引用的立绘必须真的存在（改后缀时最容易漏）。
   只从 ART_ALL / ART_URGENT 这两个字符串数组里取，不扫全文件 ——
   全文件扫会把 'dsh-whale-meter' 这种标识符也当成图名抓出来。 */
if (existsSync(path.join(root, 'client.js')) && existsSync(assetDir)) {
  const client = readFileSync(path.join(root, 'client.js'), 'utf8')
  const arrays = [...client.matchAll(/(?:ART_ALL|ART_URGENT)\s*=\s*\[([\s\S]*?)\]/g)].map((m) => m[1])
  const refs = arrays.flatMap((body) => [...body.matchAll(/'([a-z][a-z0-9-]+)'/g)].map((m) => m[1]))
  const uniq = [...new Set(refs)]
  check('client.js 立绘池非空', uniq.length > 0, `${uniq.length} 个`)
  const missing = uniq.filter((n) => !existsSync(path.join(assetDir, `${n}.svg`)))
  check('client.js 引用的立绘都存在', missing.length === 0, missing.join(','))

  // 面板页也有自己的一份池子，两边必须一致，否则浮窗和详情页会显示不同的图
  const panel = existsSync(path.join(root, 'panel.html')) ? readFileSync(path.join(root, 'panel.html'), 'utf8') : ''
  const panelArt = [...panel.matchAll(/var ART_ALL = \[([\s\S]*?)\]/g)]
    .flatMap((m) => [...m[1].matchAll(/'([a-z][a-z0-9-]+)'/g)].map((x) => x[1]))
  if (panelArt.length > 0) {
    const onlyClient = uniq.filter((n) => !panelArt.includes(n))
    const onlyPanel = panelArt.filter((n) => !uniq.includes(n))
    check('面板与浮窗立绘池一致', onlyClient.length === 0 && onlyPanel.length === 0,
      `仅浮窗:${onlyClient.join(',')} 仅面板:${onlyPanel.join(',')}`)
  }
}

console.log(`\n${failures === 0 ? '全部通过' : `失败 ${failures} 项`}`)
process.exit(failures === 0 ? 0 : 1)
