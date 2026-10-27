import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'ph1-office',
  component: 'Pane',
  requestId: 'office',
  props: {
    title: 'Agent office',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

// Hooks that stand for the engine beneath the plugin.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function engine(on: any, status = 'running') {
  on('agent.list', () => ({
    value: [{ id: 'a1', description: '', type: 'x', status }],
  }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('tool.register', (_: unknown, e: { name: string }) => ({ value: { tool: e.name } }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('agent.spawn', () => ({ model: 'sonnet', agentId: 'a1' }))
  on('tool.call', () => ({ result: {} }))
  on('classic.SubagentStart', () => ({}))
  on('classic.SubagentStop', () => ({}))
  on('turn.complete', (_: unknown, e: { text: string }) => ({ text: e.text }))
}

test('an agent walks in, works, and walks back out', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })

  // Empty office: the svg draws, and the text says everyone is in the lounge.
  const empty = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect(await empty.find({ type: 'Svg' })).toBeDefined()
  expect((await empty.find({ type: 'Text', text: /lounge/ }))?.text).toContain('No agents working')
  await empty.unmount()

  await $.agent.spawn({
    tool_use_id: 't1', provider: { plugin: 'engine', tier: 'core' }, parentModel: 'opus', background: false, fork: false, 
    prompt: 'Build the settings page',
    description: 'Settings page UI',
    subagentType: 'ph1-pwa-kit:frontend-developer',
  })
  await $.tool.call({ tool: 'Bash', command: 'npm test', agentId: 'a1' })

  for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const svg = (await ui.findAll({ type: 'Svg' })).at(-1)
    const source = String(svg?.props.source ?? '')
    expect(source).toContain('<svg')
    expect(source).toContain('animateTransform')
    expect(source).toContain('running')
    expect(source).toContain('attributeName="visibility"')
    const row = await ui.find({ type: 'Text', text: /Frontend/ })
    expect(row?.text).toContain('Settings page UI')
    expect(row?.text).toContain('running')
    await ui.unmount()
  }

  // The terminal has no Svg: it gets the text rows alone.
  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await term.find({ type: 'Svg' })).toBeUndefined()
  expect((await term.find({ type: 'Text', text: /Frontend/ }))?.text).toContain('Settings page UI')
  await term.unmount()

  await $.classic.SubagentStop({
    stop_hook_active: false,
    agent_id: 'a1',
    agent_transcript_path: '/tmp/a1.jsonl',
    agent_type: 'ph1-pwa-kit:frontend-developer',
  })

  const after = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect((await after.find({ type: 'Text', text: /✓ Frontend/ }))?.text).toContain('done in')
  expect(String((await after.findAll({ type: 'Svg' })).at(-1)?.props.source)).toContain('done!')
  await after.unmount()
})

test('a main-loop tool call shows on the lead', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'ls' })

  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  const source = String((await ui.findAll({ type: 'Svg' })).at(-1)?.props.source)
  expect(source).toContain('Lead (Claude)')
  expect(source).toContain('running')
  await ui.unmount()
})

test('an unknown agent type takes a hot desk', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })
  await $.agent.spawn({ tool_use_id: 't1', provider: { plugin: 'engine', tier: 'core' }, parentModel: 'opus', background: false, fork: false, prompt: 'Look around', description: 'Explore code', subagentType: 'Explore' })

  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect(String((await ui.findAll({ type: 'Svg' })).at(-1)?.props.source)).toContain('>Explore<')
  expect((await ui.find({ type: 'Text', text: /Explore/ }))?.text).toContain('Explore code')
  await ui.unmount()
})

const SPAWN = {
  tool_use_id: 't1', provider: { plugin: 'engine', tier: 'core' }, parentModel: 'opus', background: false, fork: false,
  prompt: 'Build it', description: 'Notifications backend', subagentType: 'ph1-pwa-kit:backend-developer',
} as const

test('a subagent turn.complete sends the agent home', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })
  await $.agent.spawn(SPAWN)
  await $.turn.complete({ answer: 'done', durationMs: 10, isAborted: false, turnId: 'x', agentId: 'a1', reason: 'end_turn', text: 'done' } as never)

  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect((await ui.find({ type: 'Text', text: /✓ Backend/ }))?.text).toContain('done in')
  await ui.unmount()
})

test('the handback tool sends the agent home', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })
  await $.agent.spawn(SPAWN)
  await $.tool.call({ tool: 'SubagentHandback', agentId: 'a1' } as never)

  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect((await ui.find({ type: 'Text', text: /✓ Backend/ }))?.text).toContain('done in')
  await ui.unmount()
})

test('an agent the engine reports completed is sent home by the backstop', async ($, on) => {
  engine(on, 'completed')
  const clock = mock.clock(on)
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })
  await $.agent.spawn(SPAWN)
  await clock.advance(4500)

  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect((await ui.find({ type: 'Text', text: /✓ Backend/ }))?.text).toContain('done in')
  expect(await ui.find({ type: 'Text', text: /● Backend/ })).toBeUndefined()
  await ui.unmount()
})

test('/ph1-office:open opens the pane', async ($, on) => {
  let opened = ''
  on('ui.open', (_: unknown, e: { id: string }) => { opened = e.id; return { value: { isPlaced: true } } })
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('tool.register', (_: unknown, e: { name: string }) => ({ value: { tool: e.name } }))
  on('tool.check', () => ({ decision: 'ask' }))
  mock.clock(on)
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })
  opened = ''
  const ran = await $.tool.call({ tool: 'mcp__ph1-office__open' } as never)
  expect(opened).toBe('office')
  expect(String((ran as { result?: unknown }).result)).toContain('pane is open')
  expect((await $.tool.check({ tool: 'mcp__ph1-office__open', input: {} })).decision).toBe('allow')
})

test('the 5-hour and weekly limits show as gauges and in the status bar', async ($, on) => {
  let status: string | undefined
  const resets = new Date(Date.now() + (2 * 60 + 13) * 60000).toISOString()
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', (_: unknown, e: { text?: string }) => { status = e.text; return { value: undefined } })
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('tool.register', (_: unknown, e: { name: string }) => ({ value: { tool: e.name } }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('session.measure', (_: unknown, e: { changed: ('context' | 'rateLimits' | 'cost')[] }) => ({ changed: e.changed }))
  mock.clock(on)
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })

  await $.session.measure({
    context: { window: 200000 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 42, resetsAt: resets },
      { kind: 'seven_day', percentUsed: 81.5 },
    ],
    changed: ['rateLimits'],
  } as never)
  expect(status).toContain('5h limit 42%')
  expect(status).toContain('reset 2h 13m')

  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  const svgs = await ui.findAll({ type: 'Svg' })
  const gauge = String(svgs[0]?.props.source)
  expect(gauge).toContain('5-hour limit: 42% used')
  expect(gauge).toContain('Weekly limit: 82% used')
  expect(gauge).toContain('#f59e0b') // weekly at 81.5% is amber
  await ui.unmount()

  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await term.find({ type: 'Text', text: /5-hour limit/ }))?.text).toContain('42% used')
  await term.unmount()
})

test('the brain shows beneath the office when ph1-brain shares it, with a Library / Knowledge map switch', async ($, on) => {
  engine(on)
  const clock = mock.clock(on)
  const files = new Map<string, string>()
  on('env.get', (_: unknown, e: { name: string }) => ({ value: e.name === 'HOME' ? '/home/tester' : undefined }))
  on('fs.exists', (_: unknown, e: { path: string }) => ({ value: files.has(e.path) }))
  on('fs.read', (_: unknown, e: { path: string }) => ({ value: files.get(e.path) ?? '' }))
  on('session.usage', () => ({ value: { rateLimits: [] } as never }))
  on('ui.status', () => ({ value: undefined }))
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })
  await clock.advance(2500)

  // No brain shared: no Brain section.
  const before = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect(await before.find({ type: 'Button', text: 'Library' })).toBeUndefined()
  await before.unmount()

  files.set('/home/tester/.claude/ph1-brain/view.json', JSON.stringify({
    pages: [
      { id: 'clients/acme', s: 'clients', t: 'Acme Corp', l: [1], m: 1 },
      { id: 'projects/site', s: 'projects', t: 'Site Reports app', l: [0], m: 1 },
    ],
    waiting: 3, questions: ['Budget cap?'], librarian: { running: true, count: 3 }, at: 1,
  }))
  await clock.advance(10_000)

  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect(await ui.find({ type: 'Button', text: 'Library' })).toBeDefined()
  const svgs = await ui.findAll({ type: 'Svg' })
  expect(String(svgs.at(-1)?.props.source)).toContain('CLIENTS 1')
  expect(String(svgs.at(-1)?.props.source)).toContain('filing 3 notes')
  await ui.press({ key: 'brain-map' })
  await clock.settle()
  expect(String((await ui.findAll({ type: 'Svg' })).at(-1)?.props.source)).toContain('Site Reports app (projects')
  await ui.unmount()

  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await term.find({ type: 'Text', text: /^Brain:/ }))?.text).toContain('2 pages')
  await term.unmount()
})
