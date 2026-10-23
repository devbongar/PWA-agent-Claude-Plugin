export type OfficeAgent = {
  id: string
  type: string
  description: string
  startedAt: number
  endedAt?: number
  activity?: string
}

export type LeadState = { activity?: string; at: number }

declare module 'claude-code' {
  interface PluginState {
    'agent-office': { agents: Shaped<OfficeAgent[]>; lead: Shaped<LeadState> }
  }
}
