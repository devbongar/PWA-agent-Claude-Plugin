// One wiki page as the brain view sees it.
export type SnapPage = {
  id: string // path under wiki/, without .md
  s: string // section: clients, projects, decisions, topics, people, sources, other
  t: string // title
  l: number[] // indices of the pages it links to
  m: number // last modified (ms)
}

export type BrainSnapshot = {
  pages: SnapPage[]
  waiting: number // files in raw/ not yet ingested
  questions: string[] // open questions (first few)
  lastIngestAt?: number
  librarian: { running: boolean; count: number }
  at: number
}

export type ViewMode = 'library' | 'map'

declare module 'claude-code' {
  interface PluginState {
    'ph1-brain': { snapshot: Shaped<BrainSnapshot>; mode: Shaped<ViewMode> }
  }
}
