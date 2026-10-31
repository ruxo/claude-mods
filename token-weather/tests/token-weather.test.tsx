import type { On, SessionContextBreakdown } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import {
  addedLine,
  formatTokens,
  limitLine,
  limitsFrom,
  memoryDirOf,
  record,
  sparkline,
  untilReset,
  weatherFor,
} from '../hooks/forecast'

const BAND = {
  plugin: 'token-weather',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 9 },
    view: {},
  },
} as const

/** What the engine would draw in the band when the mod passes. */
const engineBand = (on: On) =>
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine band</Text>
  })

const HOUR = 3_600_000
const T0 = Date.parse('2026-10-19T01:00:00Z')
const MEMORY_DIR = 'C:\\Users\\RZ\\.claude\\projects\\demo\\memory'

describe('forecast', () => {
  test('weather follows the thresholds', async () => {
    expect(weatherFor(24).word).toBe('Clear')
    expect(weatherFor(25).word).toBe('Cloudy')
    expect(weatherFor(50).word).toBe('Showers')
    expect(weatherFor(75).word).toBe('Storm')
    expect(weatherFor(89).word).toBe('Storm')
    expect(weatherFor(90).word).toBe('Limit soon')
  })

  test('tokens read as k and M', async () => {
    expect(formatTokens(134_400)).toBe('134.4k')
    expect(formatTokens(200_000)).toBe('200k')
    expect(formatTokens(1_000_000)).toBe('1M')
    expect(formatTokens(512)).toBe('512')
  })

  test('the chart scales to the window', async () => {
    expect(sparkline([0, 100_000, 200_000], 200_000)).toBe('▁▅█')
  })

  test('the last turn reads as added or dropped', async () => {
    expect(addedLine([36_100])).toBeUndefined()
    expect(addedLine([36_100, 134_400])).toBe('▲ +98.3k last turn')
    expect(addedLine([134_400, 40_000])).toBe('▼ -94.4k last turn')
  })

  test('history keeps 12 turns and restarts with a new session', async () => {
    let f = record(null, { tokens: 1, window: 100, startedAt: 1 })
    for (let i = 2; i <= 14; i++) {
      f = record(f, { tokens: i, window: 100, startedAt: 1 })
    }
    expect(f.history).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])
    expect(record(f, { tokens: 5, window: 100, startedAt: 2 }).history).toEqual([5])
  })

  test('the memory directory comes from the auto-memory file', async () => {
    expect(
      memoryDirOf([
        { path: 'C:\\Users\\RZ\\.claude\\CLAUDE.md', type: 'User' },
        { path: `${MEMORY_DIR}\\MEMORY.md`, type: 'AutoMem' },
      ]),
    ).toBe(MEMORY_DIR)
    expect(memoryDirOf([{ path: '/home/u/.claude/projects/p/memory/MEMORY.md', type: 'AutoMem' }])).toBe(
      '/home/u/.claude/projects/p/memory',
    )
    expect(memoryDirOf([{ path: 'C:\\Users\\RZ\\.claude\\CLAUDE.md', type: 'User' }])).toBeUndefined()
  })

  test('the memory directory carries over a turn without one, not into a new session', async () => {
    const f = record(null, { tokens: 1, window: 100, startedAt: 1, memoryDir: MEMORY_DIR })
    expect(record(f, { tokens: 2, window: 100, startedAt: 1 }).memoryDir).toBe(MEMORY_DIR)
    expect(record(f, { tokens: 2, window: 100, startedAt: 2 }).memoryDir).toBeUndefined()
  })
})

describe('rate limits', () => {
  test('the five-hour and weekly windows are picked by kind', async () => {
    const got = limitsFrom([
      { kind: 'five_hour', percentUsed: 34, resetsAt: '2026-10-19T03:13:00Z' },
      { kind: 'seven_day', percentUsed: 12.5 },
      { kind: 'spend_limit', percentUsed: 80 },
    ])
    expect(got.fiveHour).toEqual({ percent: 34, resetsAt: Date.parse('2026-10-19T03:13:00Z') })
    expect(got.weekly).toEqual({ percent: 12.5 })
    expect(limitsFrom([])).toEqual({ fiveHour: undefined, weekly: undefined })
  })

  test('time to reset reads in days, hours or minutes', async () => {
    expect(untilReset(T0 + 3 * 24 * HOUR + 4 * HOUR, T0)).toBe('3d4h')
    expect(untilReset(T0 + 2 * HOUR + 13 * 60_000, T0)).toBe('2h13m')
    expect(untilReset(T0 + 44 * 60_000 + 1, T0)).toBe('45m')
    expect(untilReset(T0, T0)).toBe('now')
  })

  test('a window reads as label, percent and reset', async () => {
    expect(limitLine('5h', { percent: 34, resetsAt: T0 + 2 * HOUR }, T0)).toBe('5h 34% ↻2h0m')
    expect(limitLine('week', { percent: 12 }, T0)).toBe('week 12%')
    expect(limitLine('week', undefined, T0)).toBe('week –')
  })
})

test('the band above the prompt shows each window with its own weather',async ($, on) => {
  mock.clock(on, { now: T0 })
  engineBand(on)
  let tokens = 36_100
  let fiveHour = 20
  on('session.usage', () => ({
    value: {
      startedAt: 1,
      context: {
        tokens,
        window: 200_000,
        percent: Math.round((tokens * 100) / 200_000),
        breakdown: {
          memoryFiles: [{ path: `${MEMORY_DIR}\\MEMORY.md`, type: 'AutoMem', tokens: 900 }],
        } as SessionContextBreakdown,
      },
      rateLimits: [
        { kind: 'five_hour', percentUsed: fiveHour, resetsAt: new Date(T0 + 2 * HOUR + 13 * 60_000).toISOString() },
        { kind: 'seven_day', percentUsed: 12, resetsAt: new Date(T0 + 76 * HOUR).toISOString() },
      ],
    },
  }))
  on('turn.complete', () => ({ text: '' }))
  const turn = (turnId: string) =>
    $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId, reason: 'answer' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const empty = await $.ui.mount({ ...BAND, surface })
    expect(await empty.find({ type: 'Text', text: 'engine band' })).toBeDefined()
    await empty.unmount()
  }

  await turn('t1')
  tokens = 134_400
  fiveHour = 60
  await turn('t2')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: '☂ Showers ' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '5h 60% ↻2h13m' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '☀ Clear ' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'week 12% ↻3d4h' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /ctx 67% 134\.4k\/200k ▂▆/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /▲ \+98\.3k last turn/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: `memory: ${MEMORY_DIR}` })).toBeDefined()
    await ui.unmount()
  }
})

test('a survey keeps the band', async ($, on) => {
  mock.clock(on, { now: T0 })
  engineBand(on)
  on('session.usage', () => ({
    value: { startedAt: 1, context: { window: 200_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 5 }] },
  }))
  on('turn.complete', () => ({ text: '' }))
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true }, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /5h/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'engine band' })).toBeDefined()
  await ui.unmount()
})
