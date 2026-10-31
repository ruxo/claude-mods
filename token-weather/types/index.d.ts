export type Forecast = {
  history: number[]
  window: number
  percent: number
  startedAt: number
  memoryDir?: string
}

/** One rate-limit window: how much is used, and when it resets in epoch ms. */
export type Limit = {
  percent: number
  resetsAt?: number
}

export type Limits = {
  fiveHour?: Limit
  weekly?: Limit
}

declare module 'claude-code' {
  interface PluginState {
    'token-weather': { forecast: Forecast | null; limits: Limits; now: number }
  }
}
