import { expect, mock, test } from 'claude-code/testing'

// POSIX paths here: the test host is Linux (Windows paths are covered in paths.test.ts).
const HOME = '/home/tester'
const ROOT = `${HOME}/Videos/ph1-brain`

type Fs = Map<string, { text: string; mtimeMs: number }>

// An in-memory file system and the rest of the engine beneath the plugin.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function engine(on: any, fs: Fs, spawned: { prompt: string; cwd?: string }[]) {
  const norm = (p: string) => p.replace(/\\/g, '/')
  on('env.get', (_: unknown, e: { name: string }) => ({ value: e.name === 'USERPROFILE' ? HOME : undefined }))
  mock.clock(on)
  on('fs.exists', (_: unknown, e: { path: string }) => {
    const p = norm(e.path)
    return { value: fs.has(p) || [...fs.keys()].some(k => k.startsWith(p + '/')) }
  })
  on('fs.read', (_: unknown, e: { path: string }) => {
    const f = fs.get(norm(e.path))
    if (!f) throw new Error('missing')
    return { value: f.text }
  })
  on('fs.write', (_: unknown, e: { path: string; text: string }) => {
    fs.set(norm(e.path), { text: e.text, mtimeMs: 1 })
    return { value: undefined }
  })
  on('fs.list', (_: unknown, e: { path: string }) => {
    const dir = norm(e.path) + '/'
    const names = new Map<string, { kind: 'file' | 'dir'; mtimeMs: number }>()
    for (const [k, v] of fs) {
      if (!k.startsWith(dir)) continue
      const rest = k.slice(dir.length)
      const [first, ...more] = rest.split('/')
      if (first) names.set(first, more.length ? { kind: 'dir', mtimeMs: 0 } : { kind: 'file', mtimeMs: v.mtimeMs })
    }
    return { value: [...names].map(([name, v]) => ({ name, kind: v.kind, size: 1, mtimeMs: v.mtimeMs, isLink: false })) }
  })
  on('tool.register', () => ({ value: undefined }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('agent.spawn', (_: unknown, e: { prompt: string; cwd?: string }) => {
    spawned.push({ prompt: e.prompt, cwd: e.cwd })
    return { model: 'sonnet', agentId: `lib${spawned.length}` }
  })
  on('tool.call', () => ({ result: {} }))
  on('tool.check', () => ({ decision: 'ask' }))
  on('turn.complete', (_: unknown, e: { text: string }) => ({ text: e.text }))
  on('classic.SubagentStop', () => ({}))
  on('prompt.compose', () => ({ sections: [{ id: 'base', text: 'base', scope: 'shared' }] }))
}

test('first run creates the brain folder', async ($, on) => {
  const fs: Fs = new Map()
  engine(on, fs, [])
  await $.session.start({ cwd: '/home/tester/Projects/app', surface: 'vscode', isInteractive: true })
  expect(fs.has(`${ROOT}/CLAUDE.md`)).toBe(true)
  expect(fs.has(`${ROOT}/raw/README.txt`)).toBe(true)
  expect(fs.has(`${ROOT}/wiki/index.md`)).toBe(true)
  expect(fs.get(`${ROOT}/wiki/_meta/processed.json`)?.text.trim()).toBe('{}')
})

test('new raw files are ingested by the librarian, then marked processed', async ($, on) => {
  const fs: Fs = new Map()
  const spawned: { prompt: string; cwd?: string }[] = []
  engine(on, fs, spawned)
  fs.set(`${ROOT}/raw/kickoff notes.txt`, { text: 'Client wants offline photos', mtimeMs: 100 })
  fs.set(`${ROOT}/raw/briefs/acme.pdf`, { text: '%PDF', mtimeMs: 200 })

  await $.session.start({ cwd: '/home/tester/Projects/app', surface: 'vscode', isInteractive: true })
  expect(spawned).toHaveLength(1)
  expect(spawned[0]!.prompt).toContain('raw/kickoff notes.txt')
  expect(spawned[0]!.prompt).toContain('raw/briefs/acme.pdf')
  expect(spawned[0]!.prompt).not.toContain('README.txt')
  expect(spawned[0]!.cwd).toBe(ROOT)

  // The run reports back (in a session the engine also gives the run's id; here, its type).
  await $.classic.SubagentStop({ stop_hook_active: false, agent_id: 'x1', agent_transcript_path: '/t', agent_type: 'ph1-brain:librarian' })
  const processed = JSON.parse(fs.get(`${ROOT}/wiki/_meta/processed.json`)!.text) as Record<string, number>
  expect(processed['kickoff notes.txt']).toBe(100)
  expect(processed['briefs/acme.pdf']).toBe(200)
  expect(spawned).toHaveLength(1) // nothing left, so no second run

  // A changed file is picked up again.
  fs.set(`${ROOT}/raw/kickoff notes.txt`, { text: 'Updated', mtimeMs: 300 })
  const ran = await $.tool.call({ tool: 'mcp__ph1-brain__ingest' } as never)
  expect(String((ran as { result?: unknown }).result)).toContain('1 new file')
  expect(spawned[1]!.prompt).toContain('raw/kickoff notes.txt')
})

test('raw/ cannot be changed, the wiki can', async ($, on) => {
  const fs: Fs = new Map()
  engine(on, fs, [])
  await $.session.start({ cwd: '/home/tester/Projects/app', surface: 'vscode', isInteractive: true })

  const write = await $.tool.call({ tool: 'Write', file_path: `${ROOT}/raw/notes.txt`, content: 'x' } as never)
  expect(String((write as { deny?: string }).deny)).toContain('read-only')

  for (const command of [`rm "${ROOT}/raw/a.txt"`, `Remove-Item ${ROOT}/raw/a.txt`, `mv ${ROOT}/raw/a.txt ${ROOT}/wiki/`]) {
    const ran = await $.tool.call({ tool: 'Bash', command } as never)
    expect(String((ran as { deny?: string }).deny)).toContain('raw/')
  }

  const readCmd = await $.tool.call({ tool: 'Bash', command: `ls ${ROOT}/raw` } as never)
  expect((readCmd as { deny?: string }).deny).toBeUndefined()
  const wiki = await $.tool.call({ tool: 'Write', file_path: `${ROOT}/wiki/projects/app.md`, content: 'x' } as never)
  expect((wiki as { deny?: string }).deny).toBeUndefined()

  expect((await $.tool.check({ tool: 'Read', input: { file_path: `${ROOT}/raw/a.txt` } })).decision).toBe('allow')
  expect((await $.tool.check({ tool: 'mcp__ph1-brain__ingest', input: {} })).decision).toBe('allow')
  expect((await $.tool.check({ tool: 'Edit', input: { file_path: `${ROOT}/wiki/index.md` } })).decision).toBe('allow')
  expect((await $.tool.check({ tool: 'Edit', input: { file_path: `${ROOT}/raw/a.txt` } })).decision).toBe('deny')
  expect((await $.tool.check({ tool: 'Edit', input: { file_path: '/home/tester/Projects/app/src/x.ts' } })).decision).toBe('ask')
})

test('every session is told where the brain is', async ($, on) => {
  const fs: Fs = new Map()
  engine(on, fs, [])
  await $.session.start({ cwd: '/home/tester/Projects/app', surface: 'vscode', isInteractive: true })
  const composed = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: ['vscode'], tools: [], outputStyle: { name: 'default', isKeepingCodingInstructions: true }, traits: [] } as never)
  const section = composed.sections.find(s => s.id === 'ph1-brain:context')
  expect(section?.text).toContain(`${ROOT}/wiki/index.md`)
  expect(section?.text).toContain('Never change anything')
})

test('with auto-ingest off, nothing starts by itself', { options: { auto_ingest: false } }, async ($, on) => {
  const fs: Fs = new Map()
  const spawned: { prompt: string }[] = []
  engine(on, fs, spawned)
  fs.set(`${ROOT}/raw/a.txt`, { text: 'x', mtimeMs: 5 })
  await $.session.start({ cwd: '/home/tester/Projects/app', surface: 'vscode', isInteractive: true })
  expect(spawned).toHaveLength(0)
})

test('the status tool reports the brain', async ($, on) => {
  const fs: Fs = new Map()
  engine(on, fs, [])
  fs.set(`${ROOT}/raw/a.txt`, { text: 'x', mtimeMs: 5 })
  await $.session.start({ cwd: '/home/tester/Projects/app', surface: 'vscode', isInteractive: true })
  const ran = await $.tool.call({ tool: 'mcp__ph1-brain__status' } as never)
  const text = String((ran as { result?: unknown }).result)
  expect(text).toContain(`Brain folder: ${ROOT}`)
  expect(text).toContain('/ph1-brain:ingest')
})
