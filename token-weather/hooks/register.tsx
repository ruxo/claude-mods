import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Limit } from '../types'
import { addedLine, formatTokens, limitLine, limitsFrom, record, sparkline, weatherFor } from './forecast'

const TICK_MS = 60_000
const forecast = atom({ plugin: 'token-weather', key: 'forecast' } as const, null)
const limits = atom({ plugin: 'token-weather', key: 'limits' } as const, {})
const now = atom({ plugin: 'token-weather', key: 'now' } as const, 0)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const usage = await $.session.usage()
    await update($, limits, () => limitsFrom(usage.rateLimits))
    const at = await $.clock.now()
    await update($, now, () => at)
    $.clock.every(TICK_MS, () => {
      void $.clock.now().then(t => update($, now, () => t))
    })

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      const at = await $.clock.now()
      await update($, limits, () => limitsFrom(e.rateLimits))
      await update($, now, () => at)
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId !== undefined) {
      return ran
    }

    const usage = await $.session.usage()
    const at = await $.clock.now()
    await update($, limits, () => limitsFrom(usage.rateLimits))
    await update($, now, () => at)
    const { tokens, window, percent } = usage.context
    if (tokens !== undefined) {
      const reading = { tokens, window, percent, startedAt: usage.startedAt }
      await update($, forecast, prev => record(prev, reading))
    }

    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const context = await read($, forecast)
    const { fiveHour, weekly } = await read($, limits)
    if (e.props.hasSurvey || (fiveHour === undefined && weekly === undefined && context === null)) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const at = await read($, now)
    const latest = context?.history.at(-1)
    const added = context === null ? undefined : addedLine(context.history)
    const window = (label: string, limit: Limit | undefined) => {
      const weather = limit === undefined ? undefined : weatherFor(limit.percent)
      return (
        <Box>
          {weather !== undefined && <Text color={weather.color}>{`${weather.icon} ${weather.word} `}</Text>}
          <Text>{limitLine(label, limit, at)}</Text>
        </Box>
      )
    }

    return (
      <Box>
        {window('5h', fiveHour)}
        <Text>{'  ·  '}</Text>
        {window('week', weekly)}
        {context !== null && latest !== undefined && (
          <Text dimColor>
            {`  ·  ctx ${context.percent}% ${formatTokens(latest)}/${formatTokens(context.window)} ${sparkline(context.history, context.window)}`}
          </Text>
        )}
        {added !== undefined && <Text dimColor>{`  ${added}`}</Text>}
      </Box>
    )
  })
}
