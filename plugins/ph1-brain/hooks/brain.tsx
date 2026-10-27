// Second brain: keeps raw/ untouchable, lets every session use the wiki, and has a
// background librarian agent turn new raw files into linked wiki pages.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register, Timer } from 'claude-code'

import type { BrainSnapshot, SnapPage, ViewMode } from '../types'
import { expandHome, ignored, isUnder, newFiles, norm, resolve, touchesRaw } from './paths'
import type { RawFile } from './paths'
import { isContentPage, librarySvg, linksOf, mapSvg, questionsOf, resolveLinks, sectionOf, summaryLine, titleOf } from './view'

// The librarian run in progress. Kept in the module (state written while a session is
// starting doesn't stick); after a reload a finished batch is simply ingested again.
type IngestState = { running: boolean; agentId?: string; batch: string[]; startedAt: number; lastRunAt: number }
let current: IngestState = { running: false, batch: [], startedAt: 0, lastRunAt: 0 }
const STALE_MS = 45 * 60 * 1000 // a run that never reported back is given up after this

const LIBRARIAN = 'ph1-brain:librarian'
const INGEST_TOOL = 'mcp__ph1-brain__ingest'
const STATUS_TOOL = 'mcp__ph1-brain__status'
const MAX_BATCH = 25
const CHECK_EVERY_MS = 5 * 60 * 1000
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const READ_TOOLS = new Set(['Read', 'Glob', 'Grep', 'LS'])

type Brain = { root: string; raw: string; wiki: string; meta: string }

let brain: Brain | undefined
let cwd = ''
let ticker: Timer | undefined

async function locate($: EngineInterface, options: PluginOptions): Promise<Brain> {
  const configured = String(options['brain_path'] ?? '~/Videos/ph1-brain')
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  const root = expandHome(configured, home).replace(/\\/g, '/').replace(/\/$/, '')
  return { root, raw: `${root}/raw`, wiki: `${root}/wiki`, meta: `${root}/wiki/_meta` }
}

function guidance(b: Brain): string {
  return [
    `## Ph1 second brain`,
    ``,
    `The company's second brain is at ${b.root} (plain Markdown; managed by the ph1-brain plugin).`,
    ``,
    `- When a request touches clients, projects, past decisions, requirements or lessons learned, read ${b.wiki}/index.md first, then the relevant pages, and say which pages you used.`,
    `- You may create and edit pages under ${b.wiki}/ (for example a project page after finishing a feature; add a line to ${b.wiki}/log.md).`,
    `- Never change anything in ${b.raw}/: no edits, moves, renames or deletes. It is blocked.`,
    `- Never ask the person to organize, sort or rename anything in the brain.`,
    `- Don't load the brain for unrelated tasks.`,
  ].join('\n')
}

const START = '<!-- ph1-brain:start (managed by the ph1-brain plugin; edits inside are replaced) -->'
const END = '<!-- ph1-brain:end -->'

// Keep a short, marked section about the brain in the user's own CLAUDE.md, which every
// session and subagent loads. Only the text between the markers is ever touched.
async function syncClaudeMd($: EngineInterface, b: Brain, on: boolean): Promise<void> {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  if (!home) return
  const path = `${home.replace(/\\/g, '/').replace(/\/$/, '')}/.claude/CLAUDE.md`
  const current = (await $.fs.exists(path)) ? await $.fs.read(path) : ''
  const block = `${START}\n${guidance(b)}\n${END}`
  const start = current.indexOf(START.slice(0, 22))
  const end = current.indexOf(END)
  let next: string
  if (start >= 0 && end > start) {
    const before = current.slice(0, start)
    const after = current.slice(end + END.length)
    next = on ? `${before}${block}${after}` : `${before.replace(/\n+$/, '\n')}${after.replace(/^\n+/, '')}`
  } else {
    if (!on) return
    next = current ? `${current.replace(/\n*$/, '\n\n')}${block}\n` : `${block}\n`
  }
  if (next !== current) await $.fs.write(path, next)
}

const CLAUDE_MD = `# Ph1world second brain

This folder is the company's second brain. Everything here is plain Markdown.

## The three rules

1. **Never touch raw/.** It holds original sources exactly as they were dropped in. Read it, never edit, move, rename or delete anything there.
2. **Build summaries and links in wiki/.** Every source gets a summary page; facts link back to their raw file; related pages link to each other; wiki/index.md maps everything.
3. **Never make the person organize.** They only drop files into raw/. Claude decides where everything goes, names pages, and keeps the structure tidy, without asking them to sort, tag or rename.

## Layout

- raw/ - original sources (any format, any name)
- wiki/index.md - map of the wiki
- wiki/log.md - what was ingested or changed, newest first
- wiki/sources/ - one summary per raw file
- wiki/clients/, wiki/projects/, wiki/topics/, wiki/decisions/, wiki/people/ - topic pages
- wiki/_meta/processed.json - which raw files are already ingested (maintained automatically)
- wiki/_meta/questions.md - contradictions or gaps that need the person's answer
`

const README_RAW = `Drop anything here: notes, PDFs, screenshots, briefs, transcripts, exports.
No need to name or sort files. The librarian turns them into wiki pages automatically.
Files in this folder are never changed by Claude.
`

// Create the folder structure the first time (never writes inside raw/ except its README once).
async function bootstrap($: EngineInterface, b: Brain): Promise<void> {
  const files: [string, string][] = [
    [`${b.root}/CLAUDE.md`, CLAUDE_MD],
    [`${b.raw}/README.txt`, README_RAW],
    [`${b.wiki}/index.md`, '# Wiki index\n\n_Nothing ingested yet. Drop files into raw/._\n'],
    [`${b.wiki}/log.md`, '# Log\n\n'],
    [`${b.meta}/processed.json`, '{}\n'],
    [`${b.meta}/questions.md`, '# Open questions\n\n_Contradictions or gaps the librarian needs you to answer._\n'],
  ]
  for (const [path, text] of files) {
    if (!(await $.fs.exists(path))) await $.fs.write(path, text)
  }
}

async function listRaw($: EngineInterface, dir: string, rel = '', depth = 0, out: RawFile[] = []): Promise<RawFile[]> {
  if (depth > 6 || out.length > 2000) return out
  for (const e of await $.fs.list(dir)) {
    if (ignored(e.name)) continue
    const relPath = rel ? `${rel}/${e.name}` : e.name
    if (e.kind === 'dir') await listRaw($, `${dir}/${e.name}`, relPath, depth + 1, out)
    else if (e.kind === 'file') out.push({ path: relPath, mtimeMs: e.mtimeMs })
  }
  return out
}

async function readProcessed($: EngineInterface, b: Brain): Promise<Record<string, number>> {
  try {
    return JSON.parse(await $.fs.read(`${b.meta}/processed.json`)) as Record<string, number>
  } catch {
    return {}
  }
}

async function pending($: EngineInterface, b: Brain): Promise<RawFile[]> {
  if (!(await $.fs.exists(b.raw))) return []
  return newFiles(await listRaw($, b.raw), await readProcessed($, b))
}

function librarianPrompt(b: Brain, files: RawFile[], more: number): string {
  return [
    `Ingest these new or changed files from the brain's raw/ folder into the wiki.`,
    `Brain folder: ${b.root}`,
    ``,
    ...files.map(f => `- raw/${f.path}`),
    more > 0 ? `\n(${more} more files are waiting; they will come in the next batch.)` : '',
    ``,
    `Follow your instructions: summary page per source, update topic pages, links, index and log. Never touch raw/. Never ask the person to organize anything. Do not edit wiki/_meta/processed.json; it is updated for you.`,
  ].join('\n')
}

// Start the librarian on the next batch, unless it is already working.
async function ingest($: EngineInterface, b: Brain, reason: 'auto' | 'command'): Promise<string> {
  const state = current
  if (state.running && Date.now() - state.startedAt < STALE_MS) return `The librarian is already working on ${state.batch.length} file(s).`
  const todo = await pending($, b)
  if (todo.length === 0) return 'Nothing new in raw/. The wiki is up to date.'
  const batch = todo.slice(0, MAX_BATCH)
  const result = await $.agent.spawn({
    subagentType: LIBRARIAN,
    description: `Ingest ${batch.length} file(s) into the brain`,
    prompt: librarianPrompt(b, batch, todo.length - batch.length),
    cwd: b.root,
  })
  if (result.deny) return `The librarian could not start: ${result.deny}`
  current = { ...current, running: true, agentId: result.agentId, batch: batch.map(f => `${f.path}\t${f.mtimeMs}`), startedAt: Date.now() }
  $.ui.status(`Brain: librarian ingesting ${batch.length} file(s)`)
  void refreshView($).catch(() => undefined)
  return `${reason === 'auto' ? 'Found' : 'Ingesting'} ${batch.length} new file(s) in raw/; the librarian is processing them in the background.${
    todo.length > batch.length ? ` ${todo.length - batch.length} more will follow.` : ''
  }`
}

// The librarian finished: record its batch as processed, then pick up anything left.
// Matched by the run's id, or by the librarian type when the id wasn't reported.
async function librarianDone($: EngineInterface, who: { id?: string; type?: string }, options: PluginOptions, ok: boolean): Promise<void> {
  const state = current
  if (!state.running || !brain) return
  const byId = state.agentId !== undefined && who.id === state.agentId
  const byType = state.agentId === undefined && who.type !== undefined && /(^|:)librarian$/.test(who.type)
  if (!byId && !byType) return
  const b = brain
  if (ok) {
    const processed = await readProcessed($, b)
    for (const line of state.batch) {
      const [path, mtime] = line.split('\t')
      if (path) processed[path] = Number(mtime)
    }
    await $.fs.write(`${b.meta}/processed.json`, JSON.stringify(processed, null, 2) + '\n')
  }
  current = { ...current, running: false, agentId: undefined, batch: [], lastRunAt: Date.now() }
  $.ui.status(ok ? undefined : 'Brain: last ingest did not finish; it will retry')
  await refreshView($).catch(() => undefined)
  if (ok && options['auto_ingest'] !== false) await ingest($, b, 'auto').catch(() => undefined)
}


// ---------- Brain view (Library and Knowledge map) ----------

const VIEW_PANE = 'brain'
const VIEW_TITLE = 'Brain'
const VIEW_TOOL = 'mcp__ph1-brain__view'
const VIEW_EVERY_MS = 30 * 1000
const MAX_PAGES = 1500

const EMPTY_SNAP: BrainSnapshot = { pages: [], waiting: 0, questions: [], librarian: { running: false, count: 0 }, at: 0 }
const snapshotAtom = atom({ plugin: 'ph1-brain', key: 'snapshot' } as const, EMPTY_SNAP, { shape: 'snapshot-1' })
const modeAtom = atom({ plugin: 'ph1-brain', key: 'mode' } as const, 'library' as ViewMode, { shape: 'mode-1' })

// Parsed pages, re-read only when a file's modified time changes.
const pageCache = new Map<string, { mtime: number; title: string; targets: string[] }>()
let viewTicker: Timer | undefined
let refreshing = false

async function listWiki($: EngineInterface, dir: string, rel = '', depth = 0, out: { rel: string; mtime: number }[] = []) {
  if (depth > 5 || out.length >= MAX_PAGES) return out
  for (const e of await $.fs.list(dir)) {
    if (ignored(e.name) || e.name.startsWith('.')) continue
    const r = rel ? `${rel}/${e.name}` : e.name
    if (e.kind === 'dir') await listWiki($, `${dir}/${e.name}`, r, depth + 1, out)
    else if (e.kind === 'file' && isContentPage(r)) out.push({ rel: r, mtime: e.mtimeMs })
  }
  return out
}

async function mtimeOf($: EngineInterface, dir: string, name: string): Promise<number | undefined> {
  const hit = (await $.fs.list(dir).catch(() => [])).find(e => e.name === name)
  return hit?.mtimeMs
}

// Read the wiki and raw/ into a snapshot for the view, and redraw it.
async function refreshView($: EngineInterface): Promise<void> {
  if (!brain || refreshing) return
  refreshing = true
  try {
    const b = brain
    const files = (await $.fs.exists(b.wiki)) ? await listWiki($, b.wiki) : []
    const seen = new Set<string>()
    for (const f of files) {
      seen.add(f.rel)
      const cached = pageCache.get(f.rel)
      if (cached && cached.mtime === f.mtime) continue
      const text = await $.fs.read(`${b.wiki}/${f.rel}`).catch(() => '')
      pageCache.set(f.rel, { mtime: f.mtime, title: titleOf(f.rel, text), targets: linksOf(text) })
    }
    for (const k of [...pageCache.keys()]) if (!seen.has(k)) pageCache.delete(k)
    const list = files.map(f => ({ rel: f.rel, ...pageCache.get(f.rel)! }))
    const links = resolveLinks(list.map(p => ({ rel: p.rel, targets: p.targets })))
    const pages: SnapPage[] = list.map((p, i) => ({ id: p.rel.replace(/\.md$/i, ''), s: sectionOf(p.rel), t: p.title, l: links[i] ?? [], m: p.mtime }))
    const qText = await $.fs.read(`${b.meta}/questions.md`).catch(() => '')
    const waiting = (await pending($, b).catch(() => [] as RawFile[])).length
    const logAt = await mtimeOf($, b.wiki, 'log.md')
    const lastIngestAt = Math.max(current.lastRunAt, logAt ?? 0) || undefined
    const snap: BrainSnapshot = {
      pages,
      waiting,
      questions: questionsOf(qText).slice(0, 20),
      ...(lastIngestAt ? { lastIngestAt } : {}),
      librarian: { running: current.running, count: current.batch.length },
      at: Date.now(),
    }
    await update($, snapshotAtom, () => snap)
  } finally {
    refreshing = false
  }
}

function startViewTicker($: EngineInterface): void {
  if (viewTicker) return
  viewTicker = $.clock.every(VIEW_EVERY_MS, () => {
    refreshView($).catch(() => undefined)
  })
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    cwd = e.cwd
    brain = await locate($, options)
    const b = brain
    await bootstrap($, b).catch(() => undefined)
    await syncClaudeMd($, b, options['claude_md'] !== false).catch(() => undefined)
    await $.tool.register({
      name: 'ingest',
      description: 'Start the Ph1 brain librarian on new or changed files in raw/ (it runs in the background and builds the wiki). Returns what was started.',
      isDeferred: false,
    })
    await $.tool.register({
      name: 'status',
      description: "Show the second brain's location, the librarian's state, and how many raw/ files are waiting to be ingested.",
      isDeferred: false,
    })
    await $.tool.register({ name: 'view', description: 'Open the Ph1 Brain pane: the Library and the Knowledge map of the second brain.', isDeferred: false })
    startViewTicker($)
    $.clock.after(1500, () => {
      refreshView($).catch(() => undefined)
    })

    const waiting = await pending($, b).catch(() => [] as RawFile[])
    if (waiting.length > 0) {
      if (options['auto_ingest'] !== false) await ingest($, b, 'auto').catch(() => undefined)
      else $.ui.status(`Brain: ${waiting.length} new file(s) in raw/ - run /ph1-brain:ingest`)
    }
    if (options['auto_ingest'] !== false && !ticker) {
      ticker = $.clock.every(CHECK_EVERY_MS, () => {
        if (brain) ingest($, brain, 'auto').catch(() => undefined)
      })
    }
    return result
  })

  // Model tools behind /ph1-brain:ingest and /ph1-brain:status.
  on('tool.call', { tool: INGEST_TOOL }, async $ => {
    if (!brain) return { result: 'The brain folder is not set up yet.' }
    return { result: await ingest($, brain, 'command') }
  })

  on('tool.call', { tool: STATUS_TOOL }, async $ => {
    if (!brain) return { result: 'The brain folder is not set up yet.' }
    const waiting = await pending($, brain).catch(() => [] as RawFile[])
    const state = current
    return {
      result: [
        `Brain folder: ${brain.root}`,
        `Drop files into: ${brain.raw}`,
        state.running ? `Librarian: working on ${state.batch.length} file(s)` : `Librarian: idle`,
        `Waiting in raw/: ${waiting.length}`,
        `Commands: /ph1-brain:ingest, /ph1-brain:ask, /ph1-brain:lint, /ph1-brain:status`,
      ].join('\n'),
    }
  })

  // The librarian's run ends with its turn (or its stop event).
  on('turn.complete', async ($, e, next) => {
    if (e.agentId) await librarianDone($, { id: e.agentId }, options, !e.isAborted).catch(() => undefined)
    return next(e)
  })
  on('classic.SubagentStop', async ($, e, next) => {
    await librarianDone($, { id: e.agent_id, type: e.agent_type }, options, true).catch(() => undefined)
    return next(e)
  })

  // Also offered through the system prompt (some setups hold this event back; CLAUDE.md covers it).
  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    if (!brain) return result
    const b = brain
    return {
      sections: [
        ...result.sections,
        {
          id: 'ph1-brain:context',
          scope: 'session',
          text: guidance(b),
        },
      ],
    }
  })

  // /ph1-brain:view asks Claude to call this tool, which opens the pane.
  on('tool.call', { tool: VIEW_TOOL }, async $ => {
    void refreshView($).catch(() => undefined)
    const opened = await $.ui.open({ id: VIEW_PANE, title: VIEW_TITLE })
    return { result: opened.isPlaced ? 'The Brain pane is open.' : `The Brain pane is waiting for room to open (${opened.reason ?? 'no surface'}).` }
  })

  on('ui.render', { component: 'Pane', requestId: VIEW_PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const snap = await read($, snapshotAtom)
    const mode = await read($, modeAtom)
    const now = Date.now()
    const setMode = (m: ViewMode) => () => {
      void update($, modeAtom, () => m)
    }
    const summary = <Text dimColor>{summaryLine(snap, now)}</Text>
    if (e.surface === 'terminal') {
      return (
        <Box flexDirection="column">
          {summary}
          {snap.librarian.running && <Text>{`● Librarian filing ${snap.librarian.count} note(s)`}</Text>}
          {snap.questions.slice(0, 3).map(q => (
            <Text dimColor>{`? ${q}`}</Text>
          ))}
        </Box>
      )
    }
    const { Svg } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Button key="library" label="Library" variant={mode === 'library' ? 'primary' : 'secondary'} onPress={setMode('library')} />
          <Button key="map" label="Knowledge map" variant={mode === 'map' ? 'primary' : 'secondary'} onPress={setMode('map')} />
        </Box>
        {mode === 'library' ? (
          <Svg source={librarySvg(snap, now)} alt={`Brain library: ${summaryLine(snap, now)}`} isInteractive />
        ) : (
          <Svg source={mapSvg(snap, now)} alt={`Brain knowledge map: ${snap.pages.length} pages`} isInteractive />
        )}
        {summary}
      </Box>
    )
  })

  // Brain reads and wiki writes are allowed from any project; raw/ writes never.
  on('tool.check', async ($, e, next) => {
    if (e.tool === INGEST_TOOL || e.tool === STATUS_TOOL || e.tool === VIEW_TOOL) return { decision: 'allow', reason: 'ph1-brain: its own tool' }
    if (!brain) return next(e)
    const input = (e.input ?? {}) as { file_path?: unknown; path?: unknown; notebook_path?: unknown }
    const target = String(input.file_path ?? input.notebook_path ?? input.path ?? '')
    if (!target) return next(e)
    const abs = resolve(target, cwd)
    if (EDIT_TOOLS.has(e.tool) && isUnder(abs, brain.raw)) return { decision: 'deny', reason: 'ph1-brain: raw/ is read-only (rule 1: never touch raw).' }
    if (READ_TOOLS.has(e.tool) && isUnder(abs, brain.root)) return { decision: 'allow', reason: 'ph1-brain: reading the brain' }
    if (EDIT_TOOLS.has(e.tool) && isUnder(abs, brain.wiki)) return { decision: 'allow', reason: 'ph1-brain: writing the wiki' }
    return next(e)
  })

  // Hard block on changing raw/, whatever the permission mode.
  on('tool.call', async ($, e, next) => {
    if (!brain) return next(e)
    const tool = String(e.tool)
    const input = e as unknown as { file_path?: unknown; notebook_path?: unknown; command?: unknown }
    if (EDIT_TOOLS.has(tool)) {
      const target = String(input.file_path ?? input.notebook_path ?? '')
      if (target && isUnder(resolve(target, cwd), brain.raw)) {
        return { deny: `ph1-brain: ${norm(target)} is in raw/, which is read-only. Rule 1: never touch raw/. Write to wiki/ instead.` }
      }
    }
    if (tool === 'Bash' || tool === 'PowerShell') {
      const command = String(input.command ?? '')
      if (touchesRaw(command, brain.raw, cwd)) {
        return { deny: 'ph1-brain: this command could change files in raw/, which is read-only. Rule 1: never touch raw/. Read raw files with the Read tool instead.' }
      }
    }
    return next(e)
  }).catch(($, e, next) => next(e)) // tool.check still refuses raw/ edits if this guard ever fails
}
