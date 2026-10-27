import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { BrainMode, BrainSnapshot, BrainState, LeadState, LimitsState, OfficeAgent } from '../types'
import { librarySvg, mapSvg, summaryLine } from './brain-view'
import { limitsSvg, line, statusLine } from './limits'
import { activityFor, formatElapsed, officeSvg, roleFor, roleIndex } from './office'

const PANE = 'office'
const TITLE = 'Agent office'

// Change a shape tag when the stored fields change: it declines what an older version stored.
const agentsAtom = atom({ plugin: 'ph1-office', key: 'agents' } as const, [] as OfficeAgent[], { shape: 'agents-1' })
const leadAtom = atom({ plugin: 'ph1-office', key: 'lead' } as const, { at: 0 } as LeadState, { shape: 'lead-1' })

const limitsAtom = atom({ plugin: 'ph1-office', key: 'limits' } as const, { readings: [], at: 0 } as LimitsState, { shape: 'limits-1' })

// Store the usage-limit windows (5-hour, weekly) and show the 5-hour one in the status bar.
async function saveLimits($: EngineInterface, readings: LimitsState['readings']): Promise<void> {
  const clean = readings.map(r => ({ kind: r.kind, percentUsed: r.percentUsed, ...(r.resetsAt ? { resetsAt: r.resetsAt } : {}) }))
  await update($, limitsAtom, () => ({ readings: clean, at: Date.now() }))
  $.ui.status(statusLine(clean, Date.now()))
}

let limitsTicker: Timer | undefined

// The brain beneath the office: read from the file ph1-brain shares. No ph1-brain, no section.
const brainAtom = atom({ plugin: 'ph1-office', key: 'brain' } as const, {} as BrainState, { shape: 'brain-1' })
const brainModeAtom = atom({ plugin: 'ph1-office', key: 'brainMode' } as const, 'library' as BrainMode, { shape: 'brainMode-1' })
let brainTicker: Timer | undefined
let brainText = ''

async function loadBrain($: EngineInterface): Promise<void> {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  if (!home) return
  const path = `${home.replace(/\\/g, '/').replace(/\/$/, '')}/.claude/ph1-brain/view.json`
  const text = (await $.fs.exists(path)) ? await $.fs.read(path) : ''
  if (text === brainText) return
  brainText = text
  let snap: BrainSnapshot | undefined
  try {
    const parsed = text ? (JSON.parse(text) as BrainSnapshot) : undefined
    snap = parsed && Array.isArray(parsed.pages) ? parsed : undefined
  } catch {
    snap = undefined
  }
  await update($, brainAtom, () => (snap ? { snap } : {}))
}

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
    await $.tool.register({ name: 'open', description: 'Open the Ph1 Agent Office pane.', isDeferred: false })
    ensureTicker($)
    const result = await next(e)
    const usage = await $.session.usage().catch(() => undefined)
    if (usage) await saveLimits($, usage.rateLimits)
    // Refresh the countdown once a minute (the readings themselves arrive with each reply).
    if (!limitsTicker) {
      limitsTicker = $.clock.every(60_000, () => {
        read($, limitsAtom)
          .then(l => saveLimits($, l.readings))
          .catch(() => undefined)
      })
    }
    if (!brainTicker) {
      brainTicker = $.clock.every(10_000, () => {
        loadBrain($).catch(() => undefined)
      })
      $.clock.after(2000, () => {
        loadBrain($).catch(() => undefined)
      })
    }
    return result
  })

  // New limit readings after each reply, or when a window moves a whole point.
  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) await saveLimits($, e.rateLimits).catch(() => undefined)
    return next(e)
  })

  // /ph1-office:open asks Claude to call this tool, which reopens the pane.
  on('tool.call', { tool: 'mcp__ph1-office__open' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: TITLE })
    return { result: opened.isPlaced ? 'The Agent office pane is open.' : `The Agent office pane is waiting for room to open (${opened.reason ?? 'no surface'}).` }
  })
  on('tool.check', async ($, e, next) =>
    e.tool === 'mcp__ph1-office__open' ? { decision: 'allow', reason: 'ph1-office: open its own pane' } : next(e),
  )

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
    const limits = await read($, limitsAtom)
    const brain = (await read($, brainAtom)).snap
    const brainMode = await read($, brainModeAtom)
    const now = Date.now()
    const active = agents.filter(a => a.endedAt === undefined)
    const recent = agents.filter(a => a.endedAt !== undefined).slice(-3).reverse()

    const rows = (
      <Box flexDirection="column">
        {limits.readings.map(r => (
          <Text dimColor>{line(r, now)}</Text>
        ))}
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

    if (e.surface === 'terminal') {
      return (
        <Box flexDirection="column">
          {rows}
          {brain && <Text dimColor>{`Brain: ${summaryLine(brain, now)}`}</Text>}
        </Box>
      )
    }

    const { Button } = ui
    const setBrainMode = (m: BrainMode) => () => {
      void update($, brainModeAtom, () => m)
    }

    const { Svg } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Svg
          source={limitsSvg(limits.readings, now)}
          alt={limits.readings.length ? limits.readings.map(r => line(r, now)).join('; ') : 'No usage-limit reading yet'}
        />
        <Svg
          source={officeSvg(agents, lead.activity, now)}
          alt={`Agent office: ${active.length} agent${active.length === 1 ? '' : 's'} working`}
          isInteractive
        />
        {rows}
        {brain && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>Brain</Text>
            <Box flexDirection="row" gap={1}>
              <Button key="brain-library" label="Library" variant={brainMode === 'library' ? 'primary' : 'secondary'} onPress={setBrainMode('library')} />
              <Button key="brain-map" label="Knowledge map" variant={brainMode === 'map' ? 'primary' : 'secondary'} onPress={setBrainMode('map')} />
            </Box>
            {brainMode === 'library' ? (
              <Svg source={librarySvg(brain, now)} alt={`Brain library: ${summaryLine(brain, now)}`} isInteractive />
            ) : (
              <Svg source={mapSvg(brain, now)} alt={`Brain knowledge map: ${brain.pages.length} pages`} isInteractive />
            )}
            <Text dimColor>{summaryLine(brain, now)}</Text>
          </Box>
        )}
      </Box>
    )
  })
}
