/**
 * 价目定制界面的端到端验证。
 *
 * 为什么要单独跑：这块是「用户自己填折扣」的唯一入口，
 * 填不进去 / 填了不生效 / 保存一次把别的配置抹掉，都是灾难。
 * 而这三类问题静态检查全都看不出来，必须真的点、真的读盘、真的重算。
 *
 * 覆盖：
 *   1. 打开配置区，供应商列表与我配过的 provider 对得上
 *   2. 改一个倍率 → 保存 → 落盘 → 快照金额按倍率变化
 *   3. 移除一条倍率 → 不再出现在 json 里
 *   4. 改模型单价 → 保存 → 生效
 *   5. 「恢复默认」把倍率清空
 *   6. 保存不会误删 cacheWritePerMillion 这类界面上没暴露的字段
 *
 * 用法：node scripts/pricing-ui-check.mjs [--keep]
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const outDir = path.join(root, 'dist', 'browser-check')
const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/microsoft-edge',
].find((p) => existsSync(p))
if (!EDGE) { console.log('[pricing-ui] 找不到 Edge，跳过'); process.exit(0) }

let failures = 0
const pass = (l, x) => console.log(`  ✓ ${l}${x ? ` — ${x}` : ''}`)
const fail = (l, x) => { failures += 1; console.error(`  ✗ ${l}${x ? ` — ${x}` : ''}`) }
const check = (l, c, x) => (c ? pass(l, x) : fail(l, x))

/* ── 用一个独立 DSH_HOME，绝不碰用户真实配置 ────────────────────── */

const fakeHome = mkdtempSync(path.join(tmpdir(), 'whale-cfg-home-'))
process.env.DSH_HOME = fakeHome
const cfgPath = path.join(fakeHome, 'whale-meter-pricing.json')

/* 造一份带 workbuddy 用量的会话，让界面有数据可看 */
const sessDir = path.join(fakeHome, 'sessions', 'demo', 'session-cfg')
await import('node:fs').then((fs) => fs.mkdirSync(sessDir, { recursive: true }))
const now = Date.now()
// 用「今天的峰时」，否则用量落不进 windows.today，界面金额永远是 0。
const nowBj = new Date(Date.now() + 8 * 3600_000)
const peakT = Date.UTC(nowBj.getUTCFullYear(), nowBj.getUTCMonth(), nowBj.getUTCDate(), 10, 0) - 8 * 3600_000   // 周三 10:00 北京 = 峰时
writeFileSync(path.join(sessDir, 'session.v4.jsonl'), [
  JSON.stringify({ type: 'session', version: 4, id: 'session-cfg', cwd: '/x' }),
  JSON.stringify({ type: 'model/selection', time: peakT, data: { provider: 'workbuddy', model: 'deepseek-v4-pro' } }),
  JSON.stringify({ type: 'assistant/message', time: peakT, data: { turn: 1, step: 1, message: {}, usage: { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0 } } }),
].join('\n'), 'utf8')

/* ── 起真插件 + 真 HTTP ────────────────────────────────────────── */

const mod = await import(pathToFileURL(path.join(root, 'index.js')).href)
const routes = []
const disposers = []
const ctx = {
  inject(_d, fn) { fn(ctx) },
  effect(fn) { const d = fn(); if (typeof d === 'function') disposers.push(d); return d },
  webServer: { register(r) { routes.push(r); return () => {} } },
}
mod.apply(ctx)

const server = createServer((req, res) => {
  const pathname = (req.url || '/').split('?')[0]
  let hit = routes.find((r) => r.kind === 'exact' && r.path === pathname)
  if (!hit) {
    hit = routes.filter((r) => r.kind === 'prefix' && pathname.startsWith(r.path + '/'))
      .sort((a, b) => b.path.length - a.path.length)[0]
  }
  if (!hit) { res.writeHead(404); res.end('no route'); return }
  hit.handler(req, res)
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port
const base = `http://127.0.0.1:${port}`

/* ── 起 Edge，把面板页塞进去 ──────────────────────────────────── */

const pageForBrowser = (() => {
  // 让面板页同源访问真实接口：直接打开 /whale-meter
  return `${base}/whale-meter`
})()

const PROFILE = mkdtempSync(path.join(tmpdir(), 'whale-cfg-prof-'))
const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--remote-debugging-port=0', `--user-data-dir=${PROFILE}`,
  '--window-size=1200,1600', pageForBrowser,
], { stdio: 'ignore' })

let devPort = null
const portFile = path.join(PROFILE, 'DevToolsActivePort')
for (let i = 0; i < 150; i += 1) {
  if (existsSync(portFile)) {
    const t = readFileSync(portFile, 'utf8').split('\n')
    if (t[0] && Number(t[0]) > 0) { devPort = Number(t[0]); break }
  }
  await new Promise((r) => setTimeout(r, 100))
}
if (!devPort) { child.kill(); throw new Error('拿不到调试端口') }

let list = null
for (let i = 0; i < 60; i += 1) {
  try {
    const r = await fetch(`http://127.0.0.1:${devPort}/json/list`)
    if (r.ok) { list = await r.json(); if (list.length) break }
  } catch { /* 等 */ }
  await new Promise((r) => setTimeout(r, 150))
}
const target = list.find((t) => t.type === 'page')

const ws = new WebSocket(target.webSocketDebuggerUrl)
const pending = new Map()
let msgId = 0
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++msgId
  pending.set(id, resolve)
  ws.send(JSON.stringify({ id, method, params }))
})
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
const errs = []
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return }
  if (m.method === 'Runtime.exceptionThrown') {
    errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)
  }
}
await send('Runtime.enable')
await send('Page.enable')

const evalJson = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval failed')
  return JSON.parse(r.result.value)
}

// 等面板首屏渲染完
for (let i = 0; i < 80; i += 1) {
  const v = await evalJson(`JSON.stringify({v:(document.getElementById('bigCost')||{}).textContent||''})`)
  if (v.v && v.v !== '—') break
  await new Promise((r) => setTimeout(r, 150))
}

console.log('\n[pricing-ui]')
check('页面无 JS 异常', errs.length === 0, errs.slice(0, 2).join(' | '))

/* ── 1. 打开配置区 ─────────────────────────────────────────────── */

await send('Runtime.evaluate', {
  expression: `document.getElementById('btnCfg').click()`,
})
await new Promise((r) => setTimeout(r, 700))

const opened = await evalJson(`(function(){
  var p = document.getElementById('cfgPanel');
  var rows = document.querySelectorAll('#priceRows tr[data-model]');
  var multis = document.querySelectorAll('#multList .mrow');
  var named = Array.from(document.querySelectorAll('#multList .mrow .pn')).map(function(e){ return e.textContent });
  return JSON.stringify({
    open: p.classList.contains('open'),
    priceRowCount: rows.length,
    multRowCount: multis.length,
    multNames: named,
    hasAddMult: !!document.getElementById('btnAddMult'),
    hasAddModel: !!document.getElementById('btnAddModel'),
    hasReset: !!document.getElementById('btnReset'),
    hasSearch: !!document.getElementById('fModelSearch'),
  });
})()`)

check('配置区已展开', opened.open === true)
check('价目表渲染出行', opened.priceRowCount > 10, `${opened.priceRowCount} 行`)
check('供应商列表渲染', opened.multRowCount > 0, `${opened.multRowCount} 项：${opened.multNames.join(',')}`)
check('有「新增供应商」输入', opened.hasAddMult === true)
check('有「新增模型」输入', opened.hasAddModel === true)
check('有「恢复默认」按钮', opened.hasReset === true)
check('有模型搜索框', opened.hasSearch === true)

/* ── 2. 设 workbuddy = 0.8 倍率 ────────────────────────────────── */

const before = await evalJson(`(function(){
  var rows = document.querySelectorAll('#priceRows tr[data-model]');
  for (var i=0;i<rows.length;i++){
    if (rows[i].getAttribute('data-model')==='deepseek-v4-pro'){
      var el = rows[i].querySelector('input[data-tier="peak"][data-key="uncachedInputPerMillion"]');
      return JSON.stringify({ peakInput: el.value });
    }
  }
  return JSON.stringify({ peakInput: null });
})()`)
check('deepseek-v4-pro 峰时输入价 = 9', Number(before.peakInput) === 9, String(before.peakInput))

// 填倍率
await send('Runtime.evaluate', {
  expression: `(function(){
    var name = document.getElementById('fMultName');
    var val = document.getElementById('fMultVal');
    // workbuddy 可能已在列表里（未配置态），先确保有条目
    var rows = Array.from(document.querySelectorAll('#multList .mrow'));
    var found = rows.find(function(r){
      var pn = r.querySelector('.pn');
      return pn && pn.textContent === 'workbuddy';
    });
    if (found) {
      var btn = found.querySelector('button');
      if (btn && btn.textContent === '配置') btn.click();
    } else {
      name.value = 'workbuddy'; val.value = '0.8';
      document.getElementById('btnAddMult').click();
    }
  })()`,
})
await new Promise((r) => setTimeout(r, 400))

// 设置数值
await send('Runtime.evaluate', {
  expression: `(function(){
    var rows = Array.from(document.querySelectorAll('#multList .mrow'));
    var found = rows.find(function(r){ var pn=r.querySelector('.pn'); return pn && pn.textContent==='workbuddy'; });
    if (!found) return;
    var inp = found.querySelector('input');
    inp.value = '0.8';
    inp.dispatchEvent(new Event('input', {bubbles:true}));
  })()`,
})
await new Promise((r) => setTimeout(r, 300))

const multState = await evalJson(`(function(){
  var rows = Array.from(document.querySelectorAll('#multList .mrow'));
  var found = rows.find(function(r){ var pn=r.querySelector('.pn'); return pn && pn.textContent==='workbuddy'; });
  return JSON.stringify({ val: found ? found.querySelector('input').value : null,
    eff: found ? found.querySelector('.eff').textContent : null });
})()`)
check('倍率输入框接受 0.8', multState.val === '0.8', String(multState.val))
check('倍率有可读说明', /80%/.test(multState.eff || ''), String(multState.eff))

/* ── 3. 保存 → 落盘 → 金额变化 ─────────────────────────────────── */

const costBefore = await evalJson(`JSON.stringify({c:document.getElementById('bigCost').textContent})`)

await send('Runtime.evaluate', { expression: `document.getElementById('btnSave').click()` })
await new Promise((r) => setTimeout(r, 1800))

check('配置文件已生成', existsSync(cfgPath), cfgPath)
let saved = {}
try { saved = JSON.parse(readFileSync(cfgPath, 'utf8')) } catch { /* 下面断言会失败 */ }
check('落盘含 providerMultipliers', typeof saved.providerMultipliers === 'object')
check('workbuddy 倍率写入 = 0.8',
  saved.providerMultipliers && saved.providerMultipliers.workbuddy === 0.8,
  JSON.stringify(saved.providerMultipliers && saved.providerMultipliers.workbuddy))

// 重新拉快照，验证金额按倍率变化
const snapAfter = await (await fetch(`${base}/api/whale-meter?force=1`)).json()
const wb = snapAfter.providers.find((p) => p.provider === 'workbuddy')
const wbCost = wb ? wb.totals.cost : null
// 峰时 1M 输入 × 9 元 = 9 元；×0.8 = 7.2 元
check('金额按 0.8 倍率算出 7.2', Math.abs((wbCost ?? 0) - 7.2) < 0.01, String(wbCost))

const costAfter = await evalJson(`JSON.stringify({c:document.getElementById('bigCost').textContent})`)
check('界面金额随之更新', costAfter.c !== costBefore.c, `${costBefore.c} → ${costAfter.c}`)

/* ── 4. cacheWritePerMillion 不被误删 ──────────────────────────── */

const writeback = await evalJson(`(async function(){
  var r = await fetch('/api/whale-meter/config');
  var c = await r.json();
  return JSON.stringify({
    hasModel: !!c.pricing['claude-opus-4.5'],
    cw: c.pricing['claude-opus-4.5'] ? c.pricing['claude-opus-4.5'].cacheWritePerMillion : null,
  });
})()`)
check('界面上没暴露的 cacheWrite 字段被保留',
  writeback.cw !== null && writeback.cw !== undefined, String(writeback.cw))

/* ── 5. 移除倍率 ───────────────────────────────────────────────── */

await send('Runtime.evaluate', {
  expression: `(function(){
    var rows = Array.from(document.querySelectorAll('#multList .mrow'));
    var found = rows.find(function(r){ var pn=r.querySelector('.pn'); return pn && pn.textContent==='workbuddy'; });
    if (found) { var del = found.querySelector('.del'); if (del) del.click(); }
  })()`,
})
await new Promise((r) => setTimeout(r, 300))
await send('Runtime.evaluate', { expression: `document.getElementById('btnSave').click()` })
await new Promise((r) => setTimeout(r, 1500))

saved = {}
try { saved = JSON.parse(readFileSync(cfgPath, 'utf8')) } catch { /* ignore */ }
check('移除后 workbuddy 不再在倍率表里',
  !(saved.providerMultipliers && 'workbuddy' in saved.providerMultipliers),
  JSON.stringify(saved.providerMultipliers))

const snapBack = await (await fetch(`${base}/api/whale-meter?force=1`)).json()
const wb2 = snapBack.providers.find((p) => p.provider === 'workbuddy')
check('金额回到 9 元（官方价）', Math.abs((wb2 ? wb2.totals.cost : 0) - 9) < 0.01, String(wb2 && wb2.totals.cost))

/* ── 6. 改模型单价 ─────────────────────────────────────────────── */

await send('Runtime.evaluate', {
  expression: `(function(){
    var rows = document.querySelectorAll('#priceRows tr[data-model]');
    for (var i=0;i<rows.length;i++){
      if (rows[i].getAttribute('data-model')==='deepseek-v4-pro'){
        var el = rows[i].querySelector('input[data-tier="peak"][data-key="uncachedInputPerMillion"]');
        el.value = '18';
        el.dispatchEvent(new Event('input', {bubbles:true}));
        return;
      }
    }
  })()`,
})
await new Promise((r) => setTimeout(r, 300))
await send('Runtime.evaluate', { expression: `document.getElementById('btnSave').click()` })
await new Promise((r) => setTimeout(r, 1500))

const snapPrice = await (await fetch(`${base}/api/whale-meter?force=1`)).json()
const wb3 = snapPrice.providers.find((p) => p.provider === 'workbuddy')
check('单价改成 18 后金额 = 18', Math.abs((wb3 ? wb3.totals.cost : 0) - 18) < 0.01, String(wb3 && wb3.totals.cost))

/* ── 7. 截图 ───────────────────────────────────────────────────── */

// 只截配置区本身：把上方图表藏掉，并把 max-height 放开，
// 这样截图能一次看全所有配置项，不会因为 70vh 的滚动边界被切。
await send('Runtime.evaluate', {
  expression: `(function(){
    var container = document.getElementById('cfgPanel').parentElement;
    Array.prototype.forEach.call(container.children, function (k) {
      if (k.id !== 'cfgPanel') k.style.display = 'none';
    });
    var cfg = document.getElementById('cfgPanel');
    cfg.style.maxHeight = 'none';
    cfg.style.overflow = 'visible';
    window.scrollTo(0, 0);
  })()`,
})
await new Promise((r) => setTimeout(r, 500))
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
const file = path.join(outDir, 'pricing-ui.png')
writeFileSync(file, Buffer.from(shot.data, 'base64'))
console.log(`\n[pricing-ui] 截图 → ${file}`)

/* ── 收尾 ──────────────────────────────────────────────────────── */

ws.close()
child.kill()
server.close()
for (const d of disposers) { try { d() } catch { /* ignore */ } }
if (!process.argv.includes('--keep')) {
  try { rmSync(fakeHome, { recursive: true, force: true }) } catch { /* ignore */ }
  try { rmSync(PROFILE, { recursive: true, force: true }) } catch { /* ignore */ }
}

console.log(`\n${failures === 0 ? '通过' : `失败 ${failures} 项`}`)
process.exit(failures === 0 ? 0 : 1)
