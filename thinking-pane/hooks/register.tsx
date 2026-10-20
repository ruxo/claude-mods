import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { appendThinking, blockLead, endTurn, keepShown, startTurn, toggle } from './thoughts'

const PANE = 'thinking'
const TITLE = 'Thinking'
const FLUSH_MS = 150
const thoughts = atom({ plugin: 'thinking-pane', key: 'thoughts' } as const, [])
const expanded = atom({ plugin: 'thinking-pane', key: 'expanded' } as const, [])

/** True once the person scrolled the pane during the live turn: the follow stops until the next turn. */
let personScrolled = false

/**
 * Keeps the pane's window on its end, where the live turn's newest text lands, unless the person took over.
 * A scroll nothing can serve (no surface, the pane closed) is no reason to drop the thinking itself.
 */
const follow = async ($: EngineInterface) => {
  if (!personScrolled) {
    await $.ui.scroll({ in: PANE, to: 'end', block: 'end' }).catch(() => ({}))
  }
}

export const register: Register = on => {
  on('ui.scroll', { requestId: PANE }, ($, e, next) => {
    if (e.origin.kind === 'person') {
      personScrolled = true
    }

    return next(e)
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'thinking-pane',
      description: "Show the model's thinking live in a pane",
    })
    void $.ui.open({ id: PANE, title: TITLE })

    return next(e)
  })

  on('command.run', { command: 'thinking-pane' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: TITLE })

    return { text: opened.isPlaced ? 'Thinking pane opened.' : `Thinking pane not placed: ${opened.reason}` }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      personScrolled = false
      await update($, thoughts, list => startTurn(list, e.turnId, e.text))
      const kept = await read($, thoughts)
      await update($, expanded, ids => keepShown(ids, kept))
      await follow($)
    }

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const stream = next(e)
    if (e.agentId !== undefined) {
      return yield* stream
    }

    const seen = new Set<number>()
    let pending = ''
    let soFar = (await read($, thoughts)).find(one => one.turnId === e.turnId)?.text ?? ''
    let flushedAt = await $.clock.now()
    const flush = async () => {
      if (pending !== '') {
        const piece = pending
        pending = ''
        await update($, thoughts, list => appendThinking(list, e.turnId, piece))
        await follow($)
      }
      flushedAt = await $.clock.now()
    }

    let step = await stream.next()
    while (step.done !== true) {
      const chunk = step.value
      if (chunk.kind === 'thinking' && chunk.text !== '') {
        const lead = seen.has(chunk.index) ? '' : blockLead(soFar)
        seen.add(chunk.index)
        pending += lead + chunk.text
        soFar += lead + chunk.text
        if ((await $.clock.now()) - flushedAt >= FLUSH_MS) {
          await flush()
        }
      }
      yield chunk
      step = await stream.next()
    }
    await flush()

    return step.value
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await update($, thoughts, list => endTurn(list, e.turnId))
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, thoughts)
    if (list.length === 0) {
      return <Text dimColor>No thinking yet: it shows here as the next turn thinks.</Text>
    }
    const open = await read($, expanded)
    const about = (prompt: string) => (prompt === '' ? '' : `: ${prompt}`)
    const body = (text: string, isDim: boolean) => (
      <Text dimColor={isDim}>{text === '' ? '(no thinking shown yet)' : text}</Text>
    )

    return (
      <Box flexDirection="column" gap={1}>
        {list.map(one => {
          if (one.isLive) {
            return (
              <Box flexDirection="column">
                <Text bold color="claude">{`● Thinking${about(one.prompt)}`}</Text>
                {body(one.text, false)}
              </Box>
            )
          }
          const isOpen = open.includes(one.turnId)
          return (
            <Box flexDirection="column">
              <Button
                key={`thought-${one.turnId}`}
                label={`${isOpen ? '▾' : '▸'} Thought${about(one.prompt)}`}
                plain
                dimColor
                onPress={() => update($, expanded, ids => toggle(ids, one.turnId))}
              />
              {isOpen && body(one.text, true)}
            </Box>
          )
        })}
      </Box>
    )
  })
}
