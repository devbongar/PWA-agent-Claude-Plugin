export type OfficeAgent = {
  id: string
  type: string
  description: string
  startedAt: number
  endedAt?: number
  activity?: string
}

export type LeadState = { activity?: string; at: number }

export type LimitsState = { readings: { kind: string; percentUsed: number; resetsAt?: string }[]; at: number }

// The brain's snapshot, as ph1-brain shares it in ~/.claude/ph1-brain/view.json.
export type SnapPage = { id: string; s: string; t: string; l: number[]; m: number }
export type BrainSnapshot = {
  pages: SnapPage[]
  waiting: number
  questions: string[]
  lastIngestAt?: number
  librarian: { running: boolean; count: number }
  at: number
}
export type BrainMode = 'library' | 'map'
export type BrainState = { snap?: BrainSnapshot }

declare module 'claude-code' {
  interface PluginState {
    'ph1-office': { agents: Shaped<OfficeAgent[]>; lead: Shaped<LeadState>; limits: Shaped<LimitsState>; brain: Shaped<BrainState>; brainMode: Shaped<BrainMode> }
  }
}
