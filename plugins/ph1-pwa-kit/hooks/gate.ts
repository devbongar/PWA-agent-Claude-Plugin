// Ship gate: once /new-feature is used in a session, commits, pushes and PRs are blocked
// until code-reviewer has reviewed the feature and qa-engineer has tested the latest changes.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { GateState } from '../types'
import { EMPTY, denyText, editCounts, isEditTool, isQa, isReviewer, isShipCommand, missing, statusText } from './gate-logic'

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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'ship-gate',
      description: 'Ship gate for /new-feature: status, on, off, or skip (lets you commit without review/QA until the next code change)',
    })
    $.ui.status(statusText(await read($, gateAtom)))
    return next(e)
  })

  // /new-feature turns the gate on for this session (a fresh feature, fresh gates).
  on('skill.prompt', async ($, e, next) => {
    if (/(^|:)new-feature$/.test(e.skill)) await set($, () => ({ ...EMPTY, active: true }))
    return next(e)
  })

  // Only the person can run this command (typed at the prompt), never the model.
  on('command.run', { command: 'ship-gate' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const byPerson = e.origin.kind === 'composer' || e.origin.kind === 'bridge'
    if (arg === 'skip' || arg === 'off') {
      if (!byPerson) return { text: 'Ship gate: only the person can skip or turn off the gate.' }
      const s = await set($, g => (arg === 'skip' ? { ...g, skipUntilChange: true } : { ...g, active: false }))
      return {
        text: arg === 'skip' ? 'Ship gate skipped until the next code change.' : 'Ship gate turned off for this session.',
        context: [`The person ran /ship-gate ${arg}. ${statusText(s) ?? 'Ship gate: off'}.`],
      }
    }
    if (arg === 'on') {
      const s = await set($, g => ({ ...g, active: true }))
      return { text: statusText(s) ?? 'Ship gate: on' }
    }
    const s = await read($, gateAtom)
    const m = missing(s)
    return {
      text: !s.active
        ? 'Ship gate: off (it turns on when you run /ph1-pwa-kit:new-feature, or with /ship-gate on).'
        : `${statusText(s)}${m.review || m.qa ? `\n${denyText(m)}` : '\nCommits, pushes and PRs are allowed.'}`,
    }
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
      const ran = await next(e)
      if (ran.deny === undefined && !ran.isError && editCounts(agentType)) {
        const now = Date.now()
        await set($, g => ({ ...g, firstChangeAt: g.firstChangeAt || now, lastChangeAt: now, skipUntilChange: false }))
      }
      return ran
    }
    return next(e)
  }).catch(($, e, next) => next(e))
}
