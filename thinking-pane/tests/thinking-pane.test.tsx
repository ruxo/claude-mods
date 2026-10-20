import { describe, expect, mock, test } from 'claude-code/testing'

import { appendThinking, endTurn, keepShown, startTurn, toggle } from '../hooks/thoughts'

const PANE = {
  plugin: 'thinking-pane',
  component: 'Pane',
  requestId: 'thinking',
  props: {
    title: 'Thinking',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

describe('thoughts', () => {
  test('keeps the last 3 turns', async () => {
    let list = startTurn([], 't1', 'one')
    for (const id of ['t2', 't3', 't4']) {
      list = startTurn(list, id, id)
    }
    expect(list.map(one => one.turnId)).toEqual(['t2', 't3', 't4'])
  })

  test('appends to its own turn and ends it', async () => {
    const list = appendThinking(startTurn(startTurn([], 't1', 'a'), 't2', 'b'), 't2', 'hm')
    expect(list.map(one => one.text)).toEqual(['', 'hm'])
    expect(endTurn(list, 't2').map(one => one.isLive)).toEqual([true, false])
  })

  test('a past thought opens and closes', async () => {
    expect(toggle([], 't1')).toEqual(['t1'])
    expect(toggle(['t1', 't2'], 't1')).toEqual(['t2'])
  })

  test('open marks of dropped turns go', async () => {
    const list = startTurn(startTurn([], 't2', 'b'), 't3', 'c')
    expect(keepShown(['t1', 't2'], list)).toEqual(['t2'])
  })

  test('the headline is one line, clipped', async () => {
    const [one] = startTurn([], 't1', `line one\nline two ${'x'.repeat(80)}`)
    expect(one?.prompt.startsWith('line one line two')).toBe(true)
    expect(one?.prompt.endsWith('…')).toBe(true)
  })
})

test('thinking streams into the pane and passes through untouched', async ($, on) => {
  mock.clock(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('turn.step', async function* () {
    yield { kind: 'thinking', index: 0, text: 'Let me ' } as const
    yield { kind: 'thinking', index: 0, text: 'check.' } as const
    yield { kind: 'text', index: 1, text: 'Answer' } as const
    yield { kind: 'thinking', index: 2, text: 'Second block.' } as const
    return { turnId: 't1', index: 0, answer: 'Answer', toolUses: [], stopReason: 'end_turn', usage: null } as const
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const empty = await $.ui.mount({ ...PANE, surface })
    expect(await empty.find({ type: 'Text', text: /No thinking yet/ })).toBeDefined()
    await empty.unmount()
  }

  await $.turn.start({ text: 'why is the sky blue?', turnId: 't1' })
  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'm', messageCount: 1 })
  const kinds: string[] = []
  let step = await stream.next()
  while (step.done !== true) {
    kinds.push(step.value.kind)
    step = await stream.next()
  }
  expect(kinds).toEqual(['thinking', 'thinking', 'text', 'thinking'])
  expect(step.value.answer).toBe('Answer')

  for (const surface of ['terminal', 'desktop'] as const) {
    const live = await $.ui.mount({ ...PANE, surface })
    expect(await live.find({ type: 'Text', text: /● Thinking: why is the sky blue\?/ })).toBeDefined()
    expect(await live.find({ type: 'Text', text: 'Let me check.\n\nSecond block.' })).toBeDefined()
    await live.unmount()
  }

  await $.turn.complete({ answer: 'Answer', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

  const body = { type: 'Text', text: 'Let me check.\n\nSecond block.' } as const
  for (const surface of ['terminal', 'desktop'] as const) {
    const done = await $.ui.mount({ ...PANE, surface })
    expect(await done.find({ type: 'Button', text: '▸ Thought: why is the sky blue?' })).toBeDefined()
    expect(await done.find(body)).toBeUndefined()

    await done.press({ key: 'thought-t1' })
    expect(await done.find({ type: 'Button', text: '▾ Thought: why is the sky blue?' })).toBeDefined()
    expect(await done.find(body)).toBeDefined()

    await done.press({ key: 'thought-t1' })
    expect(await done.find(body)).toBeUndefined()
    await done.unmount()
  }
})

test('the thinking still lands when the follow-to-end scroll cannot be served', async ($, on) => {
  mock.clock(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* () {
    yield { kind: 'thinking', index: 0, text: 'one' } as const
    return { turnId: 't1', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: null } as const
  })

  await $.turn.start({ text: 'first', turnId: 't1' })
  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'm', messageCount: 1 })
  let step = await stream.next()
  while (step.done !== true) {
    step = await stream.next()
  }

  const live = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await live.find({ type: 'Text', text: /● Thinking: first/ })).toBeDefined()
  expect(await live.find({ type: 'Text', text: 'one' })).toBeDefined()
  await live.unmount()
})
