import { expect, mock, test } from 'claude-code/testing'

import { linksOf, mapSvg, questionsOf, resolveLinks, sectionOf } from '../hooks/view'

const HOME = '/home/tester'
const ROOT = `${HOME}/Videos/ph1-brain`

type Fs = Map<string, { text: string; mtimeMs: number }>

// An in-memory file system and the rest of the engine beneath the plugin.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function engine(on: any, fs: Fs, spawned: { prompt: string; cwd?: string }[]) {
  const norm = (p: string) => p.replace(/\\/g, '/')
  on('env.get', (_: unknown, e: { name: string }) => ({ value: e.name === 'USERPROFILE' ? HOME : undefined }))
  const clock = mock.clock(on)
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
  on('tool.register', (_: unknown, e: { name: string }) => ({ value: { tool: e.name } }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('agent.spawn', (_: unknown, e: { prompt: string; cwd?: string }) => {
    spawned.push({ prompt: e.prompt, cwd: e.cwd })
    return { model: 'sonnet', agentId: `lib${spawned.length}` }
  })
  on('tool.call', () => ({ result: {} }))
  on('tool.check', () => ({ decision: 'ask' }))
  on('turn.complete', (_: unknown, e: { text: string }) => ({ text: e.text }))
  on('classic.SubagentStop', () => ({}))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('prompt.compose', () => ({ sections: [{ id: 'base', text: 'base', scope: 'shared' }] }))
  return clock
}

const PANE = {
  plugin: 'ph1-brain',
  component: 'Pane',
  requestId: 'brain',
  props: { title: 'Brain', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

function wiki(): Fs {
  const fs: Fs = new Map()
  const put = (rel: string, text: string) => fs.set(`${ROOT}/${rel}`, { text, mtimeMs: 5 })
  put('wiki/index.md', '# Wiki index\n')
  put('wiki/log.md', '# Log\n')
  put('wiki/_meta/processed.json', '{"a.pdf": 1}')
  put('wiki/_meta/questions.md', '# Open questions\n\n- Acme budget cap?\n- Who signs off phase 2?\n')
  put('wiki/clients/acme-corp.md', '# Acme Corp\n\nProjects: [[site-reports-app]], [[acme-portal|Portal]].')
  put('wiki/projects/site-reports-app.md', '# Site Reports app\n\nClient [[acme-corp]]. Decision: [Supabase](../decisions/use-supabase.md).')
  put('wiki/projects/acme-portal.md', '# Acme Portal\n\nFor [[Acme Corp]]?? see [[acme-corp]].')
  put('wiki/decisions/use-supabase.md', '# Use Supabase\n')
  put('wiki/sources/a-pdf.md', '# Spec v2\n\nFrom raw/a.pdf. [[site-reports-app]]')
  put('raw/a.pdf', 'x')
  put('raw/b.txt', 'new file')
  return fs
}

test('the Library and the Knowledge map draw the wiki, with a switch between them', async ($, on) => {
  const fs = wiki()
  const spawned: { prompt: string }[] = []
  const clock = engine(on, fs, spawned)
  await $.session.start({ cwd: '/home/tester/Projects/app', surface: 'vscode', isInteractive: true })
  await clock.advance(2000)

  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect(await ui.find({ type: 'Button', text: 'Library' })).toBeDefined()
  const lib = String((await ui.find({ type: 'Svg' }))?.props.source)
  expect(lib).toContain('CLIENTS 1')
  expect(lib).toContain('PROJECTS 2')
  expect(lib).toContain('2 open questions')
  expect(lib).toContain('filing 2 notes') // auto-ingest started the librarian on the raw/ files
  expect((await ui.find({ type: 'Text', text: /pages/ }))?.text).toContain('5 pages')

  await ui.press({ key: 'map' })
  await clock.settle()
  const svg = String((await ui.find({ type: 'Svg' }))?.props.source)
  expect(svg).toContain('<circle')
  expect(svg).toContain('Site Reports app (projects, 4 links)')
  expect(svg).toContain('<line')
  await ui.unmount()

  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await term.find({ type: 'Svg' })).toBeUndefined()
  expect((await term.find({ type: 'Text', text: /pages/ }))?.text).toContain('waiting in raw/')
  await term.unmount()
})

test('links resolve by path, by name and relative Markdown links', () => {
  const pages = [
    { rel: 'clients/acme.md', targets: linksOf('[[site]] and [[Acme]] and [x](../projects/site.md) [[missing]]') },
    { rel: 'projects/site.md', targets: linksOf('[[clients/acme|Acme]]') },
  ]
  expect(resolveLinks(pages)).toEqual([[1], [0]])
  expect(sectionOf('decisions/x.md')).toBe('decisions')
  expect(sectionOf('misc.md')).toBe('other')
  expect(questionsOf('# Q\n\n_none yet_\n- One?\n2. Two?')).toEqual(['One?', 'Two?'])
})

test('an empty wiki still draws a map with a hint', () => {
  const svg = mapSvg({ pages: [], waiting: 0, questions: [], librarian: { running: false, count: 0 }, at: 0 }, 0)
  expect(svg).toContain('No wiki pages yet')
})
