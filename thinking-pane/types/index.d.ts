export type Thought = {
  turnId: string
  prompt: string
  text: string
  isLive: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'thinking-pane': { thoughts: Thought[]; expanded: string[] }
  }
}
