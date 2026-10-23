import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { LeadState, OfficeAgent } from '../types'
import { activityFor, formatElapsed, officeSvg, roleFor, roleIndex } from './office'

const PANE = 'office'
const TITLE = 'Agent office'

// Change a shape tag when the stored fields change: it declines what an older version stored.
const agentsAtom = atom({ plugin: 'agent-office', key: 'agents' } as const, [] as OfficeAgent[], { shape: 'agents-1' })
const leadAtom = atom({ plugin: 'agent-office', key: 'lead' } as const, { at: 0 } as LeadState, { shape: 'lead-1' })

const MAX_KEPT = 30

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'office', description: 'Show the agent office: watch your agents walk to their desks' })
    void $.ui.open({ id: PANE, title: TITLE })
    return next(e)
  })

  on('command.run', { command: 'office' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: 'Agent office opened.' }
  })

  // An agent starts: it gets a record, and its character walks to its desk.
  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    const id = result.agentId
    if (id) {
      const rec: OfficeAgent = { id, type: e.subagentType, description: e.description, startedAt: Date.now() }
      await update($, agentsAtom, list => [...list.filter(a => a.id !== id), rec].slice(-MAX_KEPT))
    }
    return result
  })

  // Backstop for agents that start without an agent.spawn this mod saw.
  on('classic.SubagentStart', async ($, e, next) => {
    await update($, agentsAtom, list =>
      list.some(a => a.id === e.agent_id)
        ? list
        : [...list, { id: e.agent_id, type: e.agent_type, description: '', startedAt: Date.now() }].slice(-MAX_KEPT),
    )
    return next(e)
  })

  // An agent finishes: its character walks back to the lounge.
  on('classic.SubagentStop', async ($, e, next) => {
    await update($, agentsAtom, list =>
      list.map(a => (a.id === e.agent_id && a.endedAt === undefined ? { ...a, endedAt: Date.now() } : a)),
    )
    return next(e)
  })

  // Each tool call becomes the speech bubble of whoever made it.
  on('tool.call', async ($, e, next) => {
    const label = activityFor(String(e.tool))
    const agentId = e.agentId
    if (agentId) {
      const list = await read($, agentsAtom)
      const mine = list.find(a => a.id === agentId)
      if (mine && mine.endedAt === undefined && mine.activity !== label) {
        await update($, agentsAtom, l => l.map(a => (a.id === agentId ? { ...a, activity: label } : a)))
      }
    } else {
      const lead = await read($, leadAtom)
      if (lead.activity !== label) await update($, leadAtom, () => ({ activity: label, at: Date.now() }))
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await update($, leadAtom, () => ({ activity: undefined, at: Date.now() }))
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text } = ui
    const agents = await read($, agentsAtom)
    const lead = await read($, leadAtom)
    const now = Date.now()
    const active = agents.filter(a => a.endedAt === undefined)
    const recent = agents.filter(a => a.endedAt !== undefined).slice(-3).reverse()

    const rows = (
      <Box flexDirection="column">
        {active.length === 0 && <Text dimColor>No agents working. The team is in the lounge.</Text>}
        {active.map(a => (
          <Text>
            {'● '}
            {roleIndex(a.type) >= 0 ? roleFor(a.type).label : a.type}
            {a.description ? ` - ${a.description}` : ''}
            {` · ${a.activity ?? 'starting'} · ${formatElapsed(now - a.startedAt)}`}
          </Text>
        ))}
        {recent.map(a => (
          <Text dimColor>
            {'✓ '}
            {roleIndex(a.type) >= 0 ? roleFor(a.type).label : a.type}
            {a.description ? ` - ${a.description}` : ''}
            {` · done in ${formatElapsed((a.endedAt ?? now) - a.startedAt)}`}
          </Text>
        ))}
      </Box>
    )

    if (e.surface === 'terminal') return rows

    const { Svg } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Svg
          source={officeSvg(agents, lead.activity, now)}
          alt={`Agent office: ${active.length} agent${active.length === 1 ? '' : 's'} working`}
          isInteractive
        />
        {rows}
      </Box>
    )
  })
}
