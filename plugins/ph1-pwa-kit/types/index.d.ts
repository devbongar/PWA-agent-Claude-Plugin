export type GateAgent = { type: string; startedAt: number }

export type GateState = {
  active: boolean
  firstChangeAt: number
  lastChangeAt: number
  reviewedAt: number
  qaAt: number
  skipUntilChange: boolean
  agents: Record<string, GateAgent>
}

declare module 'claude-code' {
  interface PluginState {
    'ph1-pwa-kit': { gate: Shaped<GateState> }
  }
}
