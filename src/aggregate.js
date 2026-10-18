/**
 * 会话日志采集与聚合。
 *
 * 采集：扫描 ~/.dsh/sessions/<project>/<session>/session*.jsonl(.zstd)，
 * 解压、逐行解析、折叠成「一条 usage 记录 = 一次模型调用的最终用量」。
 *
 * 去重原则：同一次模型调用会在 assistant/chunk(usage) 与 assistant/message(usage)
 * 各出现一次，用 `${sessionId}:${turn}:${step}` 做键覆盖写，保证只算一次。
 *
 * 聚合：全部是纯函数，输入记录数组 + 当前时刻，输出快照，方便单测与复算。
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { decompressZstd, parseEventLines } from './zstd-frames.js'
import { costOf, isPeak } from './pricing.js'

/** 会话文件的命名族：session.jsonl.zstd / session.v1.jsonl / session.v2.jsonl.zstd … */
const SESSION_FILE_RE = /^session(\.[a-z0-9]+)?\.jsonl(\.zstd)?$/i

/**
 * 会话根目录解析。
 *
 * 旧实现写死 os.homedir()/.dsh/sessions —— 在非默认 DSH_HOME、便携版、
 * 或 profile 被重定向的机器上一律扫到 0 个文件（面板显示全 0，且没有任何报错）。
 * 现在按 DSH 自己的解析顺序来：DSH_HOME > ~/.dsh。
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string} 会话根目录绝对路径
 */
export function resolveSessionsRoot(env = process.env) {
  const home = env.DSH_HOME && String(env.DSH_HOME).trim()
  const base = home ? path.resolve(home) : path.join(homedirPath(), '.dsh')
  return path.join(base, 'sessions')
}

/** 单独抽出来，方便测试替换。 */
function homedirPath() {
  try {
    // 延迟 import，避免在浏览器打包场景里被静态解析
    return process.env.USERPROFILE || process.env.HOME || '.'
  } catch {
    return '.'
  }
}

/**
 * 枚举所有工作区下的会话文件，每会话只取最新一代。
 * @param {string} root 会话根目录
 * @returns {{ id: string, project: string, file: string, revision: string, size: number, mtimeMs: number }[]}
 */
export function discoverSessionFiles(root) {
  if (!existsSync(root)) return []
  const out = []
  const seen = new Set()
  let projects = []
  try {
    projects = readdirSync(root)
  } catch {
    return []
  }
  for (const project of projects) {
    const projectDir = path.join(root, project)
    let entries = []
    try {
      if (!statSync(projectDir).isDirectory()) continue
      entries = readdirSync(projectDir)
    } catch {
      continue
    }
    for (const session of entries) {
      if (seen.has(session)) continue
      const sessionDir = path.join(projectDir, session)
      try {
        if (!statSync(sessionDir).isDirectory()) continue
        const candidates = readdirSync(sessionDir).filter((name) => SESSION_FILE_RE.test(name))
        if (candidates.length === 0) continue
        // session.v10 按字典序会排到 session.v9 前面，先按「代数数值」排再退化到字典序
        candidates.sort((a, b) => generationOf(b) - generationOf(a) || b.localeCompare(a))
        const file = path.join(sessionDir, candidates[0])
        const stat = statSync(file)
        seen.add(session)
        out.push({
          id: session,
          project,
          file,
          revision: `${Math.floor(stat.mtimeMs)}-${stat.size}`,
          size: stat.size,
          mtimeMs: stat.mtimeMs,
        })
      } catch {
        // 权限或竞态：跳过这一条
      }
    }
  }
  return out
}

/** 从文件名里取「第几代」：session.v3.jsonl.zstd → 3；无版本号 → 0。 */
function generationOf(name) {
  const m = /^session\.v(\d+)\b/i.exec(name)
  return m ? Number.parseInt(m[1], 10) : 0
}

/**
 * 把一个会话文件折叠成 usage / request / title 三类记录。
 * @returns {Promise<{ usage: object[], requests: object[], titles: Map<string,string> }>}
 */
export async function readSessionFile(entry) {
  const usage = []
  const requests = []
  const titles = new Map()
  let raw = ''
  try {
    const buffer = readFileSync(entry.file)
    raw = entry.file.endsWith('.zstd') ? await decompressZstd(buffer) : buffer.toString('utf8')
  } catch {
    return { usage, requests, titles }
  }
  const events = parseEventLines(raw)
  if (events.length === 0) return { usage, requests, titles }

  // 「当前生效的」provider/model。DSH 在会话里以事件流形式记录，切换模型时打一条
  // model/selection，重试打 llm/retry —— 两者都必须改当前值，否则切档之后的用量
  // 会被算到上一家供应商头上（旧版只认 request/header + request/context + model/selection，
  // 于是 llm/retry 换供应商的那一批全记错了）。
  let provider = 'unknown'
  let model = 'unknown'
  const usageIndex = new Map()
  const requestIndex = new Map()

  const adopt = (source) => {
    if (!source || typeof source !== 'object') return
    if (typeof source.provider === 'string' && source.provider) provider = source.provider
    if (typeof source.model === 'string' && source.model) model = source.model
  }

  const recordUsage = (time, turn, step, value) => {
    const key = `${entry.id}:${turn}:${step}`
    const record = {
      sessionId: entry.id,
      project: entry.project,
      time,
      provider,
      model,
      turn,
      step,
      inputTokens: value.inputTokens ?? 0,
      outputTokens: value.outputTokens ?? 0,
      cacheReadTokens: value.cacheReadTokens ?? 0,
      cacheWriteTokens: value.cacheWriteTokens ?? 0,
      reasoningTokens: value.reasoningTokens ?? 0,
    }
    const existing = usageIndex.get(key)
    if (existing === undefined) {
      usageIndex.set(key, usage.length)
      usage.push(record)
    } else {
      // 同一次调用在 chunk 与 message 各报一次：后到的那条带完整 usage，覆盖前面的
      usage[existing] = record
    }
  }

  const recordRequest = (time, turn, step) => {
    const key = `${entry.id}:${turn ?? 0}:${step ?? 0}`
    const record = { sessionId: entry.id, time, provider, model }
    const existing = requestIndex.get(key)
    if (existing === undefined) {
      requestIndex.set(key, requests.length)
      requests.push(record)
    } else {
      requests[existing] = record
    }
  }

  for (const event of events) {
    switch (event.type) {
      case 'request/header': {
        adopt(event.data?.header?.config)
        break
      }
      case 'request/context':
      case 'model/selection':
      case 'llm/retry':
      case 'compaction/summary': {
        adopt(event.data)
        break
      }
      case 'subagent/descriptor': {
        // 子代理会用另一家供应商跑；descriptor 里带了 provider 就先记下来，
        // 但子代理自己的 usage 不一定打在本文件里，所以只更新「当前值」，
        // 不额外造记录（避免把父会话的调用错记成子代理的）。
        adopt(event.data)
        break
      }
      case 'assistant/chunk': {
        const chunk = event.data?.chunk
        if (chunk?.type === 'usage' && chunk.usage) {
          recordUsage(event.time, event.data.turn ?? 0, event.data.step ?? 0, chunk.usage)
        }
        break
      }
      case 'assistant/message': {
        // 每个完成的模型调用恰好一条 assistant/message —— 请求计数以此为准
        recordRequest(event.time, event.data?.turn, event.data?.step)
        if (event.data?.usage) {
          recordUsage(event.time, event.data.turn ?? 0, event.data.step ?? 0, event.data.usage)
        }
        break
      }
      case 'session/title': {
        if (typeof event.data?.title === 'string' && event.data.title) titles.set(entry.id, event.data.title)
        break
      }
      default:
        break
    }
  }

  // 老会话或异常中断的文件可能一条 provider 事件都没有。这时用模型名反推供应商，
  // 比留下一个 'unknown' 桶更有用（面板上 'unknown' 会把所有孤儿用量糊成一坨）。
  if (provider === 'unknown') {
    for (const record of usage) record.provider = guessProvider(record.model)
    for (const record of requests) record.provider = guessProvider(record.model)
  }
  return { usage, requests, titles }
}

/** 模型名 → 供应商的保守猜测。只用于「日志里完全没有 provider」的兜底。 */
export function guessProvider(model) {
  if (typeof model !== 'string' || !model || model === 'unknown') return 'unknown'
  const m = model.toLowerCase()
  if (m.startsWith('deepseek')) return 'deepseek'
  if (m.startsWith('glm') || m.startsWith('chatglm')) return 'zhipu'
  if (m.startsWith('kimi') || m.startsWith('moonshot')) return 'moonshot'
  if (m.startsWith('minimax')) return 'minimax'
  if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3')) return 'openai'
  if (m.startsWith('gemini')) return 'google'
  if (m.startsWith('claude')) return 'anthropic'
  if (m.startsWith('qwen')) return 'alibaba'
  if (m.startsWith('hy') || m.startsWith('hunyuan')) return 'tencent'
  if (m.startsWith('doubao') || m.startsWith('seed')) return 'bytedance'
  if (m.startsWith('intern')) return 'intern'
  return 'unknown'
}

/** 把逐条记录合成为一个带金额的累加器。 */
function emptyTotals() {
  return {
    requestCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    cost: 0,
    unpriced: 0,
    unpricedTokens: 0,
  }
}

function addUsage(totals, record, config) {
  totals.inputTokens += record.inputTokens
  totals.outputTokens += record.outputTokens
  totals.cacheReadTokens += record.cacheReadTokens
  totals.cacheWriteTokens += record.cacheWriteTokens
  totals.reasoningTokens += record.reasoningTokens ?? 0
  const tokens = record.inputTokens + record.outputTokens + record.cacheReadTokens + record.cacheWriteTokens
  totals.totalTokens += tokens
  const cost = costOf(record.model, {
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    cacheReadTokens: record.cacheReadTokens,
    cacheWriteTokens: record.cacheWriteTokens,
  }, record.time, config, record.provider)
  if (cost === undefined) {
    totals.unpriced += 1
    totals.unpricedTokens += tokens
  } else {
    totals.cost += cost
  }
}

/** 圆到小数点后 4 位，避免浮点噪声进 JSON。 */
function round4(value) {
  return Math.round(value * 10000) / 10000
}

function finalizeTotals(totals) {
  return {
    requestCount: totals.requestCount,
    inputTokens: totals.inputTokens,
    outputTokens: totals.outputTokens,
    cacheReadTokens: totals.cacheReadTokens,
    cacheWriteTokens: totals.cacheWriteTokens,
    reasoningTokens: totals.reasoningTokens,
    totalTokens: totals.totalTokens,
    cost: round4(totals.cost),
    unpriced: totals.unpriced,
    unpricedTokens: totals.unpricedTokens,
  }
}

/** 北京时间某个时刻当日 00:00 的 UTC 毫秒。 */
export function startOfBeijingDay(time) {
  const shifted = new Date(time + 8 * 3_600_000)
  shifted.setUTCHours(0, 0, 0, 0)
  return shifted.getTime() - 8 * 3_600_000
}

/** 北京时间某个时刻所在月份的 1 日 00:00 的 UTC 毫秒。 */
export function startOfBeijingMonth(time) {
  const shifted = new Date(time + 8 * 3_600_000)
  shifted.setUTCHours(0, 0, 0, 0)
  shifted.setUTCDate(1)
  return shifted.getTime() - 8 * 3_600_000
}

/** 时间窗口定义。key 是快照里 windows 的字段名。 */
const WINDOW_DEFS = [
  { key: 'last3h', label: '近 3 小时', ms: 3 * 3_600_000 },
  { key: 'last12h', label: '近 12 小时', ms: 12 * 3_600_000 },
  { key: 'last7d', label: '近 7 天', ms: 7 * 86_400_000 },
  { key: 'last30d', label: '近 30 天', ms: 30 * 86_400_000 },
]

/**
 * 构建完整快照。
 * @param {object} input
 * @param {object[]} input.usage 全部 usage 记录
 * @param {object[]} input.requests 全部 request 记录
 * @param {Map<string,string>} input.titles 会话标题
 * @param {ReturnType<import('./pricing.js').normalizePricing>} input.config 价目配置
 * @param {number} input.now 当前时刻（可用于测试复算）
 * @param {object} input.health 采集健康信息
 */
export function buildSnapshot({ usage, requests, titles, config, now, health }) {
  const dayStart = startOfBeijingDay(now)
  const monthStart = startOfBeijingMonth(now)

  const windows = {}
  const group = (filter) => {
    const totals = emptyTotals()
    for (const record of usage) {
      if (!filter(record.time)) continue
      addUsage(totals, record, config)
    }
    for (const record of requests) {
      if (!filter(record.time)) continue
      totals.requestCount += 1
    }
    return finalizeTotals(totals)
  }

  windows.today = group((time) => time >= dayStart)
  windows.month = group((time) => time >= monthStart)
  for (const def of WINDOW_DEFS) {
    windows[def.key] = group((time) => time >= now - def.ms)
  }
  windows.all = group(() => true)

  // ── 供应商维度（本插件的核心差异化）─────────────────────────────
  const providerMap = new Map()
  for (const record of usage) {
    const key = record.provider || 'unknown'
    let entry = providerMap.get(key)
    if (entry === undefined) {
      entry = { provider: key, totals: emptyTotals(), models: new Map() }
      providerMap.set(key, entry)
    }
    addUsage(entry.totals, record, config)
    let modelEntry = entry.models.get(record.model)
    if (modelEntry === undefined) {
      modelEntry = { model: record.model, totals: emptyTotals() }
      entry.models.set(record.model, modelEntry)
    }
    addUsage(modelEntry.totals, record, config)
  }
  for (const record of requests) {
    const key = record.provider || 'unknown'
    let entry = providerMap.get(key)
    if (entry === undefined) {
      entry = { provider: key, totals: emptyTotals(), models: new Map() }
      providerMap.set(key, entry)
    }
    entry.totals.requestCount += 1
  }

  const providers = [...providerMap.values()]
    .map((entry) => ({
      provider: entry.provider,
      totals: finalizeTotals(entry.totals),
      models: [...entry.models.values()]
        .map((m) => ({ model: m.model, totals: finalizeTotals(m.totals) }))
        .sort((a, b) => b.totals.totalTokens - a.totals.totalTokens),
    }))
    .sort((a, b) => b.totals.totalTokens - a.totals.totalTokens)

  const grandTokens = windows.all.totalTokens || 1
  for (const entry of providers) {
    entry.share = round4(entry.totals.totalTokens / grandTokens)
  }

  // ── 小时序列（近 24 小时）───────────────────────────────────────
  const HOUR = 3_600_000
  const hourStart = Math.floor(now / HOUR) * HOUR - 23 * HOUR
  const hourly = Array.from({ length: 24 }, (_, i) => ({
    startTime: hourStart + i * HOUR,
    tokens: 0,
    cost: 0,
    requests: 0,
    peak: isPeak(hourStart + i * HOUR, config),
  }))

  // 序列与窗口共用一次遍历：旧版每条记录要 addUsage 一次、hourly 一次、daily 一次，
  // 14000 条记录 = 4 万次 costOf（每次都要跑一遍正则别名表）。合并后一次算完。
  const DAY = 86_400_000
  const dayStartFirst = startOfBeijingDay(now - 13 * DAY)
  const daily = Array.from({ length: 14 }, (_, i) => ({
    startTime: dayStartFirst + i * DAY,
    tokens: 0,
    cost: 0,
    requests: 0,
  }))

  for (const record of usage) {
    const tokens = record.inputTokens + record.outputTokens + record.cacheReadTokens + record.cacheWriteTokens
    const cost = costOf(record.model, record, record.time, config, record.provider)

    if (record.time >= hourStart) {
      const idx = Math.min(23, Math.max(0, Math.floor((record.time - hourStart) / HOUR)))
      const bucket = hourly[idx]
      if (bucket !== undefined) {
        bucket.tokens += tokens
        if (cost !== undefined) bucket.cost += cost
      }
    }
    if (record.time >= dayStartFirst) {
      const idx = Math.min(13, Math.max(0, Math.floor((record.time - dayStartFirst) / DAY)))
      const bucket = daily[idx]
      if (bucket !== undefined) {
        bucket.tokens += tokens
        if (cost !== undefined) bucket.cost += cost
      }
    }
  }
  for (const bucket of hourly) bucket.cost = round4(bucket.cost)
  for (const bucket of daily) bucket.cost = round4(bucket.cost)

  for (const record of requests) {
    if (record.time >= hourStart) {
      const idx = Math.min(23, Math.max(0, Math.floor((record.time - hourStart) / HOUR)))
      const bucket = hourly[idx]
      if (bucket) bucket.requests += 1
    }
    if (record.time >= dayStartFirst) {
      const idx = Math.min(13, Math.max(0, Math.floor((record.time - dayStartFirst) / DAY)))
      const bucket = daily[idx]
      if (bucket) bucket.requests += 1
    }
  }

  // ── 会话榜（按今日金额，其次总量）────────────────────────────────
  const sessionMap = new Map()
  for (const record of usage) {
    if (record.time < dayStart) continue
    let entry = sessionMap.get(record.sessionId)
    if (entry === undefined) {
      entry = { id: record.sessionId, project: record.project, totals: emptyTotals(), lastTime: 0 }
      sessionMap.set(record.sessionId, entry)
    }
    addUsage(entry.totals, record, config)
    if (record.time > entry.lastTime) entry.lastTime = record.time
  }
  const topSessions = [...sessionMap.values()]
    .map((entry) => ({
      id: entry.id,
      title: titles.get(entry.id) ?? null,
      project: entry.project,
      lastTime: entry.lastTime,
      totals: finalizeTotals(entry.totals),
    }))
    .sort((a, b) => b.totals.cost - a.totals.cost || b.totals.totalTokens - a.totals.totalTokens)
    .slice(0, 10)

  const budget = {
    day: { spent: windows.today.cost, cap: config.budget.day },
    month: { spent: windows.month.cost, cap: config.budget.month },
  }
  budget.day.pct = budget.day.cap > 0 ? round4(budget.day.spent / budget.day.cap) : 0
  budget.month.pct = budget.month.cap > 0 ? round4(budget.month.spent / budget.month.cap) : 0

  // 大肥鱼心情：按今日预算进度 + 本月进度取较重的一档
  const pressure = Math.max(budget.day.pct, budget.month.pct)
  let mood = 'calm'
  if (windows.all.totalTokens === 0) mood = 'idle'
  else if (pressure >= 0.85) mood = 'hot'
  else if (pressure >= 0.5) mood = 'busy'

  // 未定价清单：告诉用户「这些模型我没价目，所以金额偏低」，
  // 而不是让他对着一个偏小的数字猜。按 token 量降序，最多 8 条。
  const unpricedModels = []
  {
    const acc = new Map()
    for (const record of usage) {
      if (costOf(record.model, record, record.time, config, record.provider) !== undefined) continue
      const key = record.model || 'unknown'
      const cur = acc.get(key) ?? { model: key, provider: record.provider, records: 0, tokens: 0 }
      cur.records += 1
      cur.tokens += record.inputTokens + record.outputTokens + record.cacheReadTokens + record.cacheWriteTokens
      acc.set(key, cur)
    }
    for (const item of [...acc.values()].sort((a, b) => b.tokens - a.tokens).slice(0, 8)) unpricedModels.push(item)
  }

  return {
    currency: config.currency,
    generatedAt: now,
    now,
    dayStart,
    monthStart,
    mood,
    pressure: round4(pressure),
    peakNow: isPeak(now, config),
    windows,
    providers,
    hourly,
    daily,
    topSessions,
    budget,
    budgetCaps: config.budget,
    unpricedModels,
    health,
    pricing: {
      models: Object.keys(config.pricing).length,
      intervals: config.intervals.map((i) => i.text),
      weekendOffpeak: config.weekendOffpeak,
    },
  }
}
