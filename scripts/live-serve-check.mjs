/**
 * 真·进程级验收：把新插件当成真实 cordis 插件装载进一个最小宿主，
 * 起真的 HTTP 服务，用真的请求打它。
 *
 * 和 install-smoke 的区别：那个用假 res 对象直接调 handler；
 * 这个走真实 node:http，能抓到「handler 里 res.end 之后又写」这类
 * 只有真 socket 才暴露的问题。
 *
 * 用法：node scripts/live-serve-check.mjs [--port 0]
 */

import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')

let failures = 0
const check = (l, c, x) => {
  if (c) console.log(`  ✓ ${l}${x ? ` — ${x}` : ''}`)
  else { failures += 1; console.error(`  ✗ ${l}${x ? ` — ${x}` : ''}`) }
}

/* ── 最小 webServer 实现：把插件注册的路由真的挂到 node:http 上 ─── */

const routes = []
const server = createServer((req, res) => {
  const pathname = (req.url || '/').split('?')[0]
  // 先找 exact，再找最长匹配的 prefix（和宿主 webserver 的语义一致）
  let hit = routes.find((r) => r.kind === 'exact' && r.path === pathname)
  if (!hit) {
    const candidates = routes
      .filter((r) => r.kind === 'prefix' && pathname.startsWith(`${r.path}/`))
      .sort((a, b) => b.path.length - a.path.length)
    hit = candidates[0]
  }
  if (!hit) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('no route')
    return
  }
  try {
    hit.handler(req, res)
  } catch (e) {
    res.writeHead(500)
    res.end(`throw: ${e.message}`)
  }
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const base = `http://127.0.0.1:${port}`
console.log(`\n[live] 监听 ${base}`)

const mod = await import(new URL('../index.js', import.meta.url).href)

const disposers = []
const ctx = {
  inject(_deps, fn) { fn(ctx) },
  effect(fn) {
    const d = fn()
    if (typeof d === 'function') disposers.push(d)
    return d
  },
  webServer: {
    register(route) {
      routes.push(route)
      return () => {
        const i = routes.indexOf(route)
        if (i > -1) routes.splice(i, 1)
      }
    },
  },
}

mod.apply(ctx)
check('装载成功', routes.length === 4, `${routes.length} 条路由`)

/* ── 真实 HTTP 请求 ─────────────────────────────────────────────── */

console.log('\n[live] 真实 HTTP')
const page = await fetch(`${base}/whale-meter`)
const html = await page.text()
check('面板页 200', page.status === 200, String(page.status))
check('面板页 content-type 正确', (page.headers.get('content-type') || '').includes('text/html'),
  page.headers.get('content-type'))
check('面板页非空', html.length > 10_000, `${html.length} 字符`)
check('面板页无外链脚本', !/<script[^>]+src="https?:/.test(html))

const art = await fetch(`${base}/whale-meter/art/whale-stand.webp`)
check('立绘 200', art.status === 200, String(art.status))
check('立绘 content-type 为 webp', (art.headers.get('content-type') || '').includes('webp'),
  art.headers.get('content-type'))
check('立绘有 content-length', Number(art.headers.get('content-length')) > 500,
  art.headers.get('content-length'))

const trav = await fetch(`${base}/whale-meter/art/..%2F..%2Findex.js`)
check('路径穿越 404', trav.status === 404, String(trav.status))

const trav2 = await fetch(`${base}/whale-meter/art/....//index.js`)
check('变体穿越也 404', trav2.status === 404, String(trav2.status))

const cfg = await fetch(`${base}/api/whale-meter/config`)
const cfgJson = await cfg.json()
check('价目接口 200', cfg.status === 200)
check('价目接口有 currency', typeof cfgJson.currency === 'string', cfgJson.currency)
check('价目接口有 pricing', typeof cfgJson.pricing === 'object')

// POST 保存价目：必须真的写盘并生效
const newBudget = { budget: { day: 42, month: 99 } }
const post = await fetch(`${base}/api/whale-meter/config`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(newBudget),
})
const postJson = await post.json()
check('价目 POST 200', post.status === 200, String(post.status))
check('价目 POST 返回 ok', postJson.ok === true)

const cfg2 = await (await fetch(`${base}/api/whale-meter/config`)).json()
check('新预算已生效', cfg2.budget.day === 42 && cfg2.budget.month === 99,
  `day=${cfg2.budget.day} month=${cfg2.budget.month}`)

// 超大请求体必须被拒（防被当上传通道）
const big = await fetch(`${base}/api/whale-meter/config`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: 'x'.repeat(200_000),
})
check('超大请求体被拒', big.status >= 400, String(big.status))

// 错误方法
const put = await fetch(`${base}/api/whale-meter`, { method: 'PUT' })
check('PUT 返回 405', put.status === 405, String(put.status))

// 主接口：真实数据
console.log('\n[live] 主接口（真实会话数据）')
const t0 = Date.now()
const snapRes = await fetch(`${base}/api/whale-meter`)
const snap = await snapRes.json()
const firstMs = Date.now() - t0
check('快照接口 200', snapRes.status === 200)
check('首轮不阻塞（占位快照立即返回）', firstMs < 2000, `${firstMs} ms`)
check('占位快照带 scanning 标记', snap.scanning === true, String(snap.scanning))
check('占位快照结构完整', Array.isArray(snap.providers) && snap.windows?.all !== undefined)
check('快照有 health.sessionsRoot', typeof snap.health?.sessionsRoot === 'string', snap.health?.sessionsRoot)
check('快照有 health.zstd', typeof snap.health?.zstd === 'boolean', String(snap.health?.zstd))
check('快照有 unpricedModels 字段', Array.isArray(snap.unpricedModels))

// 轮询等后台扫描真的完成（不用固定 sleep：扫描耗时取决于会话数量）
let full = null
const waitStart = Date.now()
for (let i = 0; i < 120; i += 1) {
  const s = await (await fetch(`${base}/api/whale-meter`)).json()
  if (s.scanning !== true && s.windows?.all?.totalTokens > 0) { full = s; break }
  await new Promise((r) => setTimeout(r, 500))
}
const scanMs = Date.now() - waitStart
check('后台扫描完成', full !== null, full ? `${scanMs} ms 内就绪` : '超时 60s')
check('供应商归因非空', Array.isArray(full?.providers) && full.providers.length > 0,
  (full?.providers || []).map((p) => p.provider).join(','))
check('全部累计 > 0', (full?.windows?.all?.totalTokens ?? 0) > 0,
  String(full?.windows?.all?.totalTokens))

// 第三次：必须命中缓存，毫秒级
const t1 = Date.now()
const snap2 = await (await fetch(`${base}/api/whale-meter`)).json()
const secondMs = Date.now() - t1
check('就绪后命中缓存', secondMs < 100, `${secondMs} ms`)
check('数据稳定（两次一致）', snap2.windows.all.totalTokens === full?.windows.all.totalTokens)

/* ── 卸载清理 ───────────────────────────────────────────────────── */

console.log('\n[live] 卸载')
for (const d of disposers) {
  try { d() } catch { /* ignore */ }
}
check('卸载后路由被移除', routes.length === 0, `${routes.length} 条`)

const after = await fetch(`${base}/whale-meter`)
check('卸载后路由返回 404', after.status === 404, String(after.status))

server.close()

// 恢复被测试改掉的价目文件（别把用户的预算留在 42/99）
try {
  const fs = await import('node:fs')
  const os = await import('node:os')
  const p = path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'whale-meter-pricing.json')
  if (fs.existsSync(p)) {
    const cur = JSON.parse(fs.readFileSync(p, 'utf8'))
    if (cur.budget?.day === 42) {
      cur.budget = { day: 30, month: 70 }
      fs.writeFileSync(p, JSON.stringify(cur, null, 2), 'utf8')
      console.log('  · 已还原测试写入的预算（30 / 70）')
    }
  }
} catch { /* 还原失败不致命 */ }

console.log(`\n${failures === 0 ? '通过' : `失败 ${failures} 项`}`)
process.exit(failures === 0 ? 0 : 1)
