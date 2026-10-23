import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'agent-office',
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
function engine(on: any) {
  on('command.register', () => ({ value: { command: 'office' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('agent.spawn', () => ({ model: 'sonnet', agentId: 'a1' }))
  on('tool.call', () => ({ result: {} }))
  on('classic.SubagentStart', () => ({}))
  on('classic.SubagentStop', () => ({}))
  on('turn.complete', () => ({}))
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
    const svg = await ui.find({ type: 'Svg' })
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
  expect(String((await after.find({ type: 'Svg' }))?.props.source)).toContain('done!')
  await after.unmount()
})

test('a main-loop tool call shows on the lead', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'ls' })

  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  const source = String((await ui.find({ type: 'Svg' }))?.props.source)
  expect(source).toContain('Lead (Claude)')
  expect(source).toContain('running')
  await ui.unmount()
})

test('an unknown agent type takes a hot desk', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })
  await $.agent.spawn({ tool_use_id: 't1', provider: { plugin: 'engine', tier: 'core' }, parentModel: 'opus', background: false, fork: false, prompt: 'Look around', description: 'Explore code', subagentType: 'Explore' })

  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect(String((await ui.find({ type: 'Svg' }))?.props.source)).toContain('>Explore<')
  expect((await ui.find({ type: 'Text', text: /Explore/ }))?.text).toContain('Explore code')
  await ui.unmount()
})
