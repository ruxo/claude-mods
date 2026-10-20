import type { Thought } from '../types'

const TURNS = 3
const MAX_CHARS = 20_000
const PROMPT_CHARS = 60

const clip = (text: string): string =>
  text.length > MAX_CHARS ? `…${text.slice(-MAX_CHARS)}` : text

const headline = (prompt: string): string => {
  const line = prompt.replace(/\s+/g, ' ').trim()
  return line.length > PROMPT_CHARS ? `${line.slice(0, PROMPT_CHARS)}…` : line
}

export const startTurn = (thoughts: readonly Thought[], turnId: string, prompt: string): Thought[] =>
  [...thoughts, { turnId, prompt: headline(prompt), text: '', isLive: true }].slice(-TURNS)

export const appendThinking = (
  thoughts: readonly Thought[],
  turnId: string,
  piece: string,
): Thought[] =>
  thoughts.map(one => (one.turnId === turnId ? { ...one, text: clip(one.text + piece) } : one))

export const endTurn = (thoughts: readonly Thought[], turnId: string): Thought[] =>
  thoughts.map(one => (one.turnId === turnId ? { ...one, isLive: false } : one))

/** Opens a closed past thought, or closes an open one. */
export const toggle = (expanded: readonly string[], turnId: string): string[] =>
  expanded.includes(turnId) ? expanded.filter(id => id !== turnId) : [...expanded, turnId]

/** Drops the open marks of turns no longer kept. */
export const keepShown = (expanded: readonly string[], thoughts: readonly Thought[]): string[] =>
  expanded.filter(id => thoughts.some(one => one.turnId === id))

/** The text to add before a block's first piece: a blank line between blocks of one turn. */
export const blockLead = (soFar: string): string => (soFar === '' ? '' : '\n\n')
