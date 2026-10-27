// Ship gate: once /new-feature is used in a session, commits, pushes and PRs are blocked
// until code-reviewer has reviewed the feature and qa-engineer has tested the latest changes.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { GateState } from '../types'
import { EMPTY, denyText, editCounts, inProject, isEditTool, isQa, isReviewer, isShipCommand, missing, statusText } from './gate-logic'

let projectDir = ''

const gateAtom = atom({ plugin: 'ph1-pwa-kit', key: 'gate' } as const, EMPTY, { shape: 'gate-1' })

async function set($: EngineInterface, fn: (s: GateState) => GateState): Promise<GateState> {
  await update($, gateAtom, fn)
  const s = await read($, gateAtom)
  $.ui.status(statusText(s))
  return s
}

// An agent finished: if it was a reviewer or QA, record when its work started.
async function finish($: EngineInterface, agentId: string): Promise<void> {
  const s = await read($, gateAtom)
  const a = s.agents[agentId]
  if (!a) return
  await set($, g => {
    const agents = { ...g.agents }
    delete agents[agentId]
    return {
      ...g,
      agents,
      reviewedAt: isReviewer(a.type) ? Math.max(g.reviewedAt, a.startedAt) : g.reviewedAt,
      qaAt: isQa(a.type) ? Math.max(g.qaAt, a.startedAt) : g.qaAt,
    }
  })
}

const STATUS_TOOL = 'mcp__ph1-pwa-kit__ship_gate_status'
const CHANGE_TOOL = 'mcp__ph1-pwa-kit__ship_gate_change'
// Both workflows turn the gate on: the full track (/new-feature) and the quick track (/quick-change).
const isNewFeature = (name: string) => /(^|:)(new-feature|quick-change)$/.test(name.replace(/^\//, ''))
const isDeveloper = (type: string) => /(^|:)(frontend|backend)-developer$/.test(type)

// Turn the gate on (fresh gates), unless it's already on for this feature.
async function activate($: EngineInterface, fresh: boolean): Promise<void> {
  await set($, g => (fresh || !g.active ? { ...EMPTY, active: true } : g))
}

// Skip/off must come from the person: their latest message has to ask for it.
async function personAsked($: EngineInterface, arg: string): Promise<boolean> {
  const rows = await $.session.messages()
  const lastUser = [...rows].reverse().find(r => r.role === 'user' && (r.toolResults ?? []).length === 0)
  const text = (lastUser?.text ?? '').toLowerCase()
  return /ship[-_ ]?gate/.test(text) && new RegExp(`\\b${arg}\\b`).test(text)
}

async function gateCommand($: EngineInterface, arg: string): Promise<string> {
  if (arg === 'skip') {
    await set($, g => ({ ...g, skipUntilChange: true }))
    return 'Ship gate skipped until the next code change. You can commit, push or open a PR now.'
  }
  if (arg === 'off') {
    await set($, g => ({ ...g, active: false }))
    return 'Ship gate turned off for this conversation.'
  }
  if (arg === 'on') return (statusText(await set($, g => ({ ...g, active: true })))) ?? 'Ship gate: on'
  const s = await read($, gateAtom)
  const m = missing(s)
  return !s.active
    ? 'Ship gate: off (it turns on when you run /ph1-pwa-kit:new-feature, or with /ph1-pwa-kit:ship-gate on).'
    : `${statusText(s)}${m.review || m.qa ? `\n${denyText(m)}` : '\nCommits, pushes and PRs are allowed.'}`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    projectDir = e.cwd
    const result = await next(e)
    await $.tool.register({ name: 'ship_gate_status', description: 'Show the ph1-pwa-kit ship gate status: whether code review and QA have run for the latest code changes.', isDeferred: false })
    await $.tool.register({
      name: 'ship_gate_change',
      description: "Change the ph1-pwa-kit ship gate. Only when the person's latest message asks for it (/ph1-pwa-kit:ship-gate skip|off|on); never on your own initiative.",
      inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['skip', 'off', 'on'] } }, required: ['action'] },
      isDeferred: false,
    })
    $.ui.status(statusText(await read($, gateAtom)))
    return result
  })

  // The gate turns on with /new-feature. Several signals, since some events can be held back
  // by plugins above this one: the typed command, the skill expanding, or the Skill tool.
  on('prompt.submit', async ($, e, next) => {
    if (e.command && isNewFeature(e.command.name)) await activate($, true)
    return next(e)
  })
  on('skill.prompt', async ($, e, next) => {
    if (isNewFeature(e.skill)) await activate($, true)
    return next(e)
  })

  // The model-facing tools behind /ph1-pwa-kit:ship-gate (registered at session start).
  on('tool.call', { tool: STATUS_TOOL }, async $ => ({ result: await gateCommand($, 'status') }))
  on('tool.call', { tool: CHANGE_TOOL }, async ($, e) => {
    const arg = String((e as { action?: unknown }).action ?? '').trim().toLowerCase()
    if (arg !== 'skip' && arg !== 'off' && arg !== 'on') return { result: 'Unknown action. Use skip, off or on.' }
    if (arg !== 'on' && !(await personAsked($, arg))) {
      return { result: `Refused: only the person can ${arg} the ship gate, by typing /ph1-pwa-kit:ship-gate ${arg} themselves.` }
    }
    return { result: await gateCommand($, arg) }
  })
  // Changing the gate always asks the person (a plugin's ask goes to them, never a classifier).
  on('tool.check', async ($, e, next) => {
    if (e.tool === STATUS_TOOL) return { decision: 'allow', reason: 'ph1-pwa-kit: ship gate status' }
    if (e.tool === CHANGE_TOOL) {
      const action = String((e.input as { action?: unknown } | undefined)?.action ?? '')
      return action === 'on' ? { decision: 'allow', reason: 'ph1-pwa-kit: turning the ship gate on' } : { decision: 'ask', reason: `Allow Claude to ${action} the ship gate?` }
    }
    return next(e)
  })

  // Track reviewer and QA agents by id.
  on('agent.spawn', async ($, e, next) => {
    if (isDeveloper(e.subagentType)) await activate($, false) // building with the team turns the gate on
    const result = await next(e)
    if (result.agentId && (isReviewer(e.subagentType) || isQa(e.subagentType))) {
      const id = result.agentId
      await set($, g => ({ ...g, agents: { ...g.agents, [id]: { type: e.subagentType, startedAt: Date.now() } } }))
    }
    return result
  })
  on('turn.complete', async ($, e, next) => {
    if (e.agentId) await finish($, e.agentId)
    return next(e)
  })
  on('classic.SubagentStop', async ($, e, next) => {
    await finish($, e.agent_id)
    return next(e)
  })

  // Code edits make the gates stale; ship commands are checked against them.
  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    if (tool === 'Skill' && isNewFeature(String((e as { skill?: unknown }).skill ?? ''))) await activate($, true)
    const s = await read($, gateAtom)
    if (!s.active) return next(e)

    if (tool === 'Bash' || tool === 'PowerShell') {
      const command = String((e as { command?: unknown }).command ?? '')
      if (isShipCommand(command)) {
        const why = denyText(missing(s))
        if (why) return { deny: why }
      }
      return next(e)
    }

    if (isEditTool(tool)) {
      const agentType = e.agentId ? s.agents[e.agentId]?.type : undefined
      const filePath = String((e as { file_path?: unknown; notebook_path?: unknown }).file_path ?? (e as { notebook_path?: unknown }).notebook_path ?? '')
      const ran = await next(e)
      if (ran.deny === undefined && !ran.isError && editCounts(agentType) && inProject(filePath, projectDir)) {
        const now = Date.now()
        await set($, g => ({ ...g, firstChangeAt: g.firstChangeAt || now, lastChangeAt: now, skipUntilChange: false }))
      }
      return ran
    }
    return next(e)
  }).catch(($, e, next) => next(e))
}
