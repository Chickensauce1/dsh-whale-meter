/**
 * 真实浏览器验收：把面板页塞进一个 mock 的 /api 环境，用 Edge 无头跑起来，
 * 截图 + 抓 console 错误。
 *
 * 为什么需要这一层：语法检查全绿、JSON 结构断言全绿，面板照样可能整页白，
 * 因为崩在渲染阶段（某个 $('id') 返回 null、字段 undefined 被当对象读）。
 * 这里做的事就一件——**真的渲染一遍，看有没有报错、看画出来的东西对不对**。
 *
 * 用法：node scripts/browser-check.mjs [--keep]
 * 产物：dist/browser-check/*.png + console.log
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const outDir = path.join(root, 'dist', 'browser-check')
mkdirSync(outDir, { recursive: true })

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/microsoft-edge',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
]
const edge = EDGE_CANDIDATES.find((p) => existsSync(p))
if (!edge) {
  console.log('[browser-check] 找不到 Edge，跳过')
  process.exit(0)
}

/* ── 造一份有内容的快照，覆盖率优先：多供应商、有峰谷、有未定价 ───── */

const HOUR = 3_600_000
const now = Date.now()
const hourStart = Math.floor(now / HOUR) * HOUR - 23 * HOUR
const dayStart = now - 13 * 86_400_000

const totals = (o = {}) => ({
  requestCount: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
  reasoningTokens: 0, totalTokens: 0, cost: 0, unpriced: 0, unpricedTokens: 0, ...o,
})

const mockSnap = {
  currency: 'CNY',
  generatedAt: now,
  now,
  dayStart: now - HOUR * 6,
  monthStart: now - 86_400_000 * 12,
  mood: 'busy',
  pressure: 0.62,
  peakNow: true,
  windows: {
    today: totals({ requestCount: 128, inputTokens: 8_600_000, outputTokens: 1_240_000, cacheReadTokens: 3_100_000, totalTokens: 12_940_000, cost: 18.6637 }),
    month: totals({ requestCount: 4021, inputTokens: 220_000_000, outputTokens: 32_000_000, totalTokens: 252_000_000, cost: 402.11 }),
    last3h: totals({ requestCount: 12, totalTokens: 900_000, cost: 1.21 }),
    last12h: totals({ requestCount: 48, totalTokens: 4_200_000, cost: 6.02 }),
    last7d: totals({ requestCount: 1200, totalTokens: 88_000_000, cost: 141.7 }),
    last30d: totals({ requestCount: 4021, totalTokens: 252_000_000, cost: 402.11 }),
    all: totals({
      requestCount: 14_087, inputTokens: 900_000_000, outputTokens: 120_000_000,
      cacheReadTokens: 300_000_000, cacheWriteTokens: 0,
      totalTokens: 1_320_000_000, cost: 278.934, unpriced: 6, unpricedTokens: 8_400_000,
    }),
  },
  providers: [
    { provider: 'workbuddy', share: 0.71, totals: totals({ requestCount: 10_639, totalTokens: 940_000_000, cost: 229.76 }), models: [{ model: 'deepseek-v4.1-flash', totals: totals({ totalTokens: 900_000_000, cost: 220 }) }] },
    { provider: 'flash', share: 0.18, totals: totals({ requestCount: 2_642, totalTokens: 240_000_000, cost: 34.01 }), models: [{ model: 'deepseek-flash', totals: totals({ totalTokens: 240_000_000, cost: 34 }) }] },
    { provider: 'deepseek-official', share: 0.09, totals: totals({ requestCount: 560, totalTokens: 120_000_000, cost: 11.55 }), models: [] },
    { provider: 'workbuddyai', share: 0.02, totals: totals({ requestCount: 191, totalTokens: 20_000_000, cost: 3.6 }), models: [] },
  ],
  hourly: Array.from({ length: 24 }, (_, i) => ({
    startTime: hourStart + i * HOUR,
    tokens: Math.round(200_000 * (1 + Math.sin(i / 3))),
    cost: Number((Math.random() * 2).toFixed(4)),
    requests: Math.round(Math.random() * 9),
    peak: i > 8 && i < 16,
  })),
  daily: Array.from({ length: 14 }, (_, i) => ({
    startTime: dayStart + i * 86_400_000,
    tokens: Math.round(4_000_000 * (0.4 + Math.random())),
    cost: Number((Math.random() * 30).toFixed(4)),
    requests: Math.round(Math.random() * 200),
  })),
  topSessions: Array.from({ length: 6 }, (_, i) => ({
    id: `session-mock-${i}`,
    title: ['修插件白屏', '写课程论文', '抓评论脚本', null, '打包上架', '调 UI'][i],
    project: '--E-demo--',
    lastTime: now - i * HOUR,
    totals: totals({ requestCount: 30 - i * 4, totalTokens: 3_000_000 - i * 400_000, cost: Number((9 - i * 1.4).toFixed(2)) }),
  })),
  budget: {
    day: { spent: 18.6637, cap: 30, pct: 0.6221 },
    month: { spent: 402.11, cap: 70, pct: 5.7444 },
  },
  budgetCaps: { day: 30, month: 70 },
  unpricedModels: [
    { model: 'some-unknown-model', provider: 'provX', records: 4, tokens: 6_000_000 },
    { model: 'another-model', provider: 'provY', records: 2, tokens: 2_400_000 },
  ],
  health: {
    scannedFiles: 351, reparsedFiles: 351, lastScanAt: now - 45_000, scanMs: 11_807,
    firstScanDone: true, sessionsRoot: 'D:\\demo-home\\.dsh\\sessions', zstd: true, unreadable: 0,
  },
  pricing: { models: 28, intervals: ['09:00-12:00', '14:00-18:00'], weekendOffpeak: true },
}

/* ── 本地 http 服务：面板页 + 被 mock 的接口 ────────────────────── */

const server = createServer((req, res) => {
  const url = (req.url || '/').split('?')[0]
  if (url === '/' || url === '/whale-meter') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(readFileSync(path.join(root, 'panel.html')))
    return
  }
  if (url === '/api/whale-meter') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(mockSnap))
    return
  }
  if (url === '/api/whale-meter/config') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ currency: 'CNY', budget: { day: 30, month: 70 }, peakSchedule: { weekendOffpeak: true, intervals: [] }, pricing: {} }))
    return
  }
  if (url.startsWith('/whale-meter/art/')) {
    const name = url.slice('/whale-meter/art/'.length)
    const file = path.join(root, 'assets', path.basename(name))
    if (existsSync(file)) {
      res.writeHead(200, { 'content-type': 'image/svg+xml' })
      res.end(readFileSync(file))
      return
    }
  }
  res.writeHead(404); res.end()
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const pageUrl = `http://127.0.0.1:${port}/whale-meter`

/* ── 用 Edge 的 CDP 打开页面、抓 console、截图 ───────────────────── */

const PROFILE = mkdtempSync(path.join(tmpdir(), 'whale-ui-'))
const shots = []
let consoleErrors = []

async function run() {
  // 上一轮残留的 profile 会让 Edge 直接复用旧进程，DevToolsActivePort 里的端口已经失效
  // —— 表现就是偶发 "fetch failed"。开跑前先清干净。
  try { rmSync(PROFILE, { recursive: true, force: true }) } catch { /* 被占用就换个新目录 */ }

  const child = spawn(edge, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${PROFILE}`,
    '--window-size=1180,1500',
    pageUrl,
  ], { stdio: 'ignore' })

  // 从 DevToolsActivePort 拿调试端口（--remote-debugging-port=0 时由系统分配）
  const portFile = path.join(PROFILE, 'DevToolsActivePort')
  let devPort = null
  for (let i = 0; i < 150; i += 1) {
    if (existsSync(portFile)) {
      const txt = readFileSync(portFile, 'utf8').split('\n')
      if (txt[0] && Number(txt[0]) > 0) { devPort = Number(txt[0]); break }
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  if (!devPort) { child.kill(); throw new Error('拿不到 Edge 调试端口') }

  // 端口文件出现 ≠ HTTP 服务已就绪，必须轮询到真的能 /json/list
  let list = null
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${devPort}/json/list`)
      if (r.ok) { list = await r.json(); if (list.length) break }
    } catch { /* 还没起来 */ }
    await new Promise((r) => setTimeout(r, 150))
  }
  if (!list) { child.kill(); throw new Error(`连不上 Edge 调试端口 ${devPort}`) }

  const target = list.find((t) => t.type === 'page')
  if (!target) { child.kill(); throw new Error('没有 page target') }

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  const pending = new Map()
  let msgId = 0
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = ++msgId
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })

  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); return }
    if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
      const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ')
      consoleErrors.push(`[${msg.params.type}] ${text}`)
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails
      consoleErrors.push(`[exception] ${d.exception?.description || d.text}`)
    }
  }

  await send('Runtime.enable')
  await send('Page.enable')
  await send('Page.reload', { ignoreCache: true })

  // 轮询等面板真的画完（等 bigCost 有内容），不用固定 sleep
  let ready = false
  for (let i = 0; i < 80; i += 1) {
    await new Promise((r) => setTimeout(r, 150))
    const r = await send('Runtime.evaluate', {
      expression: `(function(){var e=document.getElementById('bigCost');return e?e.textContent:''})()`,
      returnByValue: true,
    })
    if (r?.result?.value && r.result.value !== '' && r.result.value !== '—') { ready = true; break }
  }

  // 结构断言：每个关键区块都真的渲染出了内容
  const probe = await send('Runtime.evaluate', {
    expression: `(function(){
      var q=function(id){var e=document.getElementById(id);return e?e.innerHTML.length:0};
      return JSON.stringify({
        bigCost: document.getElementById('bigCost').textContent,
        bigTok: document.getElementById('bigTok').textContent,
        bigReq: document.getElementById('bigReq').textContent,
        provRows: document.querySelectorAll('#provList .row').length,
        provSeg: document.querySelectorAll('#provSeg i').length,
        hourBars: document.querySelectorAll('#chartHour *').length,
        dayBars: document.querySelectorAll('#chartDay *').length,
        sessRows: document.querySelectorAll('#sessList .srow').length,
        winRows: document.querySelectorAll('#wins .win').length,
        artSrc: document.getElementById('artImg').src,
        artLoaded: document.getElementById('artImg').naturalWidth > 0,
        diagHidden: document.getElementById('diagNote').hidden,
        diagText: document.getElementById('diagNote').textContent,
        fRoot: document.getElementById('fRoot').textContent,
      })
    })()`,
    returnByValue: true,
  })
  const info = JSON.parse(probe.result.value)

  async function shot(name, opts = {}) {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, ...opts })
    const file = path.join(outDir, name)
    writeFileSync(file, Buffer.from(r.data, 'base64'))
    shots.push(file)
    return file
  }

  await shot('panel-full.png')

  // 面板滚到中段再拍一张，确认折线/柱状图区域真的成形
  await send('Runtime.evaluate', { expression: 'window.scrollTo(0, 760)' })
  await new Promise((r) => setTimeout(r, 400))
  await shot('panel-charts.png')

  ws.close()
  child.kill()
  return info
}

let info = null
let error = null
try {
  info = await run()
} catch (e) {
  error = e
}
server.close()

/* ── 判定 ────────────────────────────────────────────────────────── */

let failures = 0
const ok = (l, x) => console.log(`  ✓ ${l}${x ? ` — ${x}` : ''}`)
const bad = (l, x) => { failures += 1; console.error(`  ✗ ${l}${x ? ` — ${x}` : ''}`) }
const check = (l, c, x) => (c ? ok(l, x) : bad(l, x))

console.log('\n[browser-check]')
if (error) { bad('页面运行', error.message) } else {
  check('无 console 报错/异常', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
  check('今日费用已渲染', info.bigCost !== '—' && info.bigCost !== '', info.bigCost)
  check('token 数已渲染', info.bigTok.length > 0, info.bigTok)
  check('请求数已渲染', info.bigReq.length > 0, info.bigReq)
  check('供应商列表有行', info.provRows >= 4, `${info.provRows} 行`)
  check('供应商色条有段', info.provSeg >= 4, `${info.provSeg} 段`)
  check('小时折线已绘制', info.hourBars > 10, `${info.hourBars} 个元素`)
  check('日柱状已绘制', info.dayBars > 10, `${info.dayBars} 个元素`)
  check('会话榜有行', info.sessRows >= 5, `${info.sessRows} 行`)
  check('时间窗口有行', info.winRows >= 6, `${info.winRows} 行`)
  check('立绘真的加载了（不是 404）', info.artLoaded === true, info.artSrc)
  check('未定价告警显示出来了', info.diagHidden === false && info.diagText.includes('价目'),
    info.diagText.slice(0, 60))
  check('页脚显示真实数据目录', info.fRoot.includes('sessions'), info.fRoot)
}
console.log(`[browser-check] 截图 ${shots.length} 张 → ${outDir}`)

if (!process.argv.includes('--keep')) {
  try { rmSync(PROFILE, { recursive: true, force: true }) } catch { /* 占用中就算了 */ }
}

console.log(`\n${failures === 0 ? '通过' : `失败 ${failures} 项`}`)
process.exit(failures === 0 ? 0 : 1)
