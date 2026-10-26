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

const isOurSkill = (skill: string, pluginName: string | undefined, name: string) =>
  new RegExp(`(^|:)${name}$`).test(skill) && (pluginName === undefined || pluginName === 'ph1-pwa-kit')

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
    $.ui.status(statusText(await read($, gateAtom)))
    return next(e)
  })

  on('skill.prompt', async ($, e, next) => {
    // /new-feature turns the gate on for this session (a fresh feature, fresh gates).
    if (/(^|:)new-feature$/.test(e.skill)) {
      await set($, () => ({ ...EMPTY, active: true }))
      return next(e)
    }
    // /ph1-pwa-kit:ship-gate. Its skill can't be invoked by the model (disable-model-invocation),
    // so reaching here means the person typed it: they alone may skip or turn off the gate.
    if (isOurSkill(e.skill, e.pluginName, 'ship-gate')) {
      const computed = await next(e)
      const arg = (/PH1_SHIP_GATE_ARGS:(.*)/.exec(computed.text)?.[1] ?? '').trim().toLowerCase()
      return { text: `Show the person this ship gate result exactly as written, and do nothing else:\n\n${await gateCommand($, arg)}` }
    }
    return next(e)
  })

  // Track reviewer and QA agents by id.
  on('agent.spawn', async ($, e, next) => {
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
