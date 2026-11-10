// Commit scan: before Claude runs git commit, git push or gh pr create/merge, look at exactly what
// would be shipped and block it if it holds secrets, files that must never be committed, or junk.
import type { EngineInterface } from 'claude-code'

import { checkPath, planFor, report, secretsInDiff, secretsInText } from './scan-logic'
import type { Finding, ScanPlan } from './scan-logic'

const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
const MAX_UNTRACKED = 300
const MAX_TEXT = 1024 * 1024

type Git = (args: string[], stdin?: string) => Promise<{ ok: boolean; out: string }>

function gitIn($: EngineInterface, cwd: string | undefined): Git {
  return async (args, stdin) => {
    try {
      const r = await $.process.run(['git', ...args], { ...(cwd ? { cwd } : {}), ...(stdin !== undefined ? { stdin } : {}), timeoutMs: 20_000 })
      return { ok: r.exitCode === 0, out: r.stdout }
    } catch {
      return { ok: false, out: '' }
    }
  }
}

const lines = (s: string) => s.split(/\r?\n/).map(l => l.trim()).filter(Boolean)

// Sizes of blobs, one call: `<rev>:<path>` per line on stdin.
async function sizes(git: Git, rev: string, files: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (files.length === 0) return out
  const r = await git(['cat-file', '--batch-check=%(objectsize)'], files.map(f => `${rev}:${f}`).join('\n') + '\n')
  if (!r.ok) return out
  lines(r.out).forEach((l, i) => {
    const n = Number(l)
    const f = files[i]
    if (f && Number.isFinite(n)) out.set(f, n)
  })
  return out
}

function byPath(files: string[], size: Map<string, number>): Finding[] {
  const out: Finding[] = []
  for (const f of files) {
    const hit = checkPath(f, size.get(f))
    if (hit) out.push(hit)
  }
  return out
}

async function scanCommit($: EngineInterface, git: Git, plan: ScanPlan, root: string): Promise<Finding[]> {
  const findings: Finding[] = []
  // Staged changes always go in.
  const staged = lines((await git(['diff', '--cached', '--name-only', '--diff-filter=ACMR'])).out)
  findings.push(...byPath(staged, await sizes(git, '', staged)))
  findings.push(...secretsInDiff((await git(['diff', '--cached', '-U0', '--no-color', '--no-ext-diff', '--diff-filter=ACMR'])).out))

  // `git add ... && git commit` or `commit -a`: unstaged changes to tracked files go in too.
  if (plan.addsFirst || plan.allTracked) {
    const changed = lines((await git(['diff', '--name-only', '--diff-filter=ACMR'])).out)
    findings.push(...byPath(changed, new Map()))
    findings.push(...secretsInDiff((await git(['diff', '-U0', '--no-color', '--no-ext-diff', '--diff-filter=ACMR'])).out))
  }
  // `git add` can also bring in new files that aren't ignored.
  if (plan.addsFirst) {
    const untracked = lines((await git(['ls-files', '--others', '--exclude-standard'])).out).slice(0, MAX_UNTRACKED)
    for (const f of untracked) {
      const hit = checkPath(f)
      if (hit) {
        findings.push(hit)
        continue
      }
      const text = await $.fs.read(`${root}/${f}`).catch(() => '')
      if (text.length > MAX_TEXT) findings.push({ file: f, kind: 'junk', what: `large file (over ${MAX_TEXT / 1024 / 1024} MB)` })
      else findings.push(...secretsInText(f, text))
    }
  }
  return findings
}

async function scanPush(git: Git): Promise<Finding[]> {
  // What isn't on the remote yet: since the upstream, else since the default branch, else everything.
  let base = ''
  if ((await git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])).ok) base = '@{u}'
  else {
    const mb = await git(['merge-base', 'HEAD', 'origin/HEAD'])
    base = mb.ok ? lines(mb.out)[0] ?? EMPTY_TREE : EMPTY_TREE
  }
  const files = lines((await git(['diff', '--name-only', '--diff-filter=ACMR', base, 'HEAD'])).out)
  const findings = byPath(files, await sizes(git, 'HEAD', files))
  findings.push(...secretsInDiff((await git(['diff', '-U0', '--no-color', '--no-ext-diff', '--diff-filter=ACMR', base, 'HEAD'])).out))
  return findings
}

// Returns the block message, or undefined when the command may go ahead.
// Any failure to read git (not a repo, git missing) lets the command through: git itself will complain.
export async function scanShipCommand($: EngineInterface, command: string, cwd: string): Promise<string | undefined> {
  const plan = planFor(command)
  if (!plan) return undefined
  const dir = plan.dir ? (/^(?:[a-zA-Z]:)?[\\/]/.test(plan.dir) ? plan.dir : `${cwd}/${plan.dir}`) : cwd || undefined
  const git = gitIn($, dir)
  const top = await git(['rev-parse', '--show-toplevel'])
  if (!top.ok) return undefined
  const root = lines(top.out)[0] ?? dir ?? ''
  const findings = plan.mode === 'commit' ? await scanCommit($, git, plan, root) : await scanPush(git)
  // One line per file and problem.
  const seen = new Set<string>()
  const unique = findings.filter(f => {
    const k = `${f.file}|${f.line ?? ''}|${f.what}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  return report(unique, plan.mode)
}
