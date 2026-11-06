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
const S = 2 // screen pixels per sprite pixel
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
  if (/handback/i.test(t)) return 'reporting'
  switch (t) {
    case 'Read': return 'reading'
    case 'Edit': case 'Write': case 'MultiEdit': case 'NotebookEdit': return 'coding'
    case 'Bash': case 'PowerShell': return 'running'
    case 'Grep': case 'Glob': return 'searching'
    case 'Skill': return 'studying'
    case 'WebFetch': case 'WebSearch': return 'researching'
    case 'Agent': return 'delegating'
    case 'SubagentHandback': return 'reporting'
    case 'TaskCreate': case 'TaskUpdate': return 'planning'
    default: return t.length > 12 ? t.slice(0, 11) + '…' : t
  }
}

export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}


// ---------- sprites ----------

const FRONT = [
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

// Seen from behind (sitting at a wall desk, facing the monitor).
const BACK = [
  '..HHHH..',
  '.HHHHHH.',
  '.HHHHHH.',
  '.HHHHHH.',
  '.HHHHHH.',
  '..SSSS..',
  '.CCCCCC.',
  'CCCCCCCC',
  'SCCCCCCS',
  '.CCCCCC.',
  '.PP..PP.',
  '.BB..BB.',
]

function spriteRows(role: Role, back: boolean): string[] {
  const r = [...(back ? BACK : FRONT)]
  switch (role.acc) {
    case 'headphones':
      r[1] = 'AHHHHHHA'
      r[2] = back ? 'AHHHHHHA' : 'AHSSSSHA'
      r[3] = back ? 'AHHHHHHA' : 'ASESSESA'
      break
    case 'hood':
      if (back) {
        r[0] = '..DDDD..'; r[1] = '.DDDDDD.'; r[2] = 'DDDDDDDD'; r[3] = 'DDDDDDDD'; r[4] = '.DDDDDD.'
      } else {
        r[0] = '..DDDD..'; r[1] = '.DHHHHD.'; r[2] = 'DHSSSSHD'; r[3] = 'DSESSESD'
      }
      break
    case 'cap': r[0] = back ? '..AAAA..' : '.AAAA...'; r[1] = back ? '.AAAAAA.' : 'AAAAAAAA'; break
    case 'glasses': r[3] = back ? 'GHHHHHHG' : '.GEGGEG.'; break
    case 'beret': r[0] = '.AAAAA..'; r[1] = 'AAAAAAH.'; break
    case 'tie': if (!back) { r[6] = '.CCTTCC.'; r[7] = 'CCCTTCCC'; r[8] = 'SCCTTCCS' } break
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

const SPRITE_W = 8 * S

// Standing, sitting seen from behind (at a desk), sitting seen from the front (sofa, lead's desk).
export type Pose = 'stand' | 'sitBack' | 'sitFront'

function poseRows(role: Role, pose: Pose): string[] {
  if (pose === 'stand') return spriteRows(role, false)
  // From behind, the chair hides the legs: head and body only.
  if (pose === 'sitBack') return spriteRows(role, true).slice(0, 10)
  // From the front: hands on the lap, shins down to the floor.
  return [...spriteRows(role, false).slice(0, 8), 'SPPPPPPS', '.PP..PP.', '.BB..BB.']
}

const POSE_H: Record<Pose, number> = { stand: 12 * S, sitBack: 10 * S, sitFront: 11 * S }

// One sprite as SVG rects, horizontal runs merged. Origin is its top-left.
export function sprite(role: Role, pose: Pose = 'stand'): string {
  const out: string[] = []
  poseRows(role, pose).forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const fill = colorOf(row[x]!, role)
      let w = 1
      while (x + w < row.length && colorOf(row[x + w]!, role) === fill) w++
      if (fill) out.push(`<rect x="${x * S}" y="${y * S}" width="${w * S}" height="${S}" fill="${fill}"/>`)
      x += w
    }
  })
  return `<g shape-rendering="crispEdges">${out.join('')}</g>`
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function bubble(text: string, color = '#ffffff'): string {
  const t = text.length > 14 ? text.slice(0, 13) + '…' : text
  const w = t.length * 5 + 10
  const cx = SPRITE_W / 2
  return `<g><rect x="${cx - w / 2}" y="-16" width="${w}" height="12" rx="3" fill="${color}" stroke="#1f2937" stroke-width="1"/>` +
    `<polygon points="${cx - 3},-4.5 ${cx + 3},-4.5 ${cx},-1" fill="${color}" stroke="#1f2937" stroke-width="1"/>` +
    `<rect x="${cx - 2.5}" y="-5.5" width="5" height="1.5" fill="${color}"/>` +
    `<text x="${cx}" y="-7.5" font-family="monospace" font-size="8" text-anchor="middle" fill="#111827">${esc(t)}</text></g>`
}

// ---------- isometric room ----------
// Floor coordinates: u runs from the back corner down-right, v from the back corner down-left, z is height.

export const W = 480
export const H = 330
const A = 20 // screen px per unit, horizontally
const B = 10 // screen px per unit, vertically
const OX = 280
const OY = 88
const RU = 9 // room depth (u)
const RV = 13 // room length (v)
const WALL = 70

type Pt = { x: number; y: number }

export function iso(u: number, v: number, z = 0): Pt {
  return { x: OX + (u - v) * A, y: OY + (u + v) * B - z }
}

const pts = (list: [number, number, number?][]) =>
  list.map(([u, v, z]) => {
    const p = iso(u, v, z ?? 0)
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
  }).join(' ')

const poly = (list: [number, number, number?][], fill: string, extra = '') => `<polygon points="${pts(list)}" fill="${fill}"${extra}/>`

function line(a: [number, number, number?], b: [number, number, number?], stroke: string, width = 1, extra = ''): string {
  const p = iso(a[0], a[1], a[2] ?? 0)
  const q = iso(b[0], b[1], b[2] ?? 0)
  return `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${q.x.toFixed(1)}" y2="${q.y.toFixed(1)}" stroke="${stroke}" stroke-width="${width}"${extra}/>`
}

// A box: top, the face toward the viewer's left (v = v1) and the face toward the viewer's right (u = u1).
function box(u0: number, v0: number, u1: number, v1: number, z0: number, z1: number, top: string, left: string, right: string): string {
  return (
    poly([[u0, v1, z0], [u1, v1, z0], [u1, v1, z1], [u0, v1, z1]], left) +
    poly([[u1, v0, z0], [u1, v1, z0], [u1, v1, z1], [u1, v0, z1]], right) +
    poly([[u0, v0, z1], [u1, v0, z1], [u1, v1, z1], [u0, v1, z1]], top)
  )
}

function ellipseAt(u: number, v: number, z: number, rx: number, ry: number, fill: string, extra = ''): string {
  const p = iso(u, v, z)
  return `<ellipse cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" rx="${rx}" ry="${ry}" fill="${fill}"${extra}/>`
}

// A small name plate in screen space, centred on a point.
function plate(p: Pt, text: string, color: string): string {
  const w = Math.max(36, text.length * 5.2 + 10)
  return `<g><rect x="${(p.x - w / 2).toFixed(1)}" y="${(p.y - 6).toFixed(1)}" width="${w.toFixed(1)}" height="11" rx="2" fill="${color}" stroke="#0f172a" stroke-width="0.6"/>` +
    `<text x="${p.x.toFixed(1)}" y="${(p.y + 2).toFixed(1)}" font-family="monospace" font-size="7.5" font-weight="bold" text-anchor="middle" fill="#ffffff">${esc(text)}</text></g>`
}

// A point on the floor, in screen pixels: where a character's feet are.
const foot = (u: number, v: number): Pt => {
  const p = iso(u, v)
  return { x: Math.round(p.x), y: Math.round(p.y) }
}

// Workstations along the long wall: five team seats, then two hot desks near the door.
export const TEAM_V = [1.3, 3.05, 4.8, 6.55, 8.3]
export const HOT_V = [10.2, 11.95]
const CHAIR_U = 2.1
const DESK_SEAT_Z = 11
const seatAt = (v: number): Pt => foot(CHAIR_U, v)

// Lounge spots: three on the sofa, two standing by the coffee table, two spare.
type Spot = { at: Pt; pose: Pose; lift: number }
// The sofa faces into the room, away from us: people on it are seen from behind, over the backrest.
const SOFA_Z = 9
export const LOUNGE: Spot[] = [
  { at: foot(8.25, 8.75), pose: 'sitBack', lift: SOFA_Z },
  { at: foot(8.25, 9.85), pose: 'sitBack', lift: SOFA_Z },
  { at: foot(8.25, 10.95), pose: 'sitBack', lift: SOFA_Z },
  { at: foot(5.7, 8.3), pose: 'stand', lift: 0 },
  { at: foot(5.5, 10.7), pose: 'stand', lift: 0 },
  { at: foot(6.4, 12.1), pose: 'stand', lift: 0 },
  { at: foot(5.0, 9.4), pose: 'stand', lift: 0 },
]

// What each lounge spot does while idle: two on the sofa chat, one plays a game, one has a coffee, one is on the phone.
type IdleAct = { prop?: 'console' | 'mug' | 'phone'; say?: string; delay: number }
const IDLE: IdleAct[] = [
  { say: 'haha!', delay: 0 },
  { say: 'right?', delay: 3 },
  { prop: 'console', say: 'gaming', delay: 1.5 },
  { prop: 'mug', say: 'coffee?', delay: 4.5 },
  { prop: 'phone', say: 'lol', delay: 2.2 },
  { prop: 'mug', delay: 0 },
  { prop: 'phone', delay: 0 },
]

const DOOR: Pt = foot(3.9, 13.6)
const LEAD_SEAT: Pt = foot(7.45, 1.55)

function workstation(v: number, on: boolean): string {
  const v0 = v - 0.55
  const v1 = v + 0.55
  const screen = on
    ? `<animate attributeName="fill" values="#38bdf8;#7dd3fc;#38bdf8" dur="1.2s" repeatCount="indefinite"/>`
    : ''
  const lines = on
    ? [0.35, 0.6, 0.85].map((f, k) => line([0.47, v0 + 0.18, 22 + (3 - k) * 2.6], [0.47, v0 + 0.18 + f * 0.7, 22 + (3 - k) * 2.6], '#0c4a6e', 1.4)).join('')
    : ''
  return (
    // monitor stand, bezel and screen
    box(0.3, v - 0.08, 0.42, v + 0.08, 16, 21, '#111827', '#1f2937', '#111827') +
    poly([[0.45, v0, 20], [0.45, v1, 20], [0.45, v1, 36], [0.45, v0, 36]], '#111827') +
    `<polygon points="${pts([[0.47, v0 + 0.08, 21.5], [0.47, v1 - 0.08, 21.5], [0.47, v1 - 0.08, 34.5], [0.47, v0 + 0.08, 34.5]])}" fill="${on ? '#38bdf8' : '#1e293b'}">${screen}</polygon>` +
    lines +
    // keyboard and mouse
    poly([[0.75, v - 0.42, 16.4], [1.0, v - 0.42, 16.4], [1.0, v + 0.32, 16.4], [0.75, v + 0.32, 16.4]], '#1f2937') +
    ellipseAt(0.9, v + 0.52, 16.5, 2.2, 1.3, '#1f2937')
  )
}

function officeChair(u: number, v: number, back: 'wall' | 'viewer', color = '#6b7280'): { seat: string; rest: string } {
  const base = ellipseAt(u, v, 1, 7, 3.2, '#111827', ' opacity="0.55"')
  const post = line([u, v, 1], [u, v, 9], '#374151', 2)
  const seat = box(u - 0.32, v - 0.32, u + 0.32, v + 0.32, 9, 11, color, '#4b5563', '#374151')
  // Backrest: on the side away from the desk. Toward the viewer it is low, so a seated person shows above it.
  const rest = back === 'viewer'
    ? box(u + 0.25, v - 0.3, u + 0.38, v + 0.3, 11, 21, color, '#4b5563', '#374151')
    : box(u - 0.4, v - 0.3, u - 0.27, v + 0.3, 11, 28, color, '#4b5563', '#374151')
  return back === 'viewer' ? { seat: base + post + seat, rest } : { seat: base + post + rest + seat, rest: '' }
}

function room(): string {
  const out: string[] = []
  // Floor: warm wood planks.
  out.push(poly([[0, 0], [RU, 0], [RU, RV], [0, RV]], '#9a7351'))
  for (let u = 0.5; u < RU; u += 0.5) out.push(line([u, 0], [u, RV], '#86613f', 0.8))
  for (let k = 0; k < 26; k++) {
    const u = (k % 18) * 0.5
    const v = ((k * 7) % 12) + 0.6
    out.push(line([u, v], [u + 0.5, v], '#7a5636', 0.8))
  }

  // Back-left wall (long): white brick splash, dark cabinets above.
  out.push(poly([[0, 0, 0], [0, RV, 0], [0, RV, WALL], [0, 0, WALL]], '#eceae6'))
  for (let z = 20; z <= 44; z += 4) out.push(line([0, 0, z], [0, RV, z], '#d6d3cd', 0.6))
  for (let z = 20, row = 0; z < 44; z += 4, row++) {
    for (let v = (row % 2) * 0.35; v < RV; v += 0.7) out.push(line([0, v, z], [0, v, z + 4], '#d6d3cd', 0.6))
  }
  for (let v = 0.2; v < RV - 0.2; v += 1.05) {
    out.push(poly([[0.02, v, 48], [0.02, v + 1.0, 48], [0.02, v + 1.0, 69], [0.02, v, 69]], '#4b5059'))
    out.push(poly([[0.03, v + 0.05, 49], [0.03, v + 0.95, 49], [0.03, v + 0.95, 68], [0.03, v + 0.05, 68]], '#565b64'))
    out.push(line([0.04, v + 0.85, 52], [0.04, v + 0.85, 56], '#9ca3af', 1.2))
  }
  out.push(box(0, 0, 0.55, RV, 46, 48, '#3a3f47', '#2f333a', '#2f333a'))

  // Back-right wall: sign and clock; windows behind the glass office.
  out.push(poly([[0, 0, 0], [RU, 0, 0], [RU, 0, WALL], [0, 0, WALL]], '#f4f3f0'))
  const s = iso(0.45, 0, 52)
  out.push(
    `<g transform="matrix(1 0.5 0 1 ${s.x.toFixed(1)} ${s.y.toFixed(1)})"><rect x="0" y="-11" width="80" height="16" fill="#1f2937"/>` +
      `<text x="40" y="0.5" font-family="monospace" font-size="8.5" font-weight="bold" text-anchor="middle" fill="#fbbf24">D&amp;C AI Agents</text></g>`,
  )
  const c = iso(4.95, 0, 50)
  out.push(
    `<g transform="matrix(1 0.5 0 1 ${c.x.toFixed(1)} ${c.y.toFixed(1)})"><circle cx="0" cy="0" r="7" fill="#ffffff" stroke="#111827" stroke-width="1.5"/>` +
      `<line x1="0" y1="0" x2="0" y2="-4.5" stroke="#111827" stroke-width="1.2"/><line x1="0" y1="0" x2="3.5" y2="0" stroke="#111827" stroke-width="1.2"/></g>`,
  )
  for (const [a, b] of [[5.9, 7.3], [7.5, 8.9]] as const) {
    out.push(poly([[a, 0, 30], [b, 0, 30], [b, 0, 64], [a, 0, 64]], '#bfdbfe'))
    out.push(poly([[a + 0.1, 0, 52], [a + 0.55, 0, 52], [a + 0.55, 0, 56], [a + 0.1, 0, 56]], '#ffffff', ' opacity="0.8"'))
    out.push(`<polygon points="${pts([[a, 0, 30], [b, 0, 30], [b, 0, 64], [a, 0, 64]])}" fill="none" stroke="#1f2937" stroke-width="2"/>`)
    out.push(line([(a + b) / 2, 0, 30], [(a + b) / 2, 0, 64], '#1f2937', 1.5))
  }
  // Wall caps.
  out.push(line([0, RV, WALL], [0, 0, WALL], '#1f2937', 3), line([0, 0, WALL], [RU, 0, WALL], '#1f2937', 3))
  out.push(line([0, 0, 0], [0, 0, WALL], '#cfcac2', 1))

  // The long desk counter: walnut top, dark drawers.
  out.push(box(0, 0.25, 1.35, RV - 0.25, 0, 16, '#6b4a33', '#2b2b2e', '#232326'))
  out.push(box(0, 0.25, 1.38, RV - 0.25, 14.5, 16, '#7a5439', '#5b3d29', '#5b3d29'))
  for (let v = 0.25; v < RV - 0.5; v += 1.75) out.push(line([1.36, v, 0], [1.36, v, 14.5], '#3b3b40', 1))
  return out.join('')
}

function glassRoomBack(): string {
  // Partition along u = 5.5 (behind the room's furniture, as seen from here).
  return (
    poly([[5.5, 0, 0], [5.5, 5, 0], [5.5, 5, 62], [5.5, 0, 62]], '#cfe3f0', ' opacity="0.28"') +
    line([5.5, 0, 62], [5.5, 5, 62], '#111827', 2.5) +
    line([5.5, 2.5, 0], [5.5, 2.5, 62], '#111827', 1.6) +
    // shelving unit with a vase of flowers
    box(5.9, 0, 8.9, 0.6, 0, 22, '#3f3f46', '#8a5a36', '#6f4528') +
    line([6.9, 0.6, 0], [6.9, 0.6, 20], '#5c3a22', 1) +
    line([7.9, 0.6, 0], [7.9, 0.6, 20], '#5c3a22', 1) +
    box(8.3, 0.15, 8.5, 0.35, 22, 30, '#e5e7eb', '#e5e7eb', '#cbd5e1') +
    ellipseAt(8.4, 0.25, 34, 4, 3, '#fb923c') +
    ellipseAt(8.25, 0.3, 32, 2.5, 2, '#f97316')
  )
}

function execDesk(): string {
  return (
    box(6.55, 2.2, 8.4, 3.05, 0, 14, '#7a5439', '#5b3d29', '#4a3122') +
    // laptop
    poly([[7.1, 2.35, 14.3], [7.6, 2.35, 14.3], [7.6, 2.85, 14.3], [7.1, 2.85, 14.3]], '#e5e7eb') +
    poly([[7.1, 2.35, 14.3], [7.1, 2.85, 14.3], [7.1, 2.85, 21], [7.1, 2.35, 21]], '#cbd5e1')
  )
}

function glassRoomFront(): string {
  return (
    // guest chairs in front of the desk
    box(6.9, 3.5, 7.5, 4.1, 0, 7, '#e5e7eb', '#d1d5db', '#cbd5e1') +
    box(6.9, 3.95, 7.5, 4.1, 7, 14, '#e5e7eb', '#d1d5db', '#cbd5e1') +
    // partition along v = 5 with a glass door
    poly([[5.5, 5, 0], [RU, 5, 0], [RU, 5, 62], [5.5, 5, 62]], '#cfe3f0', ' opacity="0.3"') +
    line([5.5, 5, 0], [5.5, 5, 62], '#111827', 2.5) +
    line([5.5, 5, 62], [RU, 5, 62], '#111827', 2.5) +
    line([6.2, 5, 0], [6.2, 5, 56], '#111827', 1.6) +
    line([7.4, 5, 0], [7.4, 5, 56], '#111827', 1.6) +
    line([6.2, 5, 56], [7.4, 5, 56], '#111827', 1.6) +
    line([7.25, 5, 26], [7.25, 5, 32], '#111827', 2)
  )
}

function lounge(): string {
  const sofaTop = '#f8fafc'
  const sofaL = '#e2e8f0'
  const sofaR = '#cbd5e1'
  return (
    // rug
    poly([[5.2, 7.6], [7.9, 7.6], [7.9, 12.2], [5.2, 12.2]], '#d6d3cd', ' opacity="0.55"') +
    // plant
    box(8.1, 6.3, 8.6, 6.8, 0, 9, '#57534e', '#78716c', '#57534e') +
    ellipseAt(8.35, 6.55, 18, 9, 7, '#15803d') +
    ellipseAt(8.2, 6.7, 23, 6, 5, '#22c55e') +
    ellipseAt(8.5, 6.4, 24, 5, 4, '#16a34a') +
    // sofa along the right wall (its seat and far armrest; the rest is drawn after the people on it)
    box(8.0, 7.7, 8.85, 11.9, 0, 9, sofaTop, sofaL, sofaR) +
    box(7.95, 7.55, 8.95, 7.85, 0, 13, sofaTop, sofaL, sofaR)
  )
}

// The sofa's backrest, cushions and near armrest: in front of anyone sitting on it.
function sofaFront(): string {
  const sofaTop = '#f8fafc'
  const sofaL = '#e2e8f0'
  const sofaR = '#cbd5e1'
  return (
    box(8.55, 7.7, 8.95, 11.9, 9, 14, sofaTop, sofaL, sofaR) +
    box(8.38, 7.9, 8.55, 8.3, 9, 13, '#86efac', '#4ade80', '#22c55e') +
    box(8.38, 11.3, 8.55, 11.7, 9, 13, '#d1d5db', '#9ca3af', '#6b7280') +
    box(7.95, 11.75, 8.95, 12.05, 0, 13, sofaTop, sofaL, sofaR)
  )
}

function coffeeTable(): string {
  return (
    line([6.6, 9.6, 0], [6.6, 9.6, 9], '#3f3f46', 2) +
    ellipseAt(6.6, 9.6, 9, 17, 8.5, '#a16207') +
    ellipseAt(6.6, 9.6, 9.8, 15.5, 7.6, '#c08a4a') +
    poly([[6.4, 9.3, 10], [6.8, 9.3, 10], [6.8, 9.75, 10], [6.4, 9.75, 10]], '#f8fafc')
  )
}

function frontWalls(): string {
  return (
    // low white wall on the right
    box(RU, 0, RU + 0.2, RV, 0, 6, '#9ca3af', '#e5e7eb', '#f3f4f6') +
    // glass front wall with a door
    poly([[0, RV, 0], [RU, RV, 0], [RU, RV, 40], [0, RV, 40]], '#cfe3f0', ' opacity="0.22"') +
    line([0, RV, 40], [RU, RV, 40], '#111827', 2.5) +
    line([0, RV, 0], [0, RV, 40], '#111827', 2.5) +
    line([2.9, RV, 0], [2.9, RV, 40], '#111827', 1.6) +
    line([4.9, RV, 0], [4.9, RV, 40], '#111827', 1.6) +
    line([3.85, RV, 14], [3.85, RV, 22], '#111827', 1.8) +
    line([4.0, RV, 14], [4.0, RV, 22], '#111827', 1.8) +
    line([7.0, RV, 0], [7.0, RV, 40], '#111827', 1.2)
  )
}

type Move = { from: Pt; to: Pt; elapsed: number }
type CharOpts = { mode: 'work' | 'idle'; pose: Pose; lift: number; text?: string; color?: string; act?: IdleAct }

// Little things in hand, drawn over the sprite (origin: its top-left).
function prop(kind: IdleAct['prop'], pose: Pose): string {
  const lap = pose === 'sitFront'
  switch (kind) {
    case 'console':
      return `<g shape-rendering="crispEdges"><rect x="3" y="${lap ? 14 : 15}" width="10" height="4" fill="#1f2937"/>` +
        `<rect x="6" y="${lap ? 15 : 16}" width="4" height="2" fill="#4ade80"><animate attributeName="fill" values="#4ade80;#facc15;#38bdf8;#4ade80" dur="0.9s" repeatCount="indefinite"/></rect></g>`
    case 'mug':
      return `<g shape-rendering="crispEdges"><rect x="14" y="13" width="4" height="5" fill="#f8fafc"/><rect x="14" y="13" width="4" height="1" fill="#78350f"/><rect x="18" y="14" width="1" height="2" fill="#f8fafc"/>` +
        `<rect x="15" y="10" width="1" height="2" fill="#cbd5e1" opacity="0.8"><animate attributeName="y" values="11;8;11" dur="1.6s" repeatCount="indefinite"/></rect></g>`
    case 'phone':
      return `<g shape-rendering="crispEdges"><rect x="12" y="11" width="3" height="5" fill="#111827"/>` +
        `<rect x="12.5" y="11.5" width="2" height="3.5" fill="#60a5fa"><animate attributeName="opacity" values="1;0.6;1" dur="1.4s" repeatCount="indefinite"/></rect></g>`
    default:
      return ''
  }
}

// A chat line that comes and goes, so the lounge isn't covered in bubbles.
function chat(text: string, delay: number): string {
  return `<g opacity="0"><animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.04;0.38;0.42;1" dur="6s" begin="${delay}s" repeatCount="indefinite"/>${bubble(text, '#f1f5f9')}</g>`
}

// A character: walks from→to (continuing mid-walk on a redraw via a negative begin), then sits or stands
// in its pose. Positions are foot points; the walk shows a standing sprite, swapped for the pose on arrival.
function character(role: Role, move: Move, o: CharOpts): string {
  const { from, to, elapsed } = move
  const walking = elapsed < WALK_MS && (from.x !== to.x || from.y !== to.y)
  const t = (elapsed / 1000).toFixed(2)
  const arrive = ((WALK_MS - elapsed) / 1000).toFixed(2)
  const pos = walking ? from : to
  const walkAnim = walking
    ? `<animateTransform attributeName="transform" type="translate" from="${from.x} ${from.y}" to="${to.x} ${to.y}" dur="${WALK_MS / 1000}s" begin="-${t}s" fill="freeze"/>`
    : ''
  const bob = walking
    ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 -2;0 0" dur="0.32s" begin="-${t}s" repeatCount="5"/>`
    : o.mode === 'work'
      ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 -1;0 0" dur="0.5s" repeatCount="indefinite"/>`
      : ''
  const dx = -SPRITE_W / 2
  const top = -(POSE_H[o.pose] + o.lift)
  const shadow = o.pose === 'stand' || walking ? `<ellipse cx="0" cy="-1" rx="7" ry="2.5" fill="#000" opacity="0.18"/>` : ''
  // Seen from behind, whatever is in their hands is hidden.
  const held = o.pose === 'sitBack' ? '' : prop(o.act?.prop, o.pose)
  const posed = `<g transform="translate(${dx} ${top})">${sprite(role, o.pose)}${held}</g>`
  const standing = `<g transform="translate(${dx} ${-POSE_H.stand})">${sprite(role, 'stand')}</g>`
  const body = walking
    ? `<g>${standing}<set attributeName="visibility" to="hidden" begin="${arrive}s" fill="freeze"/></g>` +
      `<g visibility="hidden"><set attributeName="visibility" to="visible" begin="${arrive}s" fill="freeze"/>${posed}</g>`
    : posed
  // The speech bubble sits above the head in the final pose.
  const say = o.text ? bubble(o.text, o.color) : o.act?.say ? chat(o.act.say, o.act.delay) : ''
  const talk = !say
    ? ''
    : `<g transform="translate(${dx} ${top})">${walking ? `<g visibility="hidden"><set attributeName="visibility" to="visible" begin="${arrive}s" fill="freeze"/>${say}</g>` : say}</g>`
  return `<g transform="translate(${pos.x} ${pos.y})">${walkAnim}${shadow}<g>${bob}${body}</g>${talk}</g>`
}

export type Placed = { role: Role; agent?: OfficeAgent; deskLabel: string }

// Builds the whole office SVG for the agents as they stand at `now`.
export function officeSvg(agents: OfficeAgent[], leadActivity: string | undefined, now: number): string {
  const active = agents.filter(a => a.endedAt === undefined).sort((a, b) => a.startedAt - b.startedAt)
  const usedRole = new Set<number>()
  const guests: OfficeAgent[] = []
  for (const a of active) {
    const i = roleIndex(a.type)
    if (i >= 0 && !usedRole.has(i)) usedRole.add(i)
    else guests.push(a)
  }

  const stations: string[] = []
  const plates: string[] = []
  const desks: string[] = [] // per workstation, back to front: seat, seated person, backrest
  const inLounge: { y: number; svg: string; onSofa: boolean }[] = []
  const walkers: string[] = []
  const seated = { pose: 'sitBack' as const, lift: DESK_SEAT_Z }

  const station = (v: number, person: string) => {
    const c = officeChair(CHAIR_U, v, 'viewer')
    desks.push(c.seat + person + c.rest)
  }

  // Team workstations and their people.
  ROLES.forEach((role, i) => {
    const v = TEAM_V[i]!
    const working = active.find(a => roleIndex(a.type) === i)
    stations.push(workstation(v, !!working))
    plates.push(plate(iso(0, v, 41), role.label, role.shirtDark))
    const spot = LOUNGE[i]!
    const seat = seatAt(v)
    if (working) {
      const ch = character(role, { from: spot.at, to: seat, elapsed: now - working.startedAt }, { mode: 'work', ...seated, text: working.activity ?? 'starting' })
      if (now - working.startedAt < WALK_MS) {
        station(v, '')
        walkers.push(ch)
      } else station(v, ch)
      return
    }
    station(v, '')
    const lastDone = agents
      .filter(a => roleIndex(a.type) === i && a.endedAt !== undefined)
      .sort((a, b) => b.endedAt! - a.endedAt!)[0]
    const sinceDone = lastDone ? now - lastDone.endedAt! : Infinity
    const justDone = sinceDone < 20000
    const ch = character(role, { from: seat, to: spot.at, elapsed: lastDone ? sinceDone : WALK_MS }, {
      mode: 'idle',
      pose: spot.pose,
      lift: spot.lift,
      ...(justDone ? { text: 'done!', color: '#bbf7d0' } : {}),
      act: IDLE[i],
    })
    if (lastDone && sinceDone < WALK_MS) walkers.push(ch)
    else inLounge.push({ y: spot.at.y, svg: ch, onSofa: spot.pose === 'sitBack' })
  })

  // Hot desks for helpers (other agent types, or a second agent of the same role).
  HOT_V.forEach((v, j) => {
    const g = guests[j]
    const role = g ? roleFor(g.type) : GUEST
    const short = g ? (g.type.split(':').pop() ?? g.type) : 'Hot desk'
    stations.push(workstation(v, !!g))
    plates.push(plate(iso(0, v, 41), short.length > 12 ? short.slice(0, 11) + '…' : short, '#475569'))
    if (!g) return station(v, '')
    const ch = character(role, { from: DOOR, to: seatAt(v), elapsed: now - g.startedAt }, { mode: 'work', ...seated, text: g.activity ?? 'starting' })
    if (now - g.startedAt < WALK_MS) {
      station(v, '')
      walkers.push(ch)
    } else station(v, ch)
  })
  // Finished helpers walk out of the door.
  agents
    .filter(a => a.endedAt !== undefined && now - a.endedAt < WALK_MS && roleIndex(a.type) < 0)
    .slice(0, 2)
    .forEach((a, j) => {
      walkers.push(`<g opacity="0.9">${character(GUEST, { from: seatAt(HOT_V[j]!), to: DOOR, elapsed: now - a.endedAt! }, { mode: 'idle', pose: 'stand', lift: 0 })}</g>`)
    })

  // The lead, in the glass office: always in, sitting behind the desk.
  const leadChair = officeChair(7.6, 1.45, 'wall', '#1f2937')
  const lead =
    leadChair.seat +
    character(LEAD, { from: LEAD_SEAT, to: LEAD_SEAT, elapsed: WALK_MS }, {
      mode: 'work',
      pose: 'sitFront',
      lift: 9,
      text: leadActivity ?? (active.length ? 'managing' : 'ready'),
    })
  const leadPlate = plate(iso(8.4, 2.65, 7), LEAD.label, LEAD.shirtDark)

  // Lounge: everyone after the furniture, back to front.
  const byDepth = inLounge.sort((a, b) => a.y - b.y)
  const standing = byDepth.filter(x => !x.onSofa).map(x => x.svg)
  const onSofa = byDepth.filter(x => x.onSofa).map(x => x.svg)

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#f8fafc"/>` +
    `<ellipse cx="${iso(RU / 2, RV / 2).x}" cy="${iso(RU, RV).y - 2}" rx="230" ry="16" fill="#0f172a" opacity="0.08"/>` +
    room() +
    stations.join('') +
    plates.join('') +
    desks.join('') +
    glassRoomBack() +
    lead +
    execDesk() +
    glassRoomFront() +
    lounge() +
    coffeeTable() +
    standing.join('') +
    onSofa.join('') +
    sofaFront() +
    walkers.join('') +
    frontWalls() +
    leadPlate +
    `</svg>`
  )

}
