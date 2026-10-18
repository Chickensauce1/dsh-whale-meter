/**
 * 大肥鱼用量表 · 宿主半
 *
 * 职责：
 *  - 扫描 <DSH_HOME>/sessions 下的全部会话日志，折叠出 token 用量与请求记录
 *  - 按峰谷价目折算金额，输出供应商 / 模型 / 时间窗口 / 会话四个维度的快照
 *  - 通过 webServer 注册面板页、JSON 接口、立绘资源与价目配置接口
 *
 * 设计取舍：快照计算只读磁盘、不阻塞请求。首个请求触发一次全量扫描，
 * 之后按 TTL 命中内存缓存，并且**逐文件按 mtime+size 做增量**，
 * 没变过的会话文件不重新解压（350 个会话全量解压约 11 秒，增量后接近 0）。
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  buildSnapshot,
  discoverSessionFiles,
  readSessionFile,
  resolveSessionsRoot,
  startOfBeijingDay,
} from './src/aggregate.js'
import { DEFAULT_PRICING, normalizePricing } from './src/pricing.js'
import { zstdSupported } from './src/zstd-frames.js'

/** 插件自己的标识，用于日志前缀与诊断。 */
export const name = 'dsh-whale-meter'
export const inject = ['webServer']

const CACHE_TTL_MS = 30_000
const ASSET_DIR = new URL('./assets/', import.meta.url)
const MIME = {
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
}
/** 价目 POST 的体积上限：这是一份几百字节的配置，不该有人往里塞 10 MB。 */
const MAX_BODY_BYTES = 64 * 1024

/**
 * 配置目录解析。与 aggregate 的会话根目录用同一套规则（DSH_HOME > ~/.dsh），
 * 避免「会话扫得到、价目写不进去」这种只在别人的机器上出现的分裂。
 */
function dshHome(env = process.env) {
  const custom = env.DSH_HOME && String(env.DSH_HOME).trim()
  if (custom) return path.resolve(custom)
  try {
    return path.join(os.homedir(), '.dsh')
  } catch {
    return path.join(env.USERPROFILE || env.HOME || '.', '.dsh')
  }
}

function pricingFilePath() {
  const dir = dshHome()
  if (!existsSync(dir)) {
    try { mkdirSync(dir, { recursive: true }) } catch { /* 目录已存在或不可建，后续读写自会报错 */ }
  }
  return path.join(dir, 'whale-meter-pricing.json')
}

function readPricingFile() {
  try {
    const file = pricingFilePath()
    if (!existsSync(file)) return undefined
    return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
  } catch (error) {
    console.warn('[whale-meter] 价目文件解析失败，回落到内置价目：', error?.message ?? error)
    return undefined
  }
}

function writePricingFile(payload) {
  writeFileSync(pricingFilePath(), JSON.stringify(payload, null, 2), 'utf8')
}

/**
 * 采集器：负责扫描、缓存与快照生成。
 *
 * 缓存分两层：
 *  - fileCache：单文件解析结果，键为绝对路径，值带 revision（mtime-size）。
 *    会话文件只会追加，重新解析同一代文件是纯浪费。
 *  - this.cache：整份快照，30 秒 TTL。
 */
class Collector {
  constructor(initial) {
    this.config = normalizePricing({ ...DEFAULT_PRICING, ...(initial ?? {}) })
    const persisted = readPricingFile()
    if (persisted) this.config = normalizePricing({ ...DEFAULT_PRICING, ...this.config, ...persisted })
    this.cache = undefined
    this.cacheAt = 0
    this.inflight = undefined
    this.fileCache = new Map()
    this.lastHealth = {
      scannedFiles: 0,
      reparsedFiles: 0,
      lastScanAt: 0,
      scanMs: 0,
      firstScanDone: false,
      sessionsRoot: '',
      zstd: zstdSupported,
      unreadable: 0,
    }
  }

  /** 应用新价目：先落盘再生效。 */
  updateConfig(payload) {
    const merged = {
      currency: payload?.currency ?? this.config.currency,
      peakSchedule: payload?.peakSchedule ?? {
        weekendOffpeak: this.config.weekendOffpeak,
        intervals: this.config.intervals.map((i) => {
          const [start, end] = i.text.split('-')
          return { start, end }
        }),
      },
      budget: payload?.budget ?? this.config.budget,
      pricing: payload?.pricing ?? this.config.pricing,
      /* 倍率：显式传了就整表替换（界面是全量提交），没传则保持原值。
         注意不能写成 `payload?.providerMultipliers ?? this.config.providerMultipliers`——
         `this.config.providerMultipliers` 是规整后的对象，直接回写会把 null 值
         与默认合并逻辑再跑一遍，导致「清空某条倍率」永远生效不了。 */
      providerMultipliers: payload?.providerMultipliers ?? this.config.providerMultipliers,
    }
    this.config = normalizePricing(merged)
    writePricingFile(merged)
    this.cache = undefined
    this.cacheAt = 0
    return this.config
  }

  /** 真扫描一遍磁盘并算出快照。 */
  async compute() {
    const started = Date.now()
    const root = resolveSessionsRoot()
    const files = discoverSessionFiles(root)
    const usage = []
    const requests = []
    const titles = new Map()
    let reparsed = 0
    let unreadable = 0
    const alive = new Set()

    for (const entry of files) {
      alive.add(entry.file)
      const cached = this.fileCache.get(entry.file)
      if (cached !== undefined && cached.revision === entry.revision) {
        // 命中：直接摊平，零 I/O
        for (const record of cached.usage) usage.push(record)
        for (const record of cached.requests) requests.push(record)
        for (const [id, title] of cached.titles) titles.set(id, title)
        continue
      }
      // 让出事件循环：几百个会话文件连续解压会把主线程按住十几秒
      await new Promise((resolve) => setImmediate(resolve))
      const result = await readSessionFile(entry)
      if (result.usage.length === 0 && result.requests.length === 0 && entry.size > 0) unreadable += 1
      this.fileCache.set(entry.file, { revision: entry.revision, ...result })
      reparsed += 1
      for (const record of result.usage) usage.push(record)
      for (const record of result.requests) requests.push(record)
      for (const [id, title] of result.titles) titles.set(id, title)
    }

    // 会话被删除/换代后，旧缓存条目要一起清掉，否则内存只增不减
    for (const key of this.fileCache.keys()) {
      if (!alive.has(key)) this.fileCache.delete(key)
    }

    const scanMs = Date.now() - started
    this.lastHealth = {
      scannedFiles: files.length,
      reparsedFiles: reparsed,
      lastScanAt: Date.now(),
      scanMs,
      firstScanDone: true,
      sessionsRoot: root,
      zstd: zstdSupported,
      unreadable,
    }
    return buildSnapshot({
      usage,
      requests,
      titles,
      config: this.config,
      now: Date.now(),
      health: this.lastHealth,
    })
  }

  /**
   * 取快照。
   *
   * 三种情形：
   *  - 有缓存且在 TTL 内 → 直接返回；
   *  - 有旧快照但已过期 → 立即返回旧值，后台续算（用户看到的是上一次的数，不会卡）；
   *  - **一次都没有**（刚装完/刚重启）→ 不能干等十几秒，返回一份带 progress 的
   *    空快照并触发后台计算；客户端据此显示「正在首次扫描」，下一轮就拿到真数据。
   *    这一条是「第一次打开像卡死」的根治办法。
   *
   * @param {{ force?: boolean }} [opts]
   */
  async snapshot({ force = false } = {}) {
    const now = Date.now()
    if (!force && this.cache !== undefined && now - this.cacheAt < CACHE_TTL_MS) return this.cache

    const startScan = () => {
      if (this.inflight === undefined) {
        this.inflight = this.compute()
          .then((snap) => {
            this.cache = snap
            this.cacheAt = Date.now()
            return snap
          })
          .finally(() => { this.inflight = undefined })
      }
    }

    if (this.cache !== undefined) {
      // 有旧值：立刻给旧的，后台续算
      startScan()
      if (!force) return this.cache
    } else if (!force) {
      // 从来没有过：先给占位快照 + 启动后台扫描，绝不阻塞首个请求
      startScan()
      return this.placeholder()
    }

    startScan()
    return await this.inflight
  }

  /** 首轮扫描尚未完成时的占位快照：结构与真快照一致，只是数为 0 且带 scanning 标记。 */
  placeholder() {
    const snap = buildSnapshot({
      usage: [],
      requests: [],
      titles: new Map(),
      config: this.config,
      now: Date.now(),
      health: {
        ...this.lastHealth,
        scannedFiles: 0,
        firstScanDone: false,
        scanning: true,
        sessionsRoot: resolveSessionsRoot(),
        zstd: zstdSupported,
      },
    })
    snap.scanning = true
    return snap
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(payload))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    let bytes = 0
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      bytes += chunk.length
      if (bytes > MAX_BODY_BYTES) {
        // 不能直接 destroy：那会让客户端收到 ECONNRESET 而不是一个能读懂的错误。
        // 正确做法是标记超限、停止累积，等流自然结束再拒绝（一次性配置请求，浪费不了带宽）。
        if (body.length <= MAX_BODY_BYTES) {
          body = ''
          reject(Object.assign(new Error('请求体过大'), { status: 413 }))
        }
        return
      }
      body += chunk
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

function readAsset(name) {
  // 只允许 assets/ 下的直接文件名，杜绝路径穿越
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return undefined
  let file
  try {
    file = new URL(name, ASSET_DIR)
  } catch {
    return undefined
  }
  try {
    if (!existsSync(file) || !statSync(file).isFile()) return undefined
    return readFileSync(file)
  } catch {
    return undefined
  }
}

/**
 * 插件主体。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  try {
    return _apply(ctx)
  } catch (err) {
    // 宿主插件装载失败会连累整个 profile，这里兜住并留下可查的日志
    console.warn('[whale-meter] 装载失败：', err?.message || err)
  }
}

function _apply(ctx) {
  const collector = new Collector({})

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => {
      const disposePage = webCtx.webServer.register({
        kind: 'exact',
        path: '/whale-meter',
        handler: (req, res) => {
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405); res.end(); return
          }
          let html = ''
          try {
            html = readFileSync(new URL('./panel.html', import.meta.url), 'utf8')
          } catch (error) {
            /* 模板缺失时回一个可读的错误页，不抛到 webserver 的 400 兜底 */
            res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
            res.end(`面板模板读取失败：${error?.message ?? error}`)
            return
          }
          res.writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
          })
          if (req.method === 'HEAD') res.end()
          else res.end(html)
        },
      })

      const disposeApi = webCtx.webServer.register({
        kind: 'exact',
        path: '/api/whale-meter',
        handler: async (req, res) => {
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405); res.end(); return
          }
          try {
            const url = new URL(req.url ?? '/', 'http://local')
            const force = url.searchParams.get('force') === '1'
            const snap = await collector.snapshot({ force })
            sendJson(res, 200, snap)
          } catch (error) {
            sendJson(res, 500, { error: error?.message ?? String(error) })
          }
        },
      })

      const disposePricing = webCtx.webServer.register({
        kind: 'exact',
        path: '/api/whale-meter/config',
        handler: async (req, res) => {
          if (req.method === 'GET') {
            /* 除了当前配置，还把「实际出现过的 provider」一起回给界面：
               用户不必手打 provider 名，从下拉里挑就行。
               取最近一次快照里的 providers 列表（没有快照就用空数组）。 */
            const seenProviders = (collector.cache?.providers ?? [])
              .map((p) => p.provider)
              .filter((p) => typeof p === 'string' && p !== 'unknown')
            sendJson(res, 200, {
              currency: collector.config.currency,
              budget: collector.config.budget,
              peakSchedule: {
                weekendOffpeak: collector.config.weekendOffpeak,
                intervals: collector.config.intervals.map((i) => {
                  const [start, end] = i.text.split('-')
                  return { start, end }
                }),
              },
              pricing: collector.config.pricing,
              providerMultipliers: collector.config.providerMultipliers,
              /* 观测到的 provider，供界面做下拉/校验 */
              knownProviders: seenProviders,
            })
            return
          }
          if (req.method === 'POST') {
            try {
              const body = await readBody(req)
              const payload = body ? JSON.parse(body) : {}
              const applied = collector.updateConfig(payload)
              sendJson(res, 200, { ok: true, budget: applied.budget, models: Object.keys(applied.pricing).length })
            } catch (error) {
              // 413 与 400 分开：前者是体积问题，后者是内容问题，用户看到的信息不一样
              sendJson(res, error?.status === 413 ? 413 : 400, { error: error?.message ?? String(error) })
            }
            return
          }
          res.writeHead(405); res.end()
        },
      })

      // 注意：webserver 的 prefix 匹配要求 pathname 以 `${prefix}/` 开头，
      // 所以这里必须不带尾斜杠，否则会变成要求 `.../art//`，永远匹配不上。
      const disposeArt = webCtx.webServer.register({
        kind: 'prefix',
        path: '/whale-meter/art',
        handler: (req, res) => {
          let name = ''
          try {
            name = decodeURIComponent((req.url ?? '').split('?')[0].slice('/whale-meter/art/'.length))
          } catch {
            res.writeHead(400); res.end(); return
          }
          const buffer = readAsset(name)
          if (buffer === undefined) {
            res.writeHead(404); res.end(); return
          }
          const ext = path.extname(name).toLowerCase()
          res.writeHead(200, {
            'content-type': MIME[ext] ?? 'application/octet-stream',
            'cache-control': 'public, max-age=3600',
            'content-length': buffer.length,
          })
          res.end(buffer)
        },
      })

      return () => {
        disposePage()
        disposeApi()
        disposePricing()
        disposeArt()
      }
    }, 'whale-meter: 面板页 / 接口 / 立绘 / 价目')
  })

  // 启动即预热一次，避免用户第一次点开时等扫描。
  // 用 effect 托管，插件卸载后这条定时器不会再抓住 collector。
  ctx.effect(() => {
    const timer = setTimeout(() => {
      void collector.snapshot({ force: true }).catch((error) => {
        console.warn('[whale-meter] 预热扫描失败：', error?.message ?? error)
      })
    }, 2500)
    return () => clearTimeout(timer)
  }, 'whale-meter: 预热扫描')
}

/** 暴露纯函数工具，便于外部脚本或测试直接复用，不必启动宿主。 */
export { buildSnapshot, discoverSessionFiles, readSessionFile, resolveSessionsRoot, startOfBeijingDay }

export default { name, inject, apply }
