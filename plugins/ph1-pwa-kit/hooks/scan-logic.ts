// Commit scan: pure rules for spotting secrets, files that must never be committed, and junk.
// No engine calls here, so every rule is easy to test.

export type Finding = {
  file: string
  line?: number
  kind: 'secret' | 'forbidden' | 'junk'
  what: string
  preview?: string
}

// ---------- secrets in added lines ----------

type Rule = { what: string; re: RegExp; check?: (match: string, line: string) => boolean }

const PLACEHOLDER = /^(?:x{3,}|\*{3,}|\.{3,}|changeme|change[-_]?me|password|secret|example|sample|dummy|placeholder|your[-_ ]|my[-_ ]|test|todo|null|undefined|none|redacted|<|\$\{|\{\{|%\(|process\.env|import\.meta\.env|env\()/i

// Base64url to text (ASCII is enough for a JWT payload); no runtime globals needed.
function fromBase64Url(s: string): string {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  let bits = 0
  let acc = 0
  let out = ''
  for (const ch of s) {
    const v = abc.indexOf(ch === '+' ? '-' : ch === '/' ? '_' : ch)
    if (v < 0) continue
    acc = (acc << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out += String.fromCharCode((acc >> bits) & 0xff)
    }
  }
  return out
}

// A JWT whose payload says it is a Supabase service-role key (full database access).
function isServiceRoleJwt(token: string): boolean {
  const part = token.split('.')[1]
  if (!part) return false
  try {
    return /"role"\s*:\s*"service_role"/.test(fromBase64Url(part))
  } catch {
    return false
  }
}

export const RULES: Rule[] = [
  { what: 'private key', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/ },
  { what: 'AWS access key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { what: 'GitHub token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/ },
  { what: 'Stripe live key', re: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/ },
  { what: 'Slack token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { what: 'Slack webhook', re: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/]{20,}/ },
  { what: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { what: 'Anthropic API key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { what: 'OpenAI API key', re: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b/, check: m => !m.startsWith('sk-ant-') },
  { what: 'SendGrid API key', re: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{30,}\b/ },
  { what: 'npm token', re: /\bnpm_[A-Za-z0-9]{36}\b|_authToken\s*=\s*[^\s$]{10,}/ },
  { what: 'Microsoft Teams webhook', re: /https:\/\/[a-z0-9-]+\.webhook\.office\.com\/webhookb2\/[^\s'"]{20,}/i },
  { what: 'Supabase service-role key', re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/, check: m => isServiceRoleJwt(m) },
  {
    what: 'database URL with a password',
    re: /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss|amqps?|mssql|sqlserver):\/\/[^\s:@/'"]+:([^\s@/'"]{3,})@/i,
    check: m => {
      const pw = /:\/\/[^:]+:([^@]+)@/.exec(m)?.[1] ?? ''
      return !PLACEHOLDER.test(pw) && !/^\$|^%|^\{/.test(pw)
    },
  },
  {
    what: 'password or secret written in the code',
    re: /\b(?:password|passwd|pwd|secret|client[_-]?secret|api[_-]?key|apikey|access[_-]?token|auth[_-]?token|private[_-]?key|service[_-]?role[_-]?key)\b["']?\s*[:=]\s*["'`]([^"'`\s]{8,})["'`]/i,
    check: m => {
      const value = /[:=]\s*["'`]([^"'`]+)["'`]/.exec(m)?.[1] ?? ''
      return !PLACEHOLDER.test(value)
    },
  },
  {
    what: 'secret in an env-style line',
    re: /^\s*(?:export\s+)?[A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|PRIVATE_KEY|API_KEY|SERVICE_ROLE)[A-Z0-9_]*\s*=\s*["']?([^\s"'#]{8,})/,
    check: m => {
      const value = /=\s*["']?([^\s"'#]+)/.exec(m)?.[1] ?? ''
      return !PLACEHOLDER.test(value)
    },
  },
]

// Show just enough of a secret to recognise it: never the whole value.
export function mask(s: string): string {
  const t = s.trim()
  if (t.length <= 8) return '****'
  return `${t.slice(0, 4)}…${t.slice(-2)} (${t.length} chars)`
}

// Files whose content is never scanned for secrets (lock files and the like only produce noise).
const SKIP_CONTENT = /(?:^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|composer\.lock|Cargo\.lock|poetry\.lock)$|\.(?:png|jpe?g|gif|webp|ico|svg|pdf|woff2?|ttf|otf|mp4|mp3|zip|gz)$/i

export function secretsInLine(file: string, line: number | undefined, text: string): Finding[] {
  if (SKIP_CONTENT.test(file)) return []
  const out: Finding[] = []
  for (const rule of RULES) {
    const m = rule.re.exec(text)
    if (!m) continue
    if (rule.check && !rule.check(m[0], text)) continue
    out.push({ file, ...(line !== undefined ? { line } : {}), kind: 'secret', what: rule.what, preview: mask(m[1] ?? m[0]) })
    break // one finding per line is enough
  }
  return out
}

// Scans the added lines of a unified diff (`git diff -U0`).
export function secretsInDiff(diff: string): Finding[] {
  const out: Finding[] = []
  let file = ''
  let line = 0
  for (const raw of diff.split(/\r?\n/)) {
    if (raw.startsWith('+++ ')) {
      file = raw.slice(4).replace(/^b\//, '').trim()
      continue
    }
    if (raw.startsWith('--- ') || raw.startsWith('diff --git')) continue
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw)
    if (hunk) {
      line = Number(hunk[1])
      continue
    }
    if (raw.startsWith('+')) {
      if (file && file !== '/dev/null') out.push(...secretsInLine(file, line, raw.slice(1)))
      line++
    }
  }
  return out
}

export function secretsInText(file: string, text: string): Finding[] {
  const out: Finding[] = []
  text.split(/\r?\n/).forEach((t, i) => out.push(...secretsInLine(file, i + 1, t)))
  return out
}

// ---------- files by name and size ----------

const LARGE_BYTES = 5 * 1024 * 1024

const FORBIDDEN: [RegExp, string][] = [
  [/(?:^|\/)\.env(?:\.(?!example$|sample$|template$|dist$|defaults$)[^/]+)?$/i, 'environment file (.env)'],
  [/\.(?:pem|key|p12|pfx|jks|keystore|ppk|asc)$/i, 'key or certificate file'],
  [/(?:^|\/)id_(?:rsa|dsa|ecdsa|ed25519)$/, 'SSH private key'],
  [/(?:^|\/)(?:credentials|client_secret[^/]*|service[-_]?account[^/]*|[^/]*firebase-adminsdk[^/]*)\.json$/i, 'credentials file'],
  [/(?:^|\/)\.(?:htpasswd|netrc|pgpass)$/, 'password file'],
  [/(?:^|\/)\.npmrc$/, '.npmrc (may hold a registry token)'],
]

const JUNK: [RegExp, string][] = [
  [/(?:^|\/)node_modules\//, 'node_modules'],
  [/(?:^|\/)(?:dist|build|\.next|\.nuxt|\.svelte-kit|\.output|\.turbo|\.vercel|\.netlify|coverage|\.cache)\//, 'build or cache output'],
  [/(?:^|\/)(?:test-results|playwright-report|blob-report|\.playwright-mcp)\//, 'test output or screenshots'],
  [/(?:^|\/)(?:\.DS_Store|Thumbs\.db|desktop\.ini)$/i, 'system file'],
  [/\.log$/i, 'log file'],
  [/(?:^|\/)\.claude\/settings\.local\.json$/, 'personal Claude settings'],
]

export function checkPath(file: string, size?: number): Finding | undefined {
  const f = file.replace(/\\/g, '/')
  for (const [re, what] of FORBIDDEN) if (re.test(f)) return { file: f, kind: 'forbidden', what }
  for (const [re, what] of JUNK) if (re.test(f)) return { file: f, kind: 'junk', what }
  if (size !== undefined && size > LARGE_BYTES) return { file: f, kind: 'junk', what: `large file (${(size / 1024 / 1024).toFixed(1)} MB)` }
  return undefined
}

// ---------- what a command ships ----------

export type ScanPlan = {
  mode: 'commit' | 'push'
  addsFirst: boolean // `git add ... && git commit`: files not staged yet will be in the commit
  allTracked: boolean // `git commit -a`: unstaged changes to tracked files will be in the commit
  dir?: string // `git -C <dir>` or `cd <dir> &&`
}

export function planFor(command: string): ScanPlan | undefined {
  const c = command.replace(/\s+/g, ' ')
  const dir = /\bgit -C ("[^"]+"|'[^']+'|\S+)/.exec(c)?.[1] ?? /^\s*cd ("[^"]+"|'[^']+'|[^\s;&|]+)\s*(?:&&|;)/.exec(c)?.[1]
  const d = dir?.replace(/^["']|["']$/g, '')
  const commit = /\bgit (?:-C \S+ )?commit\b/.test(c)
  const push = /\bgit (?:-C \S+ )?push\b|\bgh pr (?:create|merge)\b/.test(c)
  if (!commit && !push) return undefined
  if (commit) {
    const addsFirst = /\bgit (?:-C \S+ )?(?:add|stage)\b/.test(c.slice(0, c.search(/\bgit (?:-C \S+ )?commit\b/)))
    const allTracked = /\bgit (?:-C \S+ )?commit\b[^&|;]*\s-(?:[a-zA-Z]*a[a-zA-Z]*)\b|\bgit (?:-C \S+ )?commit\b[^&|;]*--all\b/.test(c)
    return { mode: 'commit', addsFirst, allTracked, ...(d ? { dir: d } : {}) }
  }
  return { mode: 'push', addsFirst: false, allTracked: false, ...(d ? { dir: d } : {}) }
}

// ---------- the report ----------

export function report(findings: Finding[], mode: 'commit' | 'push'): string | undefined {
  if (findings.length === 0) return undefined
  const label = { secret: 'Secret', forbidden: 'Must not be committed', junk: 'Junk' }
  const rows = findings.slice(0, 15).map(f => `- ${label[f.kind]}: ${f.file}${f.line ? `:${f.line}` : ''} - ${f.what}${f.preview ? ` (${f.preview})` : ''}`)
  const more = findings.length > 15 ? `\n- ...and ${findings.length - 15} more` : ''
  return (
    `Commit scan (ph1-pwa-kit) blocked this ${mode}:\n${rows.join('\n')}${more}\n\n` +
    `Fix it before shipping: unstage the file (git restore --staged <file>), add it to .gitignore, and move secrets into environment variables` +
    `${mode === 'push' ? '. If a secret is already in a local commit, remove it from that commit (amend or rebase) before pushing, and treat the key as leaked: replace it' : ''}. ` +
    `Never print the secret in full. If this is a false alarm or a key that is meant to be public, ask the person to type /ph1-pwa-kit:ship-gate allow-secret themselves (it allows the next commit or push only).`
  )
}
