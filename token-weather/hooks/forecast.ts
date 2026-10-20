import type { Forecast, Limit, Limits } from '../types'

export type Weather = { icon: string; word: string; color: string }

export type RateLimit = { kind: string; percentUsed: number; resetsAt?: string }

export type Reading = {
  tokens: number
  window: number
  percent?: number
  startedAt: number
}

const BARS = '▁▂▃▄▅▆▇█'
const TURNS = 12

export const weatherFor = (percent: number): Weather =>
  percent < 25
    ? { icon: '☀', word: 'Clear', color: '#00FF00' }
    : percent < 50
      ? { icon: '☁', word: 'Cloudy', color: 'cyan' }
      : percent < 75
        ? { icon: '☂', word: 'Showers', color: 'yellow' }
        : percent < 90
          ? { icon: '☇', word: 'Storm', color: '#FFC0CB' }
          : { icon: '↯', word: 'Limit soon', color: 'red' }

const oneDecimal = (n: number): string => n.toFixed(1).replace(/\.0$/, '')

export const formatTokens = (n: number): string =>
  n >= 1_000_000
    ? `${oneDecimal(n / 1_000_000)}M`
    : n >= 1000
      ? `${oneDecimal(n / 1000)}k`
      : String(n)

export const sparkline = (history: readonly number[], window: number): string =>
  history
    .map(tokens => {
      const level = window > 0 ? Math.floor((tokens / window) * BARS.length) : 0
      return BARS[Math.max(0, Math.min(BARS.length - 1, level))]
    })
    .join('')

export const addedLine = (history: readonly number[]): string | undefined => {
  const last = history.at(-1)
  const before = history.at(-2)
  if (last === undefined || before === undefined) {
    return undefined
  }
  const added = last - before
  return added >= 0
    ? `▲ +${formatTokens(added)} last turn`
    : `▼ -${formatTokens(-added)} last turn`
}

export const record = (prev: Forecast | null, reading: Reading): Forecast => {
  const isSameSession = prev !== null && prev.startedAt === reading.startedAt
  const history = [...(isSameSession ? prev.history : []), reading.tokens].slice(-TURNS)
  const percent =
    reading.percent ??
    (reading.window > 0 ? Math.round((reading.tokens * 100) / reading.window) : 0)

  return { history, window: reading.window, percent, startedAt: reading.startedAt }
}

const limitOf = (rateLimits: readonly RateLimit[], kind: string): Limit | undefined => {
  const found = rateLimits.find(one => one.kind === kind)
  if (found === undefined) {
    return undefined
  }
  const resetsAt = found.resetsAt === undefined ? NaN : Date.parse(found.resetsAt)
  return Number.isNaN(resetsAt) ? { percent: found.percentUsed } : { percent: found.percentUsed, resetsAt }
}

export const limitsFrom = (rateLimits: readonly RateLimit[]): Limits => ({
  fiveHour: limitOf(rateLimits, 'five_hour'),
  weekly: limitOf(rateLimits, 'seven_day'),
})

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export const untilReset = (resetsAt: number, now: number): string => {
  const left = resetsAt - now
  if (left <= 0) {
    return 'now'
  }
  if (left >= DAY) {
    return `${Math.floor(left / DAY)}d${Math.floor((left % DAY) / HOUR)}h`
  }
  if (left >= HOUR) {
    return `${Math.floor(left / HOUR)}h${Math.floor((left % HOUR) / MINUTE)}m`
  }
  return `${Math.ceil(left / MINUTE)}m`
}

export const limitLine = (label: string, limit: Limit | undefined, now: number): string =>
  limit === undefined
    ? `${label} –`
    : limit.resetsAt === undefined
      ? `${label} ${limit.percent}%`
      : `${label} ${limit.percent}% ↻${untilReset(limit.resetsAt, now)}`
