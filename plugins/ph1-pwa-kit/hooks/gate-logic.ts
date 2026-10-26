// Pure rules of the ship gate: no engine calls, so they are easy to test.
import type { GateState } from '../types'

export const EMPTY: GateState = {
  active: false,
  firstChangeAt: 0,
  lastChangeAt: 0,
  reviewedAt: 0,
  qaAt: 0,
  skipUntilChange: false,
  agents: {},
}

// Commands that ship code: commit, push, merge, open or merge a PR.
const SHIP = /\bgit\s+(?:-C\s+\S+\s+)?(?:commit|push|merge)\b|\bgh\s+pr\s+(?:create|merge)\b/

export const isShipCommand = (command: string): boolean => SHIP.test(command)

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
export const isEditTool = (tool: string): boolean => EDIT_TOOLS.has(tool)

const short = (type: string) => type.split(':').pop() ?? type
export const isReviewer = (type: string) => short(type) === 'code-reviewer'
export const isQa = (type: string) => short(type) === 'qa-engineer'

// Does an edit by this agent (undefined = the lead) count as a code change?
// QA writes tests and reviewers shouldn't edit, so neither makes the gates stale.
export const editCounts = (agentType: string | undefined): boolean =>
  !(agentType && (isQa(agentType) || isReviewer(agentType)))

export type Missing = { review: boolean; qa: boolean }

export function missing(s: GateState): Missing {
  if (!s.active || s.skipUntilChange || s.lastChangeAt === 0) return { review: false, qa: false }
  return {
    // Review must have started after the first code change of the feature.
    review: s.reviewedAt < s.firstChangeAt,
    // QA must have started after the last code change (so fixes get tested too).
    qa: s.qaAt < s.lastChangeAt,
  }
}

export function denyText(m: Missing): string | undefined {
  if (!m.review && !m.qa) return undefined
  const parts = [
    m.review ? 'ph1-pwa-kit:code-reviewer has not reviewed this feature' : '',
    m.qa ? 'ph1-pwa-kit:qa-engineer has not tested the latest code changes' : '',
  ].filter(Boolean)
  return (
    `Ship gate (ph1-pwa-kit /new-feature): ${parts.join('; ')}. ` +
    `Run ${[m.review ? 'code-reviewer' : '', m.qa ? 'qa-engineer' : ''].filter(Boolean).join(' and then ')} before committing, pushing or opening a PR. ` +
    `Do not try to get around this. If the person wants to ship anyway, ask them to type /ph1-ship-gate skip themselves.`
  )
}

export function statusText(s: GateState): string | undefined {
  if (!s.active || s.lastChangeAt === 0) return s.active ? 'Ship gate: on' : undefined
  if (s.skipUntilChange) return 'Ship gate: skipped by you'
  const m = missing(s)
  return `Ship gate: review ${m.review ? '✗' : '✓'} · QA ${m.qa ? '✗' : '✓'}`
}

// Is a file inside the project? Edits elsewhere (for example the second brain's wiki) aren't code changes.
const normPath = (p: string) => {
  const s = p.replace(/\\/g, '/').replace(/\/+$/, '')
  return /^[a-zA-Z]:\//.test(s) ? s.toLowerCase() : s
}
export function inProject(filePath: string, cwd: string): boolean {
  if (!cwd) return true
  const p = filePath.replace(/\\/g, '/')
  const abs = /^[a-zA-Z]:\//.test(p) || p.startsWith('/') ? p : `${cwd.replace(/\\/g, '/')}/${p}`
  const a = normPath(abs)
  const c = normPath(cwd)
  return a === c || a.startsWith(c + '/')
}
