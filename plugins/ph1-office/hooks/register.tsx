import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { LeadState, OfficeAgent } from '../types'
import { activityFor, formatElapsed, officeSvg, roleFor, roleIndex } from './office'

const PANE = 'office'
const TITLE = 'Agent office'

// Change a shape tag when the stored fields change: it declines what an older version stored.
const agentsAtom = atom({ plugin: 'ph1-office', key: 'agents' } as const, [] as OfficeAgent[], { shape: 'agents-1' })
const leadAtom = atom({ plugin: 'ph1-office', key: 'lead' } as const, { at: 0 } as LeadState, { shape: 'lead-1' })

const MAX_KEPT = 30

const ENDED = new Set(['completed', 'failed', 'killed'])
const isHandback = (tool: string) => /handback/i.test(tool)

type Engine = EngineInterface

async function endAgent($: Engine, id: string): Promise<void> {
  await update($, agentsAtom, list =>
    list.some(a => a.id === id && a.endedAt === undefined)
      ? list.map(a => (a.id === id && a.endedAt === undefined ? { ...a, endedAt: Date.now(), activity: 'done' } : a))
      : list,
  )
}

// Backstop: every few seconds, ask the engine which agents are still running, and send the rest home.
async function reconcile($: Engine): Promise<void> {
  const open = (await read($, agentsAtom)).filter(a => a.endedAt === undefined)
  if (open.length === 0) return
  const known = (await $.agent.list()).map(a => ({ id: a.id, status: String(a.status) }))
  const now = Date.now()
  const ids = new Set(
    open
      .filter(a => {
        const k = known.find(x => x.id === a.id)
        return k ? ENDED.has(k.status) : now - a.startedAt > 15000
      })
      .map(a => a.id),
  )
  if (ids.size === 0) return
  await update($, agentsAtom, list => list.map(a => (ids.has(a.id) && a.endedAt === undefined ? { ...a, endedAt: now, activity: 'done' } : a)))
}

let ticker: Timer | undefined
function ensureTicker($: Engine): void {
  if (ticker) return
  ticker = $.clock.every(4000, () => {
    reconcile($).catch(() => undefined)
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    void $.ui.open({ id: PANE, title: TITLE })
    ensureTicker($)
    return next(e)
  })

  // /ph1-office:open reopens the pane.
  on('skill.prompt', async ($, e, next) => {
    if (!/(^|:)open$/.test(e.skill) || (e.pluginName !== undefined && e.pluginName !== 'ph1-office')) return next(e)
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: 'Tell the person in one short sentence that the Agent office pane is open. Do nothing else.' }
  })

  // An agent starts: it gets a record, and its character walks to its desk.
  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    ensureTicker($)
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

  // An agent finishes: its character walks back to the lounge. Several signals can say so;
  // whichever comes first wins and the rest change nothing.
  on('classic.SubagentStop', async ($, e, next) => {
    await endAgent($, e.agent_id)
    return next(e)
  })

  // Each tool call becomes the speech bubble of whoever made it.
  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    const label = activityFor(tool)
    const agentId = e.agentId
    if (agentId) {
      const list = await read($, agentsAtom)
      const mine = list.find(a => a.id === agentId)
      if (mine && mine.endedAt === undefined && mine.activity !== label) {
        await update($, agentsAtom, l => l.map(a => (a.id === agentId ? { ...a, activity: label } : a)))
      }
      const ran = await next(e)
      // Handing the report back is a subagent's last act.
      if (isHandback(tool)) await endAgent($, agentId)
      return ran
    }
    const lead = await read($, leadAtom)
    if (lead.activity !== label) await update($, leadAtom, () => ({ activity: label, at: Date.now() }))
    return next(e)
  })

  // A subagent's run is one turn: its turn.complete (carrying its id) means it is done.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId) await endAgent($, e.agentId)
    else await update($, leadAtom, () => ({ activity: undefined, at: Date.now() }))
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
