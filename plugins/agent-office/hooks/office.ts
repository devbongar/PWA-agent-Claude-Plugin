// Pure drawing logic for the agent office: no engine calls, so it is easy to test.
import type { OfficeAgent } from '../types'

export type Role = {
  key: string
  label: string
  shirt: string
  shirtDark: string
  hair: string
  acc: 'headphones' | 'hood' | 'cap' | 'glasses' | 'beret' | 'tie' | 'none'
  accColor: string
}

export const ROLES: Role[] = [
  { key: 'frontend-developer', label: 'Frontend', shirt: '#3b82f6', shirtDark: '#1d4ed8', hair: '#4a2f1b', acc: 'headphones', accColor: '#111827' },
  { key: 'backend-developer', label: 'Backend', shirt: '#16a34a', shirtDark: '#166534', hair: '#1f1f1f', acc: 'hood', accColor: '#166534' },
  { key: 'qa-engineer', label: 'QA', shirt: '#f97316', shirtDark: '#c2410c', hair: '#7c4a1e', acc: 'cap', accColor: '#0f766e' },
  { key: 'code-reviewer', label: 'Code Review', shirt: '#8b5cf6', shirtDark: '#6d28d9', hair: '#6b7280', acc: 'glasses', accColor: '#111827' },
  { key: 'ui-reviewer', label: 'UI Review', shirt: '#ec4899', shirtDark: '#be185d', hair: '#e8b04a', acc: 'beret', accColor: '#b91c1c' },
]

export const LEAD: Role = { key: 'lead', label: 'Lead (Claude)', shirt: '#1e3a8a', shirtDark: '#172554', hair: '#c2410c', acc: 'tie', accColor: '#dc2626' }
export const GUEST: Role = { key: 'guest', label: 'Helper', shirt: '#64748b', shirtDark: '#475569', hair: '#3f3f46', acc: 'none', accColor: '#000' }

export const WALK_MS = 1600
const S = 3 // screen pixels per sprite pixel
const SKIN = '#f1c27d'

export function roleIndex(type: string): number {
  const short = type.split(':').pop() ?? type
  return ROLES.findIndex(r => r.key === short)
}

export function roleFor(type: string): Role {
  const i = roleIndex(type)
  return i >= 0 ? ROLES[i]! : GUEST
}

// What a tool call looks like as a speech bubble.
export function activityFor(tool: string): string {
  const t = tool.replace(/^mcp__plugin_playwright_playwright__browser_/, 'pw:')
  if (t.startsWith('pw:')) {
    const a = t.slice(3)
    if (a === 'take_screenshot') return 'screenshot'
    if (a === 'resize') return 'resizing'
    if (a.startsWith('navigate')) return 'browsing'
    if (['click', 'hover', 'type', 'fill_form', 'press_key', 'select_option', 'drag', 'drop'].includes(a)) return 'clicking'
    return 'browser'
  }
  switch (t) {
    case 'Read': return 'reading'
    case 'Edit': case 'Write': case 'MultiEdit': case 'NotebookEdit': return 'coding'
    case 'Bash': case 'PowerShell': return 'running'
    case 'Grep': case 'Glob': return 'searching'
    case 'Skill': return 'studying'
    case 'WebFetch': case 'WebSearch': return 'researching'
    case 'Agent': return 'delegating'
    case 'TaskCreate': case 'TaskUpdate': return 'planning'
    default: return t.length > 12 ? t.slice(0, 11) + '…' : t
  }
}

export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

// ---------- sprites ----------

const BASE = [
  '..HHHH..',
  '.HHHHHH.',
  '.HSSSSH.',
  '.SESSES.',
  '.SSSSSS.',
  '..SSSS..',
  '.CCCCCC.',
  'CCCCCCCC',
  'SCCCCCCS',
  '.CCCCCC.',
  '.PP..PP.',
  '.BB..BB.',
]

function spriteRows(role: Role): string[] {
  const r = [...BASE]
  switch (role.acc) {
    case 'headphones': r[1] = 'AHHHHHHA'; r[2] = 'AHSSSSHA'; r[3] = 'ASESSESA'; break
    case 'hood': r[0] = '..DDDD..'; r[1] = '.DHHHHD.'; r[2] = 'DHSSSSHD'; r[3] = 'DSESSESD'; break
    case 'cap': r[0] = '.AAAA...'; r[1] = 'AAAAAAAA'; break
    case 'glasses': r[3] = '.GEGGEG.'; break
    case 'beret': r[0] = '.AAAAA..'; r[1] = 'AAAAAAH.'; break
    case 'tie': r[6] = '.CCTTCC.'; r[7] = 'CCCTTCCC'; r[8] = 'SCCTTCCS'; break
    case 'none': break
  }
  return r
}

function colorOf(ch: string, role: Role): string | undefined {
  switch (ch) {
    case 'H': return role.hair
    case 'S': return SKIN
    case 'E': return '#1f2937'
    case 'C': return role.shirt
    case 'D': return role.shirtDark
    case 'P': return '#334155'
    case 'B': return '#111827'
    case 'A': return role.accColor
    case 'G': return '#111827'
    case 'T': return '#dc2626'
    default: return undefined
  }
}

// One sprite as SVG rects, horizontal runs merged. Origin is its top-left.
export function sprite(role: Role): string {
  const out: string[] = []
  spriteRows(role).forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const fill = colorOf(row[x]!, role)
      let w = 1
      while (x + w < row.length && colorOf(row[x + w]!, role) === fill) w++
      if (fill) out.push(`<rect x="${x * S}" y="${y * S}" width="${w * S}" height="${S}" fill="${fill}"/>`)
      x += w
    }
  })
  return out.join('')
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function bubble(text: string, color = '#ffffff'): string {
  const t = text.length > 14 ? text.slice(0, 13) + '…' : text
  const w = t.length * 5 + 8
  const x = 12 - w / 2
  return `<g><rect x="${x}" y="-15" width="${w}" height="11" fill="${color}" stroke="#1f2937" stroke-width="1"/>` +
    `<rect x="9" y="-4" width="3" height="3" fill="${color}"/>` +
    `<text x="12" y="-7" font-family="monospace" font-size="8" text-anchor="middle" fill="#111827">${esc(t)}</text></g>`
}

// ---------- layout ----------

export const W = 480
export const H = 340
const DESK_W = 76

type Pt = { x: number; y: number }
const deskAt = (x: number, y: number) => ({ x, y })
export const TEAM_DESKS: Pt[] = [0, 1, 2, 3, 4].map(i => deskAt(14 + i * 92, 70))
export const LEAD_DESK: Pt = deskAt(14, 170)
export const HOT_DESKS: Pt[] = [deskAt(290, 170), deskAt(382, 170)]
export const LOUNGE: Pt[] = [0, 1, 2, 3, 4, 5, 6].map(i => ({ x: 150 + i * 34, y: 280 }))
const DOOR: Pt = { x: 452, y: 280 }

const seat = (d: Pt): Pt => ({ x: d.x + 44, y: d.y + 6 })

function desk(d: Pt, label: string, on: boolean, labelColor: string): { back: string; front: string } {
  const screen = on
    ? `<rect x="${d.x + 8}" y="${d.y + 12}" width="24" height="16" fill="#38bdf8">` +
      `<animate attributeName="fill" values="#38bdf8;#7dd3fc;#38bdf8" dur="1.2s" repeatCount="indefinite"/></rect>` +
      `<rect x="${d.x + 10}" y="${d.y + 15}" width="12" height="2" fill="#0c4a6e"/>` +
      `<rect x="${d.x + 10}" y="${d.y + 19}" width="18" height="2" fill="#0c4a6e"/>` +
      `<rect x="${d.x + 10}" y="${d.y + 23}" width="9" height="2" fill="#0c4a6e"/>`
    : `<rect x="${d.x + 8}" y="${d.y + 12}" width="24" height="16" fill="#1f2937"/>`
  const back =
    `<rect x="${d.x + 6}" y="${d.y + 10}" width="28" height="20" fill="#374151"/>` + screen +
    `<rect x="${d.x + 17}" y="${d.y + 30}" width="6" height="4" fill="#374151"/>` +
    // chair back
    `<rect x="${d.x + 42}" y="${d.y + 14}" width="28" height="22" fill="#4b5563"/>`
  const front =
    `<rect x="${d.x}" y="${d.y + 34}" width="${DESK_W}" height="8" fill="#a16207"/>` +
    `<rect x="${d.x + 4}" y="${d.y + 42}" width="${DESK_W - 8}" height="18" fill="#854d0e"/>` +
    `<rect x="${d.x + 8}" y="${d.y + 64}" width="${DESK_W - 16}" height="11" fill="${labelColor}"/>` +
    `<text x="${d.x + DESK_W / 2}" y="${d.y + 72}" font-family="monospace" font-size="8" font-weight="bold" text-anchor="middle" fill="#ffffff">${esc(label)}</text>`
  return { back, front }
}

type Move = { from: Pt; to: Pt; elapsed: number }

// A character group: walks from→to (continuing mid-walk on a redraw via a negative begin), then types or idles.
function character(role: Role, move: Move, mode: 'work' | 'idle', text?: string, bubbleColor?: string): string {
  const { from, to, elapsed } = move
  const walking = elapsed < WALK_MS && (from.x !== to.x || from.y !== to.y)
  const t = (elapsed / 1000).toFixed(2)
  const pos = walking ? from : to
  const walkAnim = walking
    ? `<animateTransform attributeName="transform" type="translate" from="${from.x} ${from.y}" to="${to.x} ${to.y}" dur="${WALK_MS / 1000}s" begin="-${t}s" fill="freeze"/>`
    : ''
  const bob = walking
    ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 -3;0 0" dur="0.32s" begin="-${t}s" repeatCount="5"/>`
    : mode === 'work'
      ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 -1;0 0" dur="0.5s" begin="${Math.max(0, (WALK_MS - elapsed) / 1000).toFixed(2)}s" repeatCount="indefinite"/>`
      : ''
  // While walking the bubble is hidden, and shows itself on arrival with no redraw needed.
  const talk = !text
    ? ''
    : walking
      ? `<g visibility="hidden"><set attributeName="visibility" to="visible" begin="${((WALK_MS - elapsed) / 1000).toFixed(2)}s" fill="freeze"/>${bubble(text, bubbleColor)}</g>`
      : bubble(text, bubbleColor)
  return `<g transform="translate(${pos.x} ${pos.y})">${walkAnim}<g>${bob}${sprite(role)}</g>${talk}</g>`
}

export type Placed = { role: Role; agent?: OfficeAgent; deskLabel: string }

// Builds the whole office SVG for the agents as they stand at `now`.
export function officeSvg(agents: OfficeAgent[], leadActivity: string | undefined, now: number): string {
  const backs: string[] = []
  const fronts: string[] = []
  const people: string[] = []

  const active = agents.filter(a => a.endedAt === undefined).sort((a, b) => a.startedAt - b.startedAt)
  const usedRole = new Set<number>()
  const guests: OfficeAgent[] = []
  for (const a of active) {
    const i = roleIndex(a.type)
    if (i >= 0 && !usedRole.has(i)) usedRole.add(i)
    else guests.push(a)
  }

  // Team desks and their people.
  ROLES.forEach((role, i) => {
    const d = TEAM_DESKS[i]!
    const working = active.find(a => roleIndex(a.type) === i)
    const k = desk(d, role.label, !!working, role.shirtDark)
    backs.push(k.back)
    fronts.push(k.front)
    const home = LOUNGE[i]!
    if (working) {
      people.push(character(role, { from: home, to: seat(d), elapsed: now - working.startedAt }, 'work', working.activity ?? 'starting'))
      return
    }
    const lastDone = agents
      .filter(a => roleIndex(a.type) === i && a.endedAt !== undefined)
      .sort((a, b) => b.endedAt! - a.endedAt!)[0]
    const sinceDone = lastDone ? now - lastDone.endedAt! : Infinity
    people.push(
      character(role, { from: seat(d), to: home, elapsed: lastDone ? sinceDone : WALK_MS }, 'idle', sinceDone < 20000 ? 'done!' : undefined, '#bbf7d0'),
    )
  })

  // Lead desk: always occupied.
  const lk = desk(LEAD_DESK, LEAD.label, true, LEAD.shirtDark)
  backs.push(lk.back)
  fronts.push(lk.front)
  const ls = seat(LEAD_DESK)
  people.push(character(LEAD, { from: ls, to: ls, elapsed: WALK_MS }, 'work', leadActivity ?? (active.length ? 'managing' : 'ready')))

  // Hot desks for helpers (other agent types, or a second agent of the same role).
  HOT_DESKS.forEach((d, j) => {
    const g = guests[j]
    const role = g ? roleFor(g.type) : GUEST
    const short = g ? (g.type.split(':').pop() ?? g.type) : 'Hot desk'
    const k = desk(d, short.length > 12 ? short.slice(0, 11) + '…' : short, !!g, '#475569')
    backs.push(k.back)
    fronts.push(k.front)
    if (g) people.push(character(role, { from: DOOR, to: seat(d), elapsed: now - g.startedAt }, 'work', g.activity ?? 'starting'))
  })
  // Finished helpers walk out of the door.
  agents
    .filter(a => a.endedAt !== undefined && now - a.endedAt < WALK_MS && roleIndex(a.type) < 0)
    .slice(0, 2)
    .forEach((a, j) => {
      const d = HOT_DESKS[j]!
      people.push(`<g opacity="0.9">${character(GUEST, { from: seat(d), to: DOOR, elapsed: now - a.endedAt! }, 'idle')}</g>`)
    })

  const floorLines: string[] = []
  for (let x = 0; x <= W; x += 24) floorLines.push(`<rect x="${x}" y="56" width="1" height="${H - 56}" fill="#b08b5a"/>`)
  for (let y = 56; y <= H; y += 24) floorLines.push(`<rect x="0" y="${y}" width="${W}" height="1" fill="#b08b5a"/>`)

  const room =
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#c9a77a"/>` + floorLines.join('') +
    // wall
    `<rect x="0" y="0" width="${W}" height="56" fill="#e7dcc6"/><rect x="0" y="52" width="${W}" height="4" fill="#8b6b43"/>` +
    // window
    `<rect x="300" y="8" width="96" height="36" fill="#7c5a36"/><rect x="304" y="12" width="42" height="28" fill="#93c5fd"/><rect x="350" y="12" width="42" height="28" fill="#93c5fd"/>` +
    `<rect x="308" y="30" width="14" height="6" fill="#ffffff"/><rect x="362" y="18" width="18" height="6" fill="#ffffff"/>` +
    // sign
    `<rect x="14" y="12" width="150" height="26" fill="#1f2937"/><text x="89" y="29" font-family="monospace" font-size="11" font-weight="bold" text-anchor="middle" fill="#fbbf24">PH1 PWA STUDIO</text>` +
    // clock
    `<rect x="214" y="14" width="24" height="24" fill="#ffffff" stroke="#1f2937" stroke-width="2"/><rect x="225" y="18" width="2" height="9" fill="#1f2937"/><rect x="225" y="25" width="7" height="2" fill="#1f2937"/>` +
    // plant
    `<rect x="440" y="22" width="16" height="14" fill="#16a34a"/><rect x="436" y="28" width="8" height="8" fill="#22c55e"/><rect x="452" y="28" width="8" height="8" fill="#22c55e"/><rect x="442" y="36" width="12" height="14" fill="#b45309"/>` +
    // lounge rug, sofa, coffee machine, door
    `<rect x="100" y="262" width="300" height="70" fill="#d6c3a1"/><rect x="104" y="266" width="292" height="62" fill="none" stroke="#a8875a" stroke-width="2"/>` +
    `<rect x="14" y="276" width="70" height="30" fill="#7f1d1d"/><rect x="14" y="268" width="70" height="12" fill="#991b1b"/><rect x="10" y="272" width="8" height="34" fill="#7f1d1d"/><rect x="80" y="272" width="8" height="34" fill="#7f1d1d"/>` +
    `<text x="49" y="320" font-family="monospace" font-size="8" text-anchor="middle" fill="#3f2a14">LOUNGE</text>` +
    `<rect x="412" y="262" width="22" height="34" fill="#374151"/><rect x="416" y="268" width="14" height="8" fill="#111827"/><rect x="418" y="284" width="10" height="8" fill="#ffffff"/>` +
    `<rect x="446" y="246" width="30" height="50" fill="#78350f"/><rect x="468" y="270" width="3" height="4" fill="#fbbf24"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">` +
    room + backs.join('') + people.join('') + fronts.join('') + `</svg>`
}
