import { expect, test } from 'claude-code/testing'

import { checkPath, mask, planFor, secretsInDiff, secretsInLine } from '../hooks/scan-logic'

// Fake secrets are built from pieces, so this file never holds a whole key-shaped string
// (GitHub push protection and the scan itself would rightly flag it).
const STRIPE = 'sk_' + 'live_' + 'a1B2c3D4e5F6g7H8i9J0kLmN'
const AWS = 'AKIA' + 'IOSFODNN7EXAMPL1'
const GH = 'ghp' + '_' + 'abcdefghijklmnopqrstuvwxyz0123456789AB'
const PEM = '-----BEGIN ' + 'RSA PRIVATE KEY-----'
const b64 = (s: string) => {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  let out = ''
  let acc = 0
  let bits = 0
  for (const ch of s) {
    acc = (acc << 8) | ch.charCodeAt(0)
    bits += 8
    while (bits >= 6) {
      bits -= 6
      out += abc[(acc >> bits) & 63]
    }
  }
  if (bits > 0) out += abc[(acc << (6 - bits)) & 63]
  return out
}
const jwt = (payload: string) => `eyJ${b64('{"alg":"HS256"}').slice(3)}.${b64(payload)}.signaturepart123456`

test('known key formats are caught, and shown only masked', () => {
  for (const [line, what] of [
    [`const stripe = "${STRIPE}"`, 'Stripe live key'],
    [`aws_key = ${AWS}`, 'AWS access key'],
    [`token: ${GH}`, 'GitHub token'],
    [PEM, 'private key'],
  ] as const) {
    const f = secretsInLine('src/a.ts', 3, line)
    expect(f[0]?.what).toBe(what)
    expect(f[0]?.preview).not.toContain(line.includes(STRIPE) ? STRIPE : '§never§')
  }
  expect(mask(STRIPE)).toBe(`sk_l…mN (${STRIPE.length} chars)`)
})

test('a Supabase service-role key is caught, the public anon key is not', () => {
  expect(secretsInLine('src/db.ts', 1, `const key = '${jwt('{"role":"service_role","iss":"supabase"}')}'`)[0]?.what).toBe('Supabase service-role key')
  expect(secretsInLine('src/db.ts', 1, `const key = '${jwt('{"role":"anon","iss":"supabase"}')}'`)).toEqual([])
})

test('hard-coded passwords and DB URLs are caught; placeholders and env lookups are not', () => {
  expect(secretsInLine('a.ts', 1, `const password = "Hunter2Strong!"`)[0]?.what).toBe('password or secret written in the code')
  expect(secretsInLine('a.ts', 1, 'DATABASE_URL=postgres://app:' + 'S3cretPass@db.example.com:5432/app')[0]?.what).toBe('database URL with a password')
  expect(secretsInLine('.env.local', 1, 'STRIPE_SECRET_KEY=' + 'abcd1234efgh5678')[0]?.what).toBe('secret in an env-style line')
  for (const ok of [
    `const password = "changeme"`,
    `const apiKey = process.env.API_KEY`,
    `api_key: "\${API_KEY}"`,
    'DATABASE_URL=postgres://user:password@localhost/app',
    'SECRET_KEY=your-secret-here',
    `const token = "<your token>"`,
  ]) expect(secretsInLine('a.ts', 1, ok)).toEqual([])
})

test('only added lines of a diff are scanned, with their line numbers', () => {
  const diff = [
    'diff --git a/src/pay.ts b/src/pay.ts',
    '--- a/src/pay.ts',
    '+++ b/src/pay.ts',
    '@@ -10,0 +11,2 @@',
    '+const a = 1',
    `+const stripe = "${STRIPE}"`,
    '@@ -20 +22 @@',
    `-const old = "${STRIPE}"`,
    '+const b = 2',
  ].join('\n')
  const f = secretsInDiff(diff)
  expect(f.length).toBe(1)
  expect(f[0]?.file).toBe('src/pay.ts')
  expect(f[0]?.line).toBe(12)
})

test('files that must never be committed, and junk, are caught by name and size', () => {
  expect(checkPath('.env')?.kind).toBe('forbidden')
  expect(checkPath('apps/web/.env.test.local')?.kind).toBe('forbidden')
  expect(checkPath('.env.example')).toBeUndefined()
  expect(checkPath('certs/server.pem')?.kind).toBe('forbidden')
  expect(checkPath('firebase-adminsdk-abc.json')?.kind).toBe('forbidden')
  expect(checkPath('node_modules/react/index.js')?.kind).toBe('junk')
  expect(checkPath('test-results/login-chromium/screenshot.png')?.kind).toBe('junk')
  expect(checkPath('.DS_Store')?.kind).toBe('junk')
  expect(checkPath('assets/video.mp4', 12 * 1024 * 1024)?.what).toContain('large file')
  expect(checkPath('src/app.ts', 2000)).toBeUndefined()
})

test('the plan knows what a command ships', () => {
  expect(planFor('git commit -m "x"')).toEqual({ mode: 'commit', addsFirst: false, allTracked: false })
  expect(planFor('git add -A && git commit -m "x"')?.addsFirst).toBe(true)
  expect(planFor('git commit -am "x"')?.allTracked).toBe(true)
  expect(planFor('git push origin main')?.mode).toBe('push')
  expect(planFor('gh pr create --fill')?.mode).toBe('push')
  expect(planFor('cd apps/web && git commit -m x')?.dir).toBe('apps/web')
  expect(planFor('git status')).toBeUndefined()
})
