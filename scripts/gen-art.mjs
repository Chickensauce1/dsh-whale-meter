/**
 * 大肥鱼立绘生成器 —— 原创 SVG，MIT 许可，可随包分发。
 *
 * 为什么不用现成 webp：原版 assets/ 是社区二创整理站的同人图，版权归原作者，
 * README 里自己也写了「仅本地自用，不随插件分发」。上架市场 = 公开分发，
 * 所以立绘必须是本仓库自己画得出来的东西，且许可要能写进 LICENSE。
 *
 * 造型：一条圆滚滚的蓝色鲸鱼（头顶喷水孔、白肚皮、圆眼、腮红）。
 * 8 个情绪靠「眼睛 + 嘴 + 腮红 + 附加符号」的组合派生，几何骨架共用，
 * 所以看起来是一套角色而不是八张不相干的图。
 *
 * 用法：node scripts/gen-art.mjs [输出目录]
 * 默认写到 ./assets
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(here, '..', 'assets')

/* ── 配色：与面板 CSS 的 --wm-* 同源，保证浮窗里不串色 ───────────────── */
const C = {
  body: '#5686fe',
  bodyDark: '#4176e6',
  belly: '#edf3fe',
  line: '#3a63b8',
  eye: '#22375c',
  cheek: '#ff9db1',
  shine: '#ffffff',
  spray: '#b7c8fe',
}

/* ── 骨架：所有表情共用同一副身体，只换五官与附加件 ─────────────────── */
function body() {
  return `
  <path d="M20 74c0-26 20-44 48-44s48 18 48 44c0 22-14 36-48 36S20 96 20 74z" fill="${C.body}"/>
  <path d="M36 88c8-14 22-20 32-20s24 6 32 20c-6 12-18 18-32 18s-26-6-32-18z" fill="${C.belly}"/>
  <path d="M20 74c0-26 20-44 48-44s48 18 48 44c0 22-14 36-48 36S20 96 20 74z" fill="none" stroke="${C.line}" stroke-width="2.5"/>`
}

/** 尾鳍：从身体右下伸出，两瓣朝右上/右下张开，中间收一个凹口。 */
function tail() {
  return `
  <path d="M108 78c6 1 11 4 14 9 2-6 7-10 13-12-1 7 1 12 5 16-6 3-10 8-11 14-4-6-10-9-17-9 3-5 2-11-4-18z"
        fill="${C.bodyDark}" stroke="${C.line}" stroke-width="2.5" stroke-linejoin="round"/>`
}

function spout(active) {
  if (!active) return ''
  return `
  <g fill="${C.spray}" opacity="0.9">
    <circle cx="62" cy="18" r="4.5"/>
    <circle cx="74" cy="12" r="3.5"/>
    <circle cx="52" cy="12" r="3"/>
    <circle cx="68" cy="26" r="2.5"/>
  </g>`
}

/** 眼睛：open / happy(^) / closed(|) / sparkle */
function eyes(kind) {
  if (kind === 'happy') {
    return `
  <path d="M46 66c4-6 10-6 14 0" fill="none" stroke="${C.eye}" stroke-width="3.6" stroke-linecap="round"/>
  <path d="M76 66c4-6 10-6 14 0" fill="none" stroke="${C.eye}" stroke-width="3.6" stroke-linecap="round"/>`
  }
  if (kind === 'closed') {
    return `
  <path d="M46 66h14" stroke="${C.eye}" stroke-width="3.6" stroke-linecap="round"/>
  <path d="M76 66h14" stroke="${C.eye}" stroke-width="3.6" stroke-linecap="round"/>`
  }
  if (kind === 'sparkle') {
    return `
  <ellipse cx="53" cy="66" rx="6" ry="7.5" fill="${C.eye}"/>
  <ellipse cx="83" cy="66" rx="6" ry="7.5" fill="${C.eye}"/>
  <circle cx="55" cy="63" r="2.4" fill="${C.shine}"/>
  <circle cx="85" cy="63" r="2.4" fill="${C.shine}"/>
  <path d="M61 56l2.6 5.6L69 64l-5.4 2.4L61 72l-2.6-5.6L53 64l5.4-2.4z" fill="${C.shine}" opacity="0.85"/>`
  }
  return `
  <ellipse cx="53" cy="66" rx="6" ry="7.5" fill="${C.eye}"/>
  <ellipse cx="83" cy="66" rx="6" ry="7.5" fill="${C.eye}"/>
  <circle cx="55" cy="63" r="2.4" fill="${C.shine}"/>
  <circle cx="85" cy="63" r="2.4" fill="${C.shine}"/>`
}

/** 嘴：smile / flat / o / grin / frown */
function mouth(kind) {
  if (kind === 'o') return `<ellipse cx="68" cy="84" rx="4.5" ry="5.5" fill="${C.line}" opacity="0.8"/>`
  if (kind === 'flat') return `<path d="M60 84h16" stroke="${C.line}" stroke-width="3" stroke-linecap="round"/>`
  if (kind === 'grin') {
    return `<path d="M56 80c4 9 20 9 24 0z" fill="${C.line}" opacity="0.85"/>
  <path d="M56 80c4 9 20 9 24 0" fill="none" stroke="${C.line}" stroke-width="2.6" stroke-linejoin="round"/>`
  }
  if (kind === 'frown') return `<path d="M60 87c4-6 12-6 16 0" fill="none" stroke="${C.line}" stroke-width="3" stroke-linecap="round"/>`
  return `<path d="M59 81c3.5 6 14.5 6 18 0" fill="none" stroke="${C.line}" stroke-width="3" stroke-linecap="round"/>`
}

function cheeks(on) {
  if (!on) return ''
  return `
  <ellipse cx="40" cy="78" rx="7" ry="4.5" fill="${C.cheek}" opacity="0.55"/>
  <ellipse cx="96" cy="78" rx="7" ry="4.5" fill="${C.cheek}" opacity="0.55"/>`
}

/** 附加件：汗滴 / 怒符 / 星星 / 问号 / 代码括号 */
function extra(kind) {
  if (kind === 'sweat') return `<path d="M104 40c4 6 6 9 6 12a6 6 0 1 1-12 0c0-3 2-6 6-12z" fill="#9fc4ff" stroke="${C.line}" stroke-width="2"/>`
  if (kind === 'anger') return `
  <g stroke="#e0574a" stroke-width="3.4" stroke-linecap="round" fill="none">
    <path d="M96 26l7 7M110 26l-7 7M96 40l7-7M110 40l-7-7"/>
  </g>`
  if (kind === 'star') return `
  <g fill="#ffce4a" stroke="#e0a92c" stroke-width="1.4">
    <path d="M108 20l3.2 6.6 7.2 1-5.2 5 1.3 7.2-6.5-3.4-6.5 3.4 1.3-7.2-5.2-5 7.2-1z"/>
    <path d="M28 30l2.4 5 5.4.7-3.9 3.8 1 5.4-4.9-2.6-4.9 2.6 1-5.4-3.9-3.8 5.4-.7z" opacity="0.9"/>
  </g>`
  if (kind === 'question') return `<path d="M104 24c0-6 10-6 10 0 0 4-5 4-5 9" fill="none" stroke="${C.line}" stroke-width="3.4" stroke-linecap="round"/><circle cx="109" cy="40" r="2.4" fill="${C.line}"/>`
  if (kind === 'code') return `
  <g fill="none" stroke="${C.line}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" opacity="0.85">
    <path d="M120 96l-7 7 7 7M134 96l7 7-7 7"/>
    <path d="M124 114l6-22"/>
  </g>`
  return ''
}

/** 一个表情的完整 SVG。 */
function svg({ eyes: e, mouth: m, cheeks: ck, extra: ex, spout: sp }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 132" width="144" height="132" role="img" aria-label="大肥鱼">
<g>
${spout(sp)}
${tail()}
${body()}
${cheeks(ck)}
${eyes(e)}
${mouth(m)}
${extra(ex)}
</g>
</svg>
`
}

/** 八个情绪档：id → 参数组合。id 与 client.js 的 pickArt() 一一对应。 */
const MOODS = {
  'whale-stand': { eyes: 'open', mouth: 'smile', cheeks: true, extra: null, spout: false },
  'whale-ciallo': { eyes: 'happy', mouth: 'smile', cheeks: true, extra: null, spout: true },
  'whale-praise': { eyes: 'sparkle', mouth: 'grin', cheeks: true, extra: 'star', spout: true },
  'whale-bighead': { eyes: 'open', mouth: 'o', cheeks: false, extra: 'question', spout: false },
  'whale-thinking': { eyes: 'closed', mouth: 'flat', cheeks: false, extra: null, spout: false },
  'whale-confused': { eyes: 'open', mouth: 'o', cheeks: true, extra: 'sweat', spout: false },
  'whale-coding': { eyes: 'open', mouth: 'flat', cheeks: false, extra: 'code', spout: false },
  'whale-goodmodel': { eyes: 'sparkle', mouth: 'smile', cheeks: true, extra: null, spout: false },
  'whale-scold': { eyes: 'open', mouth: 'frown', cheeks: false, extra: 'anger', spout: false },
  'whale-angry': { eyes: 'open', mouth: 'grin', cheeks: true, extra: 'anger', spout: true },
  'whale-cdrive': { eyes: 'closed', mouth: 'o', cheeks: true, extra: 'sweat', spout: true },
}

mkdirSync(outDir, { recursive: true })
for (const [id, cfg] of Object.entries(MOODS)) {
  writeFileSync(path.join(outDir, `${id}.svg`), svg(cfg), 'utf8')
}
// 面板页的默认主视觉
writeFileSync(path.join(outDir, 'mood-calm.svg'), svg(MOODS['whale-stand']), 'utf8')
console.log(`generated ${Object.keys(MOODS).length + 1} svg into ${outDir}`)
