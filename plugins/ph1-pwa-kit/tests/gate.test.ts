import { expect, test } from 'claude-code/testing'

const REVIEWER = 'ph1-pwa-kit:code-reviewer'
const QA = 'ph1-pwa-kit:qa-engineer'
const FE = 'ph1-pwa-kit:frontend-developer'

// Hooks that stand for the engine beneath the plugin.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function engine(on: any) {
  let n = 0
  on('command.register', () => ({ value: { command: 'ship-gate' } }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('skill.prompt', (_: unknown, e: { text: string }) => ({ text: e.text }))
  on('agent.spawn', () => ({ model: 'sonnet', agentId: `a${++n}` }))
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', (_: unknown, e: { text: string }) => ({ text: e.text }))
  on('classic.SubagentStop', () => ({}))
  on('command.run', () => ({ text: 'engine' }))
}

const spawn = (subagentType: string) => ({
  tool_use_id: 't', provider: { plugin: 'engine', tier: 'core' }, parentModel: 'opus', background: false, fork: false,
  prompt: 'do it', description: 'work', subagentType,
}) as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function startFeature($: any) {
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })
  await $.skill.prompt({ skill: 'ph1-pwa-kit:new-feature', text: 'Build this', frontmatter: {}, source: 'plugin' } as never)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runAgent($: any, type: string, id: string) {
  await $.agent.spawn(spawn(type))
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: id, agentId: id, reason: 'end_turn', text: '' } as never)
}

// Wait until the clock ticks, so timestamps differ (the test environment has timers but no DOM types).
declare const setTimeout: (fn: () => void, ms: number) => unknown
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

test('without /new-feature the gate stays out of the way', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: '/a.ts', old_string: 'a', new_string: 'b' } as never)
  const ran = await $.tool.call({ tool: 'Bash', command: 'git commit -m x' } as never)
  expect((ran as { deny?: string }).deny).toBeUndefined()
})

test('a commit after code changes is blocked until review and QA run', async ($, on) => {
  engine(on)
  await startFeature($)
  await $.tool.call({ tool: 'Edit', file_path: '/a.ts', old_string: 'a', new_string: 'b' } as never)

  const blocked = await $.tool.call({ tool: 'Bash', command: 'git commit -m "feat"' } as never)
  expect(String((blocked as { deny?: string }).deny)).toContain('code-reviewer')
  expect(String((blocked as { deny?: string }).deny)).toContain('qa-engineer')

  await sleep(5)
  await runAgent($, REVIEWER, 'a1')
  const stillBlocked = await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' } as never)
  expect(String((stillBlocked as { deny?: string }).deny)).not.toContain('code-reviewer')
  expect(String((stillBlocked as { deny?: string }).deny)).toContain('qa-engineer')

  await sleep(5)
  await runAgent($, QA, 'a2')
  const allowed = await $.tool.call({ tool: 'Bash', command: 'git push origin main' } as never)
  expect((allowed as { deny?: string }).deny).toBeUndefined()
})

test('a fix after QA needs QA again, but QA writing tests does not', async ($, on) => {
  engine(on)
  await startFeature($)
  await $.tool.call({ tool: 'Edit', file_path: '/a.ts', old_string: 'a', new_string: 'b' } as never)
  await sleep(5)
  await runAgent($, REVIEWER, 'a1')
  await sleep(5)

  // QA writes a test file while it runs: not a code change.
  await $.agent.spawn(spawn(QA))
  await $.tool.call({ tool: 'Write', file_path: '/a.test.ts', content: 'x', agentId: 'a2' } as never)
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 'q', agentId: 'a2', reason: 'end_turn', text: '' } as never)
  const ok = await $.tool.call({ tool: 'Bash', command: 'git commit -m x' } as never)
  expect((ok as { deny?: string }).deny).toBeUndefined()

  // A developer fixes a bug afterwards: QA is stale again.
  await sleep(5)
  await $.agent.spawn(spawn(FE))
  await $.tool.call({ tool: 'Edit', file_path: '/a.ts', old_string: 'b', new_string: 'c', agentId: 'a3' } as never)
  const blocked = await $.tool.call({ tool: 'Bash', command: 'git commit -m fix' } as never)
  expect(String((blocked as { deny?: string }).deny)).toContain('qa-engineer')
  expect(String((blocked as { deny?: string }).deny)).not.toContain('code-reviewer')
})

test('only the person can skip the gate', async ($, on) => {
  engine(on)
  await startFeature($)
  await $.tool.call({ tool: 'Edit', file_path: '/a.ts', old_string: 'a', new_string: 'b' } as never)

  const byModel = await $.command.run({ command: 'ship-gate', args: 'skip', origin: { kind: 'sdk' }, presentation: 'visible' } as never)
  expect(String((byModel as { text?: string }).text)).toContain('only the person')
  expect(String(((await $.tool.call({ tool: 'Bash', command: 'git commit -m x' } as never)) as { deny?: string }).deny)).toContain('Ship gate')

  await $.command.run({ command: 'ship-gate', args: 'skip', origin: { kind: 'composer' }, presentation: 'visible' } as never)
  const allowed = await $.tool.call({ tool: 'Bash', command: 'git commit -m x' } as never)
  expect((allowed as { deny?: string }).deny).toBeUndefined()

  // The next code change brings the gate back.
  await $.tool.call({ tool: 'Edit', file_path: '/a.ts', old_string: 'b', new_string: 'c' } as never)
  expect(String(((await $.tool.call({ tool: 'Bash', command: 'git commit -m y' } as never)) as { deny?: string }).deny)).toContain('Ship gate')
})

test('non-shipping commands are never blocked', async ($, on) => {
  engine(on)
  await startFeature($)
  await $.tool.call({ tool: 'Edit', file_path: '/a.ts', old_string: 'a', new_string: 'b' } as never)
  for (const command of ['git status', 'git diff', 'npm test', 'git log --oneline', 'git add -A']) {
    const ran = await $.tool.call({ tool: 'Bash', command } as never)
    expect((ran as { deny?: string }).deny).toBeUndefined()
  }
})
