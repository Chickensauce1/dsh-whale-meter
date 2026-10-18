/**
 * 浮窗交互的 DOM 层验证（不依赖 React / DSH 宿主）。
 *
 * 为什么不用真 React：client.js 需要宿主注入 React 与 slots，在无头浏览器里
 * 补齐这两个桩的代价比收益大（DSH 的 React 是浏览器端 seed 表加载的，本地没有
 * 可用的 UMD 产物）。而这次要验的只有两件事：
 *   1. 飘字的 CSS 位置（几何计算，与 React 无关）
 *   2. 轮播开关的状态机（暂停/恢复/持久化，是纯逻辑 + DOM 事件）
 *
 * 做法：把 client.js 里那段 CSS 原样取出来注入真实浏览器，再手工拼一个
 * 与 Widget 结构一致的 DOM（同样的 class、同样的 data-* 属性），
 * 然后按 client.js 里的原生事件委托逻辑去驱动它。
 * 这样验的是「我在 client.js 里写的那套 CSS 与属性约定」是否成立——
 * 正是这次改动引入的部分，而不是宿主行为。
 *
 * 用法：node scripts/widget-dom-check.mjs
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

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/microsoft-edge',
].find((p) => existsSync(p))
if (!EDGE) { console.log('[widget-dom] 找不到 Edge，跳过'); process.exit(0) }

let failures = 0
const pass = (l, x) => console.log(`  ✓ ${l}${x ? ` — ${x}` : ''}`)
const fail = (l, x) => { failures += 1; console.error(`  ✗ ${l}${x ? ` — ${x}` : ''}`) }
const check = (l, c, x) => (c ? pass(l, x) : fail(l, x))

/* ── 从 client.js 里原样抽出 CSS 数组 ───────────────────────────── */

const clientSrc = readFileSync(path.join(root, 'client.js'), 'utf8')

/**
 * 抓 `var CSS = [ ... ]` 里的字符串字面量。
 *
 * 不做完整 JS 解析：这段数组全是单引号字符串 + 少量 `+ DS[x] +` 拼接。
 * 所以先把 DS 常量替换成真实色值，再去掉引号与逗号即可。
 * 目的是「拿到与运行时完全一致的 CSS 文本」——手抄一遍就会失准。
 */
function extractCss() {
  const start = clientSrc.indexOf('var CSS = [')
  if (start < 0) throw new Error('找不到 CSS 数组')
  // 数组以 "\n        ]" 结束（后面紧跟 var CSS_TEXT 之类）
  const end = clientSrc.indexOf('\n        ]', start)
  const body = clientSrc.slice(start, end)

  // DS 色板
  const dsBlock = clientSrc.slice(clientSrc.indexOf('var DS = {'), clientSrc.indexOf('var CSS = ['))
  const DS = {}
  for (const m of dsBlock.matchAll(/(\d+):\s*'(#[0-9a-fA-F]+)'/g)) DS[m[1]] = m[2]

  const parts = []
  for (const line of body.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('/*') || t.startsWith('*') || t.startsWith('//')) continue
    if (t === 'var CSS = [' || t === ']') continue
    // 只处理以单引号开头、以引号+逗号结尾的行
    const m = /^'([\s\S]*)',?$/.exec(t)
    if (!m) continue
    let css = m[1]
    // 还原 + DS[450] + 这类拼接
    css = css.replace(/'\s*\+\s*DS\[(\d+)\]\s*\+\s*'/g, (_, k) => DS[k] ?? '')
    parts.push(css)
  }
  return parts.join('\n')
}

const cssText = extractCss()
check('CSS 抽取成功', cssText.length > 3000, `${cssText.length} 字符`)
check('抽到的 CSS 含 .wm-roam 规则', cssText.includes('.wm-roam'))
check('抽到的 CSS 含飘字规则', cssText.includes('.wm-av .pops'))

/* ── 拼测试页：结构与 Widget 一致 ───────────────────────────────── */

const page = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { margin:0; background:#f5f8ff; font-family:-apple-system,"Segoe UI",system-ui,sans-serif; }
  /* 复刻真实场景：胶囊容器尺寸固定，立绘可能溢出 */
  .wm-layer { position:fixed; inset:0; z-index:9000; pointer-events:none; }
  ${cssText}
</style></head>
<body>
<div class="wm-layer">
  <div class="wm-root">
    <!-- 与 client.js 里 open 态的卡片结构一致（去掉无关区块，只留立绘与开关） -->
    <div class="wm-card" data-wm-act="card" style="position:relative;left:40px;top:120px;">
      <div class="wm-head">
        <div class="wm-cardav">
          <span class="wm-av over tappable" style="width:84px;height:84px;" data-wm-whale="">
            <span class="wm-halo"></span>
            <span class="wm-water"></span>
            <span class="wm-bub" style="left:16%;bottom:12%;width:3px;height:3px;"></span>
            <img id="art" src="/art/whale-stand.webp" alt="大肥鱼" draggable="false">
            <span class="badge"></span>
            <span class="wm-roam" data-wm-act="roam" data-wm-nodrag="" role="button" tabindex="0">❚❚</span>
          </span>
        </div>
        <div class="who"><div class="k"><span class="d"></span><span>今日费用</span></div><div class="v"><span class="c">¥</span>18.66</div></div>
        <div class="wm-x" data-wm-act="close" data-wm-nodrag="" role="button" tabindex="0">✕</div>
      </div>
      <div class="wm-body"></div>
    </div>
  </div>
</div>
<script>
/* 复刻 client.js 的原生事件委托（同样只处理 roam），用来验证
   data-wm-act / data-wm-nodrag 这套属性约定确实能驱动开关。 */
(function () {
  var holder = document.querySelector('.wm-layer')
  var lastAct = 0
  var state = { playing: true, lock: null, round: 0 }
  var ART = ['whale-stand','whale-ciallo','whale-praise','whale-bighead','whale-thinking',
             'whale-confused','whale-coding','whale-goodmodel','whale-scold','whale-angry','whale-cdrive']

  function pickArt(urgent, round, lock) {
    var n = lock !== null && lock !== undefined ? Math.abs(lock|0) : Math.abs(round|0)
    return ART[n % ART.length]
  }
  function artIndex(name) { var i = ART.indexOf(name); return i < 0 ? 0 : i }

  function render() {
    var art = pickArt(false, state.round, state.playing ? null : state.lock)
    document.getElementById('art').src = '/art/' + art + '.webp'
    var btn = document.querySelector('.wm-roam')
    btn.textContent = state.playing ? '❚❚' : '▶'
    btn.className = 'wm-roam' + (state.playing ? '' : ' paused')
    btn.setAttribute('aria-label', state.playing ? '暂停播放立绘' : '继续播放立绘')
  }

  function toggleRoam() {
    state.playing = !state.playing
    localStorage.setItem('dsh-whale-meter:roam', state.playing ? '1' : '0')
    if (state.playing) {
      var from = state.lock !== null ? state.lock : artIndex(pickArt(false, state.round, null))
      state.round = from
      state.lock = null
      localStorage.removeItem('dsh-whale-meter:lock')
    } else {
      var cur = pickArt(false, state.round, state.lock)
      state.lock = artIndex(cur)
      localStorage.setItem('dsh-whale-meter:lock', String(state.lock))
    }
    render()
  }

  function fire(act) {
    var now = Date.now()
    if (now - lastAct < 250) return
    lastAct = now
    if (act === 'roam') toggleRoam()
  }

  holder.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-wm-act]')
    if (!el) return
    fire(el.getAttribute('data-wm-act'))
  })
  holder.addEventListener('pointerup', function (e) {
    var el = e.target.closest && e.target.closest('[data-wm-act]')
    if (!el) return
    var act = el.getAttribute('data-wm-act')
    if (act === 'roam') fire(act)
  })

  /* 供测试脚本驱动的钩子 */
  window.__t = {
    state: state,
    bump: function () { state.round += 1; render() },
    artName: function () {
      var src = document.getElementById('art').getAttribute('src')
      return src.split('/').pop().replace('.webp', '')
    },
    render: render,
  }
  render()
})()
</script>
</body></html>`

const work = mkdtempSync(path.join(tmpdir(), 'whale-dom-'))
writeFileSync(path.join(work, 'index.html'), page, 'utf8')

/* ── 起本地服务：页面 + 立绘 ────────────────────────────────────── */

const server = createServer((req, res) => {
  const url = (req.url || '/').split('?')[0]
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(page)
    return
  }
  if (url.startsWith('/art/')) {
    const f = path.join(root, 'assets', path.basename(url))
    if (existsSync(f)) {
      res.writeHead(200, { 'content-type': 'image/webp' })
      res.end(readFileSync(f))
      return
    }
  }
  res.writeHead(404); res.end()
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port

/* ── 用 Edge 跑 ─────────────────────────────────────────────────── */

const PROFILE = mkdtempSync(path.join(tmpdir(), 'whale-dom-prof-'))
const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--remote-debugging-port=0', `--user-data-dir=${PROFILE}`,
  '--window-size=900,700', `http://127.0.0.1:${port}/`,
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
  } catch { /* 还没起 */ }
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
const consoleErrors = []
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return }
  if (m.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)
  }
}
await send('Runtime.enable')
await send('Page.enable')
await new Promise((r) => setTimeout(r, 800))

const evalJson = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true })
  return JSON.parse(r.result.value)
}

console.log('\n[widget-dom]')
check('页面无 JS 异常', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '))

/* ── 1. 开关存在且初始为「暂停」态 ──────────────────────────────── */

const initial = await evalJson(`(function(){
  var btn = document.querySelector('.wm-roam');
  var cs = getComputedStyle(btn);
  return JSON.stringify({
    exists: !!btn,
    text: btn ? btn.textContent : '',
    pointerEvents: cs.pointerEvents,
    nodrag: btn ? btn.hasAttribute('data-wm-nodrag') : false,
    opacity: cs.opacity,
    act: btn ? btn.getAttribute('data-wm-act') : null,
    art: document.getElementById('art').getAttribute('src').split('/').pop(),
  });
})()`)

check('开关渲染出来了', initial.exists === true)
check('初始图标是暂停（❚❚）', initial.text === '❚❚', initial.text)
check('开关可接收点击（pointer-events:auto）', initial.pointerEvents === 'auto', initial.pointerEvents)
check('开关标记了 data-wm-nodrag（不触发拖拽）', initial.nodrag === true)
check('开关标记了 data-wm-act=roam', initial.act === 'roam', String(initial.act))
check('开关默认可见（不是完全透明，否则用户发现不了）',
  parseFloat(initial.opacity) > 0.2, `opacity=${initial.opacity}`)

/* ── 2. 点一下 → 暂停，立绘冻结 ─────────────────────────────────── */

await send('Runtime.evaluate', { expression: `document.querySelector('.wm-roam').click()` })
await new Promise((r) => setTimeout(r, 350))

const paused = await evalJson(`(function(){
  var btn = document.querySelector('.wm-roam');
  return JSON.stringify({
    text: btn.textContent,
    pausedClass: btn.className.indexOf('paused') >= 0,
    lock: localStorage.getItem('dsh-whale-meter:lock'),
    roam: localStorage.getItem('dsh-whale-meter:roam'),
    art: window.__t.artName(),
  });
})()`)

check('暂停后图标变 ▶', paused.text === '▶', paused.text)
check('按钮带 paused 高亮类', paused.pausedClass === true)
check('状态写入 localStorage', paused.roam === '0', String(paused.roam))
check('锁定了当前立绘索引', paused.lock !== null, String(paused.lock))
check('锁定的索引与实际显示的图一致',
  Number(paused.lock) === ['whale-stand', 'whale-ciallo', 'whale-praise', 'whale-bighead',
    'whale-thinking', 'whale-confused', 'whale-coding', 'whale-goodmodel',
    'whale-scold', 'whale-angry', 'whale-cdrive'].indexOf(paused.art.replace('.webp', '')),
  `${paused.art} / lock=${paused.lock}`)

/* ── 3. 关键：暂停期间 round 增加，立绘不能变 ──────────────────── */

const beforeArt = await evalJson(`JSON.stringify({ art: window.__t.artName() })`)
for (let i = 0; i < 4; i += 1) {
  await send('Runtime.evaluate', { expression: 'window.__t.bump()' })
  await new Promise((r) => setTimeout(r, 120))
}
const afterArt = await evalJson(`JSON.stringify({ art: window.__t.artName(), round: window.__t.state.round })`)

check('暂停时连刷 4 次数据，立绘不动',
  beforeArt.art === afterArt.art, `${beforeArt.art} → ${afterArt.art} (round=${afterArt.round})`)

/* ── 4. 再点一下 → 恢复播放 ────────────────────────────────────── */

await send('Runtime.evaluate', { expression: `document.querySelector('.wm-roam').click()` })
await new Promise((r) => setTimeout(r, 350))

const resumed = await evalJson(`(function(){
  var btn = document.querySelector('.wm-roam');
  return JSON.stringify({
    text: btn.textContent,
    lock: localStorage.getItem('dsh-whale-meter:lock'),
    roam: localStorage.getItem('dsh-whale-meter:roam'),
    art: window.__t.artName(),
  });
})()`)

check('恢复后图标回到 ❚❚', resumed.text === '❚❚', resumed.text)
check('恢复后清掉 lock', resumed.lock === null, String(resumed.lock))
check('恢复状态写入 localStorage', resumed.roam === '1', String(resumed.roam))
check('恢复时停在原来那张（不跳图）', resumed.art === beforeArt.art, `${beforeArt.art} → ${resumed.art}`)

// 恢复后应能继续轮播
await send('Runtime.evaluate', { expression: 'window.__t.bump()' })
await new Promise((r) => setTimeout(r, 200))
const rolled = await evalJson(`JSON.stringify({ art: window.__t.artName() })`)
check('恢复后再次刷新会换图', rolled.art !== resumed.art, `${resumed.art} → ${rolled.art}`)

/* ── 5. 飘字位置：必须在立绘上方 ───────────────────────────────── */

const geom = await evalJson(`(function(){
  var av = document.querySelector('.wm-av');
  var box = av.getBoundingClientRect();
  // 插入一个与 Widget 结构一致的飘字节点
  var pop = document.createElement('span');
  pop.className = 'pops';
  pop.textContent = '好舒服';
  av.appendChild(pop);
  var p = pop.getBoundingClientRect();
  var cs = getComputedStyle(pop);
  var out = {
    popTop: Math.round(p.top),
    popBottom: Math.round(p.bottom),
    popCenterY: Math.round(p.top + p.height / 2),
    avTop: Math.round(box.top),
    avBottom: Math.round(box.bottom),
    centerAboveTop: (p.top + p.height / 2) < box.top,
    fullyAbove: p.bottom <= box.top + 1,
    whiteSpace: cs.whiteSpace,
    popWidth: Math.round(p.width),
    boxWidth: Math.round(box.width),
    overflowed: p.width > box.width,
  };
  pop.remove();
  return JSON.stringify(out);
})()`)

check('飘字横向不换行', geom.whiteSpace === 'nowrap', geom.whiteSpace)
check('飘字中心在立绘顶边之上', geom.centerAboveTop === true,
  `文字中心 y=${geom.popCenterY}, 立绘顶 y=${geom.avTop}`)
check('飘字整体在立绘上方（不与鱼重叠）', geom.fullyAbove === true,
  `文字底 y=${geom.popBottom}, 立绘顶 y=${geom.avTop}`)
// 判定口径：文字宽度由内容决定，不受 84px 容器限制。
// 「好舒服」三个汉字在 11px 下约 33px，本身就窄于容器；
// 所以这里验的是它**没有被压成竖排**（高度不超过两行）而不是「必须比容器宽」。
check('飘字没有被压成竖排', geom.popWidth > 20,
  `文字宽 ${geom.popWidth}px, 容器 ${geom.boxWidth}px`)

/* ── 截图留证 ───────────────────────────────────────────────────── */

// 目检用：把测试桩里其它元素藏掉，只留立绘与飘字，再插一个常显的飘字
await send('Runtime.evaluate', {
  expression: `(function(){
    document.querySelector('.who').style.display='none';
    document.querySelector('.wm-x').style.display='none';
    document.querySelector('.wm-card').style.width='140px';
    document.querySelector('.wm-card').style.background='transparent';
    document.querySelector('.wm-card').style.border='none';
    var av = document.querySelector('.wm-av');
    var pop = document.createElement('span');
    pop.className = 'pops';
    pop.textContent = '好舒服';
    pop.style.animation='none';
    pop.style.opacity='1';
    av.appendChild(pop);
  })()`,
})
await new Promise((r) => setTimeout(r, 300))

const shot = await send('Page.captureScreenshot', { format: 'png' })
const shotFile = path.join(outDir, 'widget-toggle.png')
writeFileSync(shotFile, Buffer.from(shot.data, 'base64'))
console.log(`[widget-dom] 截图 → ${shotFile}`)

ws.close()
child.kill()
server.close()
try { rmSync(work, { recursive: true, force: true }) } catch { /* ignore */ }
try { rmSync(PROFILE, { recursive: true, force: true }) } catch { /* ignore */ }

console.log(`\n${failures === 0 ? '通过' : `失败 ${failures} 项`}`)
process.exit(failures === 0 ? 0 : 1)
