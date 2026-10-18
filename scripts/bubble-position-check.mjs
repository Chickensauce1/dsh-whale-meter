/**
 * 飘字位置的「真相」测试：同时覆盖胶囊态与卡片态，并留真实截图。
 *
 * 为什么单独做这一个：
 *  前几轮我只测了卡片态（84px 立绘、有独立列布局），得到「在上方」的结论，
 *  但胶囊态是另一套布局——.wm-pill 只有 34px 高，立绘 58px 且 absolute
 *  top:-11px 探出边界。两种态的几何完全不同，必须分别验。
 *  而且「被压在下面」有两种可能：几何重叠（位置不对）与层叠覆盖（z-index 不对），
 *  两者都要测，不能只看 rect。
 *
 * 用法：node scripts/bubble-position-check.mjs
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
if (!EDGE) { console.log('[bubble] 找不到 Edge，跳过'); process.exit(0) }

let failures = 0
const pass = (l, x) => console.log(`  ✓ ${l}${x ? ` — ${x}` : ''}`)
const fail = (l, x) => { failures += 1; console.error(`  ✗ ${l}${x ? ` — ${x}` : ''}`) }
const check = (l, c, x) => (c ? pass(l, x) : fail(l, x))

/* ── 抽取真实 CSS（与 client.js 完全一致，不手抄） ─────────────── */

const clientSrc = readFileSync(path.join(root, 'client.js'), 'utf8')

function extractCss() {
  const start = clientSrc.indexOf('var CSS = [')
  const end = clientSrc.indexOf('\n        ]', start)
  const body = clientSrc.slice(start, end)
  const dsBlock = clientSrc.slice(clientSrc.indexOf('var DS = {'), start)
  const DS = {}
  for (const m of dsBlock.matchAll(/(\d+):\s*'(#[0-9a-fA-F]+)'/g)) DS[m[1]] = m[2]
  const parts = []
  for (const line of body.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('/*') || t.startsWith('*') || t.startsWith('//')) continue
    if (t === 'var CSS = [' || t === ']') continue
    const m = /^'([\s\S]*)',?$/.exec(t)
    if (!m) continue
    parts.push(m[1].replace(/'\s*\+\s*DS\[(\d+)\]\s*\+\s*'/g, (_, k) => DS[k] ?? ''))
  }
  return parts.join('\n')
}

const cssText = extractCss()

/* ── 两种态的 DOM：结构与 client.js 渲染结果一致 ────────────────── */

const page = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;background:#eef3fb;
    font-family:-apple-system,"Segoe UI",system-ui,sans-serif;}
  /* 复刻宿主的浮层容器：零尺寸、不吃事件 */
  .wm-layer{position:fixed;inset:0;z-index:9000;pointer-events:none;}
  ${cssText}

  /* 测试辅助：把两种态并排摆开，方便一张图看全 */
  #stage{position:fixed;inset:0;}
  #pillBox{position:absolute;left:60px;top:260px;}
  #cardBox{position:absolute;left:320px;top:120px;}
  .label{position:absolute;font-size:11px;color:#6b8bab;}
</style></head>
<body>
<div class="wm-layer"><div class="wm-root" id="stage">

  <!-- ── 胶囊态：.wm-pill 34px 高，立绘 58px absolute 探出 ── -->
  <div id="pillBox">
    <div class="label" style="left:0;top:-24px;">胶囊态（34px / 立绘 58px）</div>
    <div class="wm-pill" data-wm-act="pill" style="position:relative;right:auto;bottom:auto;">
      <span class="wm-av over tappable breathe" id="avPill"
            style="width:58px;height:58px;" data-wm-whale="">
        <span class="wm-halo"></span>
        <span class="wm-water"></span>
        <img src="/art/whale-stand.webp" alt="大肥鱼" draggable="false">
        <span class="badge"></span>
      </span>
      <span class="val">¥18.66</span>
      <span class="rule"></span>
      <span class="tok">12.9M</span>
    </div>
  </div>

  <!-- ── 卡片态：84px 立绘，头部左侧独立列 ── -->
  <div id="cardBox">
    <div class="label" style="left:0;top:-24px;">卡片态（84px 立绘）</div>
    <div class="wm-card" data-wm-act="card" style="position:relative;right:auto;bottom:auto;">
      <div class="topbar"></div>
      <div class="wm-head">
        <div class="wm-cardav">
          <span class="wm-av over tappable breathe" id="avCard"
                style="width:84px;height:84px;" data-wm-whale="">
            <span class="wm-halo"></span>
            <span class="wm-water"></span>
            <img src="/art/whale-stand.webp" alt="大肥鱼" draggable="false">
            <span class="badge"></span>
            <span class="wm-roam" data-wm-act="roam" data-wm-nodrag="">❚❚</span>
          </span>
        </div>
        <div class="who">
          <div class="k"><span class="d"></span><span>峰时 · 今日费用</span></div>
          <div class="v"><span class="c">¥</span>18.66</div>
        </div>
        <div class="wm-x" data-wm-act="close">✕</div>
      </div>
      <div class="wm-body" style="height:60px;"></div>
    </div>
  </div>

</div></div>

<script>
/* 给两个态的立绘各插一个常显飘字，然后量几何与层叠。
   飘字的动画关掉、opacity 拉满，这样截图能看清它到底在哪。 */
window.__probe = function (avId) {
  var av = document.getElementById(avId);
  var old = av.querySelector('.pops');
  if (old) old.remove();
  var pop = document.createElement('span');
  pop.className = 'pops';
  pop.textContent = '好舒服';
  pop.style.animation = 'none';
  pop.style.opacity = '1';
  av.appendChild(pop);
  return pop;
};

window.__measure = function (avId) {
  var av = document.getElementById(avId);
  var img = av.querySelector('img');
  var pop = av.querySelector('.pops');
  if (!pop) return JSON.stringify({ error: 'no popup' });

  var a = av.getBoundingClientRect();
  var i = img.getBoundingClientRect();
  var p = pop.getBoundingClientRect();
  var popCs = getComputedStyle(pop);
  var imgCs = getComputedStyle(img);
  var avCs = getComputedStyle(av);

  /* 层叠判定：不看 z-index 数字，直接命中测试。
     .wm-layer 是 pointer-events:none，所以 elementFromPoint 会穿透；
     临时把 av 打开事件接收，才能测到真实覆盖关系。 */
  var savedPE = av.style.pointerEvents;
  av.style.pointerEvents = 'auto';
  var hits = [];
  for (var k = 1; k <= 5; k++) {
    var x = p.left + p.width * k / 6;
    var y = p.top + p.height / 2;
    var el = document.elementFromPoint(x, y);
    hits.push(el ? (el.id || el.className || el.tagName) : 'null');
  }
  av.style.pointerEvents = savedPE;

  return JSON.stringify({
    avRect: { top: Math.round(a.top), bottom: Math.round(a.bottom), h: Math.round(a.height) },
    imgRect: { top: Math.round(i.top), bottom: Math.round(i.bottom), h: Math.round(i.height) },
    popRect: { top: Math.round(p.top), bottom: Math.round(p.bottom), h: Math.round(p.height), w: Math.round(p.width) },
    popTopCss: popCs.top,
    popTransform: popCs.transform,
    popZ: popCs.zIndex,
    imgZ: imgCs.zIndex,
    avOverflow: avCs.overflow,
    gapAboveImg: Math.round(i.top - p.bottom),
    hits: hits,
    hitIsImg: hits.filter(function (h) { return String(h).indexOf('img') >= 0 || String(h) === 'null'; }).length,
  });
};
</script>
</body></html>`

const work = mkdtempSync(path.join(tmpdir(), 'whale-bub-'))
writeFileSync(path.join(work, 'index.html'), page, 'utf8')

const server = createServer((req, res) => {
  const url = (req.url || '/').split('?')[0]
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(page)
    return
  }
  if (url.startsWith('/art/')) {
    const f = path.join(root, 'assets', path.basename(url))
    if (existsSync(f)) { res.writeHead(200, { 'content-type': 'image/webp' }); res.end(readFileSync(f)); return }
  }
  res.writeHead(404); res.end()
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port

/* ── 起 Edge ────────────────────────────────────────────────────── */

const PROFILE = mkdtempSync(path.join(tmpdir(), 'whale-bub-prof-'))
const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--remote-debugging-port=0', `--user-data-dir=${PROFILE}`,
  '--window-size=900,600', `http://127.0.0.1:${port}/`,
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
await new Promise((r) => setTimeout(r, 700))

const evalJson = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true })
  return JSON.parse(r.result.value)
}

console.log('\n[bubble]')
check('页面无 JS 异常', errs.length === 0, errs.slice(0, 2).join(' | '))

/* ── 两种态分别测 ───────────────────────────────────────────────── */

for (const [label, avId] of [['胶囊态', 'avPill'], ['卡片态', 'avCard']]) {
  await send('Runtime.evaluate', { expression: `window.__probe('${avId}')` })
  await new Promise((r) => setTimeout(r, 120))
  const m = await evalJson(`window.__measure('${avId}')`)

  console.log(`\n  ── ${label} ──`)
  console.log(`     立绘 y ${m.imgRect.top}~${m.imgRect.bottom}（高 ${m.imgRect.h}）`)
  console.log(`     飘字 y ${m.popRect.top}~${m.popRect.bottom}（高 ${m.popRect.h}）`)
  console.log(`     飘字 top=${m.popTopCss} transform=${m.popTransform}`)
  console.log(`     命中测试 ${JSON.stringify(m.hits)}`)

  check(`${label}：飘字底边在立绘顶边之上`,
    m.popRect.bottom <= m.imgRect.top,
    `文字底 ${m.popRect.bottom} vs 图顶 ${m.imgRect.top}（gap ${m.gapAboveImg}px）`)


  /* ── 按钮位置：不能压住飘字，也不能压住卡片头部文字 ────────── */
  if (avId === 'avCard') {
    const btn = await evalJson(`(function(){
      var b = document.querySelector('.wm-roam');
      var pop = document.querySelector('.pops');
      var who = document.querySelector('.who');
      var av = document.getElementById('avCard');
      if (!b) return JSON.stringify({error:'no button'});
      var br = b.getBoundingClientRect();
      var ar = av.getBoundingClientRect();
      var out = {
        btn: {left:Math.round(br.left), top:Math.round(br.top), right:Math.round(br.right), bottom:Math.round(br.bottom)},
        av: {left:Math.round(ar.left), top:Math.round(ar.top), right:Math.round(ar.right), bottom:Math.round(ar.bottom)},
        insideAv: br.left >= ar.left - 2 && br.right <= ar.right + 2 && br.top >= ar.top - 2 && br.bottom <= ar.bottom + 2,
      };
      if (pop) {
        var pr = pop.getBoundingClientRect();
        out.pop = {left:Math.round(pr.left), top:Math.round(pr.top), right:Math.round(pr.right), bottom:Math.round(pr.bottom)};
        out.overlapsPop = !(br.right <= pr.left || br.left >= pr.right || br.bottom <= pr.top || br.top >= pr.bottom);
      }
      if (who) {
        var wr = who.getBoundingClientRect();
        out.who = {left:Math.round(wr.left), top:Math.round(wr.top)};
        out.overlapsWho = !(br.right <= wr.left || br.left >= wr.right || br.bottom <= wr.top || br.top >= wr.bottom);
      }
      return JSON.stringify(out);
    })()`)

    console.log(`     按钮 ${JSON.stringify(btn.btn)}  立绘 ${JSON.stringify(btn.av)}`)
    if (btn.overlapsPop !== undefined) {
      check(`${label}：按钮不压飘字`, btn.overlapsPop === false,
        btn.pop ? `button=${JSON.stringify(btn.btn)} pop=${JSON.stringify(btn.pop)}` : 'no pop')
    }
    check(`${label}：按钮不压卡片文字区`, btn.overlapsWho === false,
      btn.who ? `button.right=${btn.btn.right} who.left=${btn.who.left}` : 'no who')
    /* 按钮有意探出立绘右边界一点（挂件感），所以不要求完全落在立绘内。
       真正的判据是「不能被裁掉」——即父容器没有 overflow:hidden 把它切了。
       这一点用 elementFromPoint 验：按钮中心点必须命中按钮自己。 */
    const hitSelf = await evalJson(`(function(){
      var b = document.querySelector('.wm-roam');
      var r = b.getBoundingClientRect();
      var el = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
      return JSON.stringify({ self: el === b, tag: el ? (el.className || el.tagName) : 'null',
        styles: getComputedStyle(b.parentElement).overflow });
    })()`)
    check(`${label}：按钮没被父容器裁掉`, hitSelf.self === true,
      `命中 ${hitSelf.tag}, 父 overflow=${hitSelf.styles}`)
  }

  check(`${label}：飘字没有被 img 盖住`,
    m.hitIsImg === 0,
    `hits=${JSON.stringify(m.hits)}`)
}

/* ── 截图留证 ───────────────────────────────────────────────────── */

// 干净截图：藏掉 label 与卡片背景，只留立绘 + 飘字，便于目检
await send('Runtime.evaluate', {
  expression: `(function(){
    window.__probe('avPill'); window.__probe('avCard');
    document.querySelectorAll('.label').forEach(function(e){ e.style.display='none' });
    var card = document.querySelector('.wm-card');
    card.style.background = 'transparent';
    card.style.border = 'none';
    card.style.boxShadow = 'none';
    card.style.backdropFilter = 'none';
    var who = document.querySelector('.who'); if (who) who.style.visibility = 'hidden';
    var x = document.querySelector('.wm-x'); if (x) x.style.visibility = 'hidden';
  })()`,
})
await new Promise((r) => setTimeout(r, 200))
const shot = await send('Page.captureScreenshot', { format: 'png' })
const file = path.join(outDir, 'bubble-position.png')
writeFileSync(file, Buffer.from(shot.data, 'base64'))
console.log(`\n[bubble] 截图 → ${file}`)

ws.close()
child.kill()
server.close()
try { rmSync(work, { recursive: true, force: true }) } catch { /* ignore */ }
try { rmSync(PROFILE, { recursive: true, force: true }) } catch { /* ignore */ }

console.log(`\n${failures === 0 ? '通过' : `失败 ${failures} 项`}`)
process.exit(failures === 0 ? 0 : 1)
