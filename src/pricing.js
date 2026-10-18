/**
 * 价目与计费。
 *
 * 两件事：
 *  1. 峰谷判定 —— 北京时间（UTC+8）工作日 09:00-12:00、14:00-18:00 为峰，其余为谷，周末全天为谷。
 *     峰谷表可在面板里改，不写死。
 *  2. 模型 → 单价查找 —— 精确命中 → 别名规则 → 前缀族回退，三级都查不到才返回 undefined。
 *
 * 单价单位：元 / 百万 token。
 *
 * 关于「别人的电脑」：内置表只是**常见默认值**，不是任何真实账单的复刻。
 * 别人机器上的模型名、代理商、折扣都不一样，所以：
 *  - 查不到的模型不计金额，但会逐条计入 `unpricedTokens`，
 *    面板据此显示「N 条未定价」，而不是假装花了 0 元；
 *  - 面板可新增价目，写入 <DSH_HOME>/whale-meter-pricing.json，重启不丢。
 */

/** 内置默认价目表。可被 <DSH_HOME>/whale-meter-pricing.json 整体覆盖。 */
export const DEFAULT_PRICING = {
  currency: 'CNY',
  peakSchedule: {
    weekendOffpeak: true,
    intervals: [
      { start: '09:00', end: '12:00' },
      { start: '14:00', end: '18:00' },
    ],
  },
  budget: { day: 30, month: 70 },
  /**
   * 供应商倍率默认值：空表 = 全部按官方价。
   *
   * 特意留空而不是预填猜测值：我不知道任何中转站的真实折扣，
   * 预填等于把我的猜测当成用户的事实。留空 + 界面可改才是诚实的做法。
   */
  providerMultipliers: {},
  pricing: {
    /* ── DeepSeek 官方峰谷价 ─────────────────────────────────── */
    'deepseek-flash': {
      peak: { uncachedInputPerMillion: 2.0, cacheReadPerMillion: 0.04, cacheWritePerMillion: 0, outputPerMillion: 8.0 },
      offpeak: { uncachedInputPerMillion: 1.0, cacheReadPerMillion: 0.02, cacheWritePerMillion: 0, outputPerMillion: 4.0 },
    },
    'deepseek-v4-pro': {
      peak: { uncachedInputPerMillion: 9.0, cacheReadPerMillion: 0.30, cacheWritePerMillion: 0, outputPerMillion: 27.0 },
      offpeak: { uncachedInputPerMillion: 4.5, cacheReadPerMillion: 0.15, cacheWritePerMillion: 0, outputPerMillion: 13.5 },
    },
    'deepseek-v4.1-flash': {
      peak: { uncachedInputPerMillion: 2.0, cacheReadPerMillion: 0.04, cacheWritePerMillion: 0, outputPerMillion: 8.0 },
      offpeak: { uncachedInputPerMillion: 1.0, cacheReadPerMillion: 0.02, cacheWritePerMillion: 0, outputPerMillion: 4.0 },
    },
    'deepseek-reasoner': {
      peak: { uncachedInputPerMillion: 4.0, cacheReadPerMillion: 0.8, cacheWritePerMillion: 0, outputPerMillion: 16.0 },
      offpeak: { uncachedInputPerMillion: 2.0, cacheReadPerMillion: 0.4, cacheWritePerMillion: 0, outputPerMillion: 8.0 },
    },
    'deepseek-chat': {
      peak: { uncachedInputPerMillion: 2.0, cacheReadPerMillion: 0.4, cacheWritePerMillion: 0, outputPerMillion: 8.0 },
      offpeak: { uncachedInputPerMillion: 1.0, cacheReadPerMillion: 0.2, cacheWritePerMillion: 0, outputPerMillion: 4.0 },
    },

    /* ── 第三方托管（各家官方公开价，单位已折算成元/百万 token） ── */
    'glm-5.3': { uncachedInputPerMillion: 4.0, cacheReadPerMillion: 0.8, cacheWritePerMillion: 0, outputPerMillion: 16.0 },
    'glm-5.3-flash': { uncachedInputPerMillion: 0.5, cacheReadPerMillion: 0.1, cacheWritePerMillion: 0, outputPerMillion: 2.0 },
    'glm-5.2': { uncachedInputPerMillion: 4.0, cacheReadPerMillion: 0.8, cacheWritePerMillion: 0, outputPerMillion: 16.0 },
    'glm-5.1': { uncachedInputPerMillion: 4.0, cacheReadPerMillion: 0.8, cacheWritePerMillion: 0, outputPerMillion: 16.0 },
    'glm-4.6': { uncachedInputPerMillion: 4.0, cacheReadPerMillion: 0.8, cacheWritePerMillion: 0, outputPerMillion: 16.0 },
    'glm-5v-turbo': { uncachedInputPerMillion: 1.0, cacheReadPerMillion: 0.2, cacheWritePerMillion: 0, outputPerMillion: 4.0 },
    'kimi-k3': { uncachedInputPerMillion: 4.0, cacheReadPerMillion: 0.8, cacheWritePerMillion: 0, outputPerMillion: 16.0 },
    'kimi-k2.6': { uncachedInputPerMillion: 4.0, cacheReadPerMillion: 0.8, cacheWritePerMillion: 0, outputPerMillion: 16.0 },
    'minimax-m3': { uncachedInputPerMillion: 2.0, cacheReadPerMillion: 0.4, cacheWritePerMillion: 0, outputPerMillion: 8.0 },
    'gpt-5.4': { uncachedInputPerMillion: 6.5, cacheReadPerMillion: 1.3, cacheWritePerMillion: 0, outputPerMillion: 26.0 },
    'gpt-5.3-codex': { uncachedInputPerMillion: 6.5, cacheReadPerMillion: 1.3, cacheWritePerMillion: 0, outputPerMillion: 26.0 },
    'gemini-3.5-flash': { uncachedInputPerMillion: 0.7, cacheReadPerMillion: 0.14, cacheWritePerMillion: 0, outputPerMillion: 2.8 },
    'claude-sonnet-4.5': { uncachedInputPerMillion: 21.5, cacheReadPerMillion: 2.15, cacheWritePerMillion: 26.9, outputPerMillion: 107.5 },
    'claude-opus-4.5': { uncachedInputPerMillion: 107.5, cacheReadPerMillion: 10.75, cacheWritePerMillion: 134.4, outputPerMillion: 537.5 },

    /* ── 国内云厂商 ──────────────────────────────────────────── */
    'hy3': { uncachedInputPerMillion: 1.0, cacheReadPerMillion: 0.2, cacheWritePerMillion: 0, outputPerMillion: 4.0 },
    'intern-s2': { uncachedInputPerMillion: 2.0, cacheReadPerMillion: 0.4, cacheWritePerMillion: 0, outputPerMillion: 8.0 },
    'qwen3-max': { uncachedInputPerMillion: 6.0, cacheReadPerMillion: 1.2, cacheWritePerMillion: 0, outputPerMillion: 24.0 },
    'qwen3-coder-plus': { uncachedInputPerMillion: 4.0, cacheReadPerMillion: 0.8, cacheWritePerMillion: 0, outputPerMillion: 16.0 },
    'doubao-seed-1.6': { uncachedInputPerMillion: 1.2, cacheReadPerMillion: 0.24, cacheWritePerMillion: 0, outputPerMillion: 4.8 },
  },
}

/**
 * 别名规则 → 价目表主键。
 *
 * 顺序有意义：**先具体后笼统**。旧版的 `^glm-` 排在 `glm-5.3-flash` 这类精确键之前
 * 不成问题（精确命中优先），但把 `^gpt-` 一律压到 gpt-5.4 会让 gpt-6-astra 这种
 * 贵得多的模型按 5.4 计价 —— 所以贵的族写在前面。
 */
const ALIAS_RULES = [
  { match: /^deepseek-(v4-)?flash/i, target: 'deepseek-flash' },
  { match: /^deepseek-v4-?\.?1-flash/i, target: 'deepseek-v4.1-flash' },
  { match: /^deepseek-v4-?pro/i, target: 'deepseek-v4-pro' },
  { match: /^deepseek-(chat|reasoner)$/i, target: 'deepseek-flash' },
  { match: /^deepseek-r1/i, target: 'deepseek-reasoner' },
  { match: /^deepseek-v3/i, target: 'deepseek-chat' },
  { match: /^gpt-6/i, target: 'gpt-5.4' },
  { match: /^gpt-5\.[5-9]/i, target: 'gpt-5.4' },
  { match: /^gpt-/i, target: 'gpt-5.4' },
  { match: /^claude-.*opus/i, target: 'claude-opus-4.5' },
  { match: /^claude-/i, target: 'claude-sonnet-4.5' },
  { match: /^glm-.*flash/i, target: 'glm-5.3-flash' },
  { match: /^glm-/i, target: 'glm-5.3' },
  { match: /^kimi-k3/i, target: 'kimi-k3' },
  { match: /^kimi-k2\./i, target: 'kimi-k2.6' },
  { match: /^hy3|^hunyuan/i, target: 'hy3' },
  { match: /^intern-/i, target: 'intern-s2' },
  { match: /^qwen3-coder/i, target: 'qwen3-coder-plus' },
  { match: /^qwen/i, target: 'qwen3-max' },
  { match: /^doubao|^seed_/i, target: 'doubao-seed-1.6' },
]

function parseTime(value, fallback) {
  if (typeof value !== 'string') return fallback
  const clean = value.replace(/：/g, ':').trim()
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(clean)
  if (!m) return fallback
  const h = Number.parseInt(m[1], 10)
  const min = Number.parseInt(m[2], 10)
  return { text: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`, minutes: h * 60 + min }
}

/** 规整外部传入（或磁盘读回）的价目配置，坏值静默回落到默认。 */
export function normalizePricing(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const base = DEFAULT_PRICING
  const schedule = source.peakSchedule && typeof source.peakSchedule === 'object' ? source.peakSchedule : {}
  const rawIntervals = Array.isArray(schedule.intervals) && schedule.intervals.length > 0
    ? schedule.intervals
    : base.peakSchedule.intervals
  const intervals = []
  for (const item of rawIntervals) {
    const start = parseTime(item?.start, null)
    const end = parseTime(item?.end, null)
    if (start && end) intervals.push({ text: `${start.text}-${end.text}`, startMinutes: start.minutes, endMinutes: end.minutes })
  }
  const pricing = {}
  const incoming = source.pricing && typeof source.pricing === 'object' ? source.pricing : base.pricing
  for (const [model, value] of Object.entries(incoming)) {
    if (!value || typeof value !== 'object') continue
    const entry = {}
    if (value.peak || value.offpeak) {
      for (const tier of ['peak', 'offpeak']) {
        const src = value[tier]
        if (!src || typeof src !== 'object') continue
        const out = {}
        for (const key of ['uncachedInputPerMillion', 'cacheReadPerMillion', 'cacheWritePerMillion', 'outputPerMillion']) {
          const n = src[key]
          if (typeof n === 'number' && Number.isFinite(n) && n >= 0) out[key] = n
        }
        entry[tier] = out
      }
    } else {
      for (const key of ['uncachedInputPerMillion', 'cacheReadPerMillion', 'cacheWritePerMillion', 'outputPerMillion']) {
        const n = value[key]
        if (typeof n === 'number' && Number.isFinite(n) && n >= 0) entry[key] = n
      }
    }
    pricing[model] = entry
  }
  const budgetSrc = source.budget && typeof source.budget === 'object' ? source.budget : base.budget
  const day = typeof budgetSrc.day === 'number' && budgetSrc.day > 0 ? budgetSrc.day : base.budget.day
  const month = typeof budgetSrc.month === 'number' && budgetSrc.month > 0 ? budgetSrc.month : base.budget.month
  /* 倍率：内置默认 → 用户配置覆盖。用户的空对象不会把默认抹掉（只在有键时合并）。 */
  const providerMultipliers = {
    ...normalizeMultipliers(base.providerMultipliers),
    ...normalizeMultipliers(source.providerMultipliers),
  }
  return {
    currency: typeof source.currency === 'string' && source.currency ? source.currency : base.currency,
    weekendOffpeak: schedule.weekendOffpeak !== false,
    intervals,
    budget: { day, month },
    pricing,
    providerMultipliers,
  }
}

/**
 * 判定某个时刻是否为峰时。
 * @param {number} time Unix 毫秒
 * @param {ReturnType<typeof normalizePricing>} config 已规整的价目配置
 */
export function isPeak(time, config) {
  const beijing = new Date(time + 8 * 3_600_000)
  const day = beijing.getUTCDay()
  if (config.weekendOffpeak && (day === 0 || day === 6)) return false
  const minutes = beijing.getUTCHours() * 60 + beijing.getUTCMinutes()
  for (const interval of config.intervals) {
    if (minutes >= interval.startMinutes && minutes < interval.endMinutes) return true
  }
  return false
}

/** 查一个模型的有效价格档：精确命中优先，否则走别名规则。 */
export function resolvePricing(model, config) {
  if (typeof model !== 'string' || !model) return undefined
  const direct = config.pricing[model]
  if (direct !== undefined) return direct
  for (const rule of ALIAS_RULES) {
    if (rule.match.test(model)) {
      const hit = config.pricing[rule.target]
      if (hit !== undefined) return hit
    }
  }
  return undefined
}

/**
 * 供应商倍率。
 *
 * 为什么需要它：DSH 日志里的 provider 是**用户自己给网关起的别名**
 * （workbuddy / flash / shuosheng …），不是厂商。同一家中转站常常
 * 「按官方价 × 折扣」收费，而官方表里没法表达这个折扣。
 *
 * 有了倍率就不必为每个 provider 重复维护一整套 24 条价目：
 * 只需给该 provider 一个系数，最终单价 = 官方价 × 系数。
 *
 * 解析顺序（后面的覆盖前面的）：
 *   DEFAULT_PRICING.providerMultipliers → 用户 json 里的 providerMultipliers
 *
 * 特殊值：
 *   1    = 按官方价（默认）
 *   0.8  = 打八折
 *   null = 该 provider 不计费（例如免费额度、内部报销）
 */
/**
 * 规整 provider 倍率表。
 * 只接受有限正数与 null；其它一律丢弃（宁可回落默认，也不要 NaN 污染全局）。
 * @param {Record<string, unknown>} raw
 * @returns {Record<string, number|null>}
 */
export function normalizeMultipliers(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [provider, value] of Object.entries(raw)) {
    if (typeof provider !== 'string' || !provider) continue
    if (value === null) { out[provider] = null; continue }
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      out[provider] = value
    }
  }
  return out
}

/**
 * 取某个 provider 的倍率。未配置时为 1（按官方价），显式 null 表示不计费。
 * @param {string} provider
 * @param {ReturnType<typeof normalizePricing>} config
 * @returns {number|null}
 */
export function multiplierOf(provider, config) {
  if (!provider || typeof provider !== 'string') return 1
  const table = config?.providerMultipliers
  if (!table || typeof table !== 'object') return 1
  if (!Object.prototype.hasOwnProperty.call(table, provider)) return 1
  return table[provider]
}

/**
 * 取一个价格字段在该时刻生效的值。
 * 分档模型按峰谷取；只有一档时另一档兜底；平铺模型直接取顶层字段。
 */
export function priceAt(model, time, key, config) {
  const entry = resolvePricing(model, config)
  if (entry === undefined) return undefined
  if (entry.peak !== undefined || entry.offpeak !== undefined) {
    const tier = isPeak(time, config) ? (entry.peak ?? entry.offpeak) : (entry.offpeak ?? entry.peak)
    return tier?.[key]
  }
  return entry[key]
}

/**
 * 单条 usage 的费用。
 *
 * 计算顺序：先按模型查单价 → 算出官方价 → 再乘该 provider 的倍率。
 * 倍率只在最后乘一次，所以「峰谷折扣」与「供应商折扣」互不干扰，
 * 不会出现折扣叠加错位。
 *
 * @param {string} model
 * @param {{inputTokens?:number,outputTokens?:number,cacheReadTokens?:number,cacheWriteTokens?:number}} usage
 * @param {number} time
 * @param {ReturnType<typeof normalizePricing>} config
 * @param {string} [provider] 用于套倍率；不传则按 1 倍
 * @returns {number|undefined} 该模型无任何价目时返回 undefined（区别于「免费」的 0）
 */
export function costOf(model, usage, time, config, provider) {
  if (resolvePricing(model, config) === undefined) return undefined
  const mult = multiplierOf(provider, config)
  if (mult === null) return 0            // 显式标记为不计费
  const uncached = usage.inputTokens ?? 0
  const cacheRead = usage.cacheReadTokens ?? 0
  const cacheWrite = usage.cacheWriteTokens ?? 0
  const output = usage.outputTokens ?? 0
  const base = (
    uncached * (priceAt(model, time, 'uncachedInputPerMillion', config) ?? 0)
    + cacheRead * (priceAt(model, time, 'cacheReadPerMillion', config) ?? 0)
    + cacheWrite * (priceAt(model, time, 'cacheWritePerMillion', config) ?? 0)
    + output * (priceAt(model, time, 'outputPerMillion', config) ?? 0)
  ) / 1_000_000
  return base * mult
}
