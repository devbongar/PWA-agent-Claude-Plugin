// Brain view: the Library and the Knowledge map. Pure parsing and drawing, no engine calls.
import type { BrainSnapshot, SnapPage } from '../types'

export const SECTIONS = ['clients', 'projects', 'decisions', 'topics', 'people', 'sources'] as const
export type Section = (typeof SECTIONS)[number] | 'other'

export const COLORS: Record<string, string> = {
  clients: '#3b82f6',
  projects: '#22c55e',
  decisions: '#f59e0b',
  topics: '#a855f7',
  people: '#ec4899',
  sources: '#64748b',
  other: '#94a3b8',
}

const NEW_MS = 24 * 60 * 60 * 1000

// ---------- parsing ----------

// The section of a wiki page from its path relative to wiki/ ("clients/acme.md" -> clients).
export function sectionOf(rel: string): Section {
  const first = rel.split('/')[0] ?? ''
  return (SECTIONS as readonly string[]).includes(first) ? (first as Section) : 'other'
}

// Pages that aren't content: the index, the log and the librarian's own files.
export function isContentPage(rel: string): boolean {
  if (!/\.md$/i.test(rel)) return false
  if (rel.startsWith('_meta/')) return false
  return !/^(index|log|readme)\.md$/i.test(rel)
}

export function titleOf(rel: string, text: string): string {
  const h = /^#\s+(.+)$/m.exec(text)
  if (h?.[1]) return h[1].trim().slice(0, 60)
  const base = rel.split('/').pop() ?? rel
  return base.replace(/\.md$/i, '').replace(/[-_]+/g, ' ')
}

// Link targets in a page: Obsidian [[links]] and relative Markdown links to .md files.
export function linksOf(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) if (m[1]) out.push(m[1].trim())
  for (const m of text.matchAll(/\]\(([^)\s]+\.md)(?:#[^)]*)?\)/gi)) if (m[1] && !/^[a-z]+:/i.test(m[1])) out.push(m[1].trim())
  return out
}

const key = (s: string) => s.toLowerCase().replace(/\\/g, '/').replace(/\.md$/i, '')

// Turn raw link targets into indices of known pages (by path, or by file name as Obsidian does).
export function resolveLinks(pages: { rel: string; targets: string[] }[]): number[][] {
  const byPath = new Map<string, number>()
  const byName = new Map<string, number>()
  pages.forEach((p, i) => {
    const k = key(p.rel)
    byPath.set(k, i)
    const name = k.split('/').pop() ?? k
    if (!byName.has(name)) byName.set(name, i)
  })
  return pages.map((p, i) => {
    const dir = p.rel.split('/').slice(0, -1)
    const found = new Set<number>()
    for (const t of p.targets) {
      let k = key(t)
      if (k.startsWith('wiki/')) k = k.slice(5)
      let hit = byPath.get(k)
      if (hit === undefined && (k.startsWith('.') || k.includes('/'))) {
        const parts = [...dir]
        for (const seg of k.split('/')) {
          if (seg === '..') parts.pop()
          else if (seg !== '.' && seg) parts.push(seg)
        }
        hit = byPath.get(parts.join('/'))
      }
      if (hit === undefined) hit = byName.get(k.split('/').pop() ?? k)
      if (hit !== undefined && hit !== i) found.add(hit)
    }
    return [...found]
  })
}

// Open questions: list items in questions.md.
export function questionsOf(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(l => /^\s*(?:[-*]|\d+[.)])\s+(.+)$/.exec(l)?.[1]?.trim())
    .filter((q): q is string => !!q && !/^_.*_$/.test(q))
}

// ---------- shared helpers ----------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export function ago(at: number | undefined, now: number): string {
  if (!at) return 'never'
  const m = Math.max(0, Math.round((now - at) / 60000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

export function counts(snap: BrainSnapshot): Record<string, number> {
  const c: Record<string, number> = {}
  for (const p of snap.pages) c[p.s] = (c[p.s] ?? 0) + 1
  return c
}

export function summaryLine(snap: BrainSnapshot, now: number): string {
  const lib = snap.librarian.running ? `librarian filing ${snap.librarian.count} note(s)` : 'librarian idle'
  return `${snap.pages.length} pages · ${snap.waiting} waiting in raw/ · ${snap.questions.length} open questions · last ingest ${ago(snap.lastIngestAt, now)} · ${lib}`
}

// ---------- Library ----------

const SHELVES: [string, string][] = [
  ['clients', 'CLIENTS'],
  ['projects', 'PROJECTS'],
  ['decisions', 'DECISIONS'],
  ['topics', 'TOPICS'],
  ['people', 'PEOPLE'],
]

const px = (x: number, y: number, w: number, h: number, c: string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`

function librarian(): string {
  return [
    px(4, 0, 12, 10, '#f2c6a0'),
    px(3, -3, 14, 5, '#9ca3af'),
    px(5, 3, 4, 1, '#111'),
    px(11, 3, 4, 1, '#111'),
    px(6, 4, 2, 2, '#111'),
    px(12, 4, 2, 2, '#111'),
    px(2, 10, 16, 14, '#0d9488'),
    px(4, 24, 4, 8, '#334155'),
    px(12, 24, 4, 8, '#334155'),
  ].join('')
}

export function librarySvg(snap: BrainSnapshot, now: number): string {
  const W = 480
  const H = 340
  const c = counts(snap)
  const p: string[] = [px(0, 0, W, H, '#3b2f2a'), px(0, 0, W, 120, '#5b4a3f'), px(0, 118, W, 4, '#2a201b')]
  for (let y = 126; y < H; y += 16) for (let x = ((y / 16) % 2) * 16; x < W; x += 32) p.push(px(x, y, 16, 16, '#433630'))

  // Newest page: its book blinks for a while after it was written.
  const newest = snap.pages.reduce<SnapPage | undefined>((a, b) => (!a || b.m > a.m ? b : a), undefined)
  const blinkShelf = newest && (snap.librarian.running || now - newest.m < 30 * 60 * 1000) ? newest.s : undefined

  SHELVES.forEach(([sec, label], i) => {
    const x = 14 + i * 92
    const y = 18
    const n = c[sec] ?? 0
    const per = Math.max(1, Math.ceil(n / 36)) // each book stands for this many pages on a full shelf
    const books = Math.ceil(n / per)
    p.push(px(x, y, 80, 96, '#6b4423'), px(x + 3, y + 3, 74, 90, '#2b1d12'))
    for (let r = 0; r < 3; r++) p.push(px(x + 3, y + 30 + r * 30, 74, 3, '#6b4423'))
    let k = 0
    for (let r = 0; r < 3; r++)
      for (let b = 0; b < 12 && k < books; b++, k++) {
        const h = 18 + ((k * 7) % 8)
        const bx = x + 5 + b * 6
        const by = y + 30 + r * 30 - h
        const shade = k % 3 === 0 ? '#ffffff33' : k % 3 === 1 ? '#00000033' : '#00000000'
        p.push(px(bx, by, 5, h, COLORS[sec] ?? '#999'), px(bx, by, 5, h, shade), px(bx, by + 4, 5, 2, '#f8fafc55'))
        if (blinkShelf === sec && k === books - 1) {
          p.push(`<rect x="${bx}" y="${by}" width="5" height="${h}" fill="#fff" opacity=".7"><animate attributeName="opacity" values=".7;0;.7" dur="1.2s" repeatCount="indefinite"/></rect>`)
        }
      }
    p.push(
      `<g><title>${esc(`${label.toLowerCase()}: ${n} page${n === 1 ? '' : 's'}${per > 1 ? ` (each book = ${per} pages)` : ''}`)}</title>${px(x, y + 98, 80, 12, '#1f2937')}</g>`,
      `<text x="${x + 40}" y="${y + 107}" text-anchor="middle" font-family="monospace" font-size="8" font-weight="bold" fill="#f8fafc">${label} ${n}</text>`,
    )
  })

  // The raw/ inbox tray at the door.
  const stack = Math.min(snap.waiting, 8)
  const paper = ['#e2e8f0', '#fde68a', '#bfdbfe', '#fecaca']
  p.push(px(24, 262, 70, 10, '#8b5a2b'), px(24, 272, 70, 28, '#6b4423'))
  for (let i = 0; i < stack; i++) p.push(px(30 + (i % 2) * 2, 252 - i * 3, 54, 12, paper[i % 4] ?? '#e2e8f0'), px(30 + (i % 2) * 2, 252 - i * 3, 54, 1, '#94a3b8'))
  p.push(
    `<text x="59" y="316" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="${snap.waiting ? '#fde68a' : '#94a3b8'}">raw/ inbox: ${snap.waiting}</text>`,
  )

  // The librarian's desk.
  p.push(px(300, 250, 110, 14, '#8b5a2b'), px(304, 264, 8, 30, '#6b4423'), px(398, 264, 8, 30, '#6b4423'), px(320, 236, 26, 14, '#f1f5f9'), px(360, 240, 20, 10, '#a16207'))
  p.push(`<text x="355" y="314" text-anchor="middle" font-family="monospace" font-size="9" fill="#cbd5e1">librarian's desk</text>`)

  if (snap.librarian.running) {
    // Walks between the inbox and the shelves, carrying notes, with a bubble overhead.
    const bubble = `filing ${snap.librarian.count} note${snap.librarian.count === 1 ? '' : 's'}...`
    const bw = bubble.length * 6 + 14
    p.push(
      `<g>${librarian()}${px(16, 12, 8, 6, '#fde68a')}<g><rect x="-8" y="-34" width="${bw}" height="20" rx="3" fill="#f8fafc"/><polygon points="4,-14 12,-14 6,-7" fill="#f8fafc"/><text x="${bw / 2 - 8}" y="-20" text-anchor="middle" font-family="monospace" font-size="9" fill="#0f172a">${esc(bubble)}</text></g><animateTransform attributeName="transform" type="translate" values="105 228;205 160;105 228" dur="6s" repeatCount="indefinite"/></g>`,
    )
  } else {
    // Sits at the desk; a small bubble when new files are waiting but auto-ingest is off.
    p.push(`<g transform="translate(345 210)">${librarian()}</g>`)
    if (snap.waiting > 0) {
      p.push(
        `<g><rect x="300" y="182" width="120" height="20" rx="3" fill="#f8fafc"/><text x="360" y="196" text-anchor="middle" font-family="monospace" font-size="9" fill="#0f172a">${esc(`${snap.waiting} to file`)}</text></g>`,
      )
    }
  }

  // Noticeboard.
  const q = snap.questions
  p.push(px(300, 140, 166, 84, '#8b5a2b'), px(304, 144, 158, 76, '#d6b98c'))
  p.push(px(310, 150, 70, 30, '#fef08a'), px(386, 150, 70, 30, '#bbf7d0'), px(310, 186, 146, 28, q.length ? '#fecaca' : '#e2e8f0'))
  p.push(
    `<text x="314" y="162" font-family="monospace" font-size="8" fill="#422006">${snap.pages.length} pages</text>`,
    `<text x="314" y="174" font-family="monospace" font-size="8" fill="#422006">${c['sources'] ?? 0} source${(c['sources'] ?? 0) === 1 ? '' : 's'}</text>`,
    `<text x="390" y="162" font-family="monospace" font-size="8" fill="#14532d">last ingest</text>`,
    `<text x="390" y="174" font-family="monospace" font-size="8" fill="#14532d">${ago(snap.lastIngestAt, now)}</text>`,
    `<text x="314" y="198" font-family="monospace" font-size="8" fill="#7f1d1d">${q.length} open question${q.length === 1 ? '' : 's'}</text>`,
  )
  if (q[0]) p.push(`<text x="314" y="209" font-family="monospace" font-size="8" fill="#7f1d1d"><title>${esc(q.slice(0, 5).join('\n'))}</title>${esc(cut(`"${q[0]}"`, 32))}</text>`)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">${p.join('')}</svg>`
}

// ---------- Knowledge map ----------

const MAX_NODES = 80
const LABELS = 14

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

export type Node = { i: number; x: number; y: number; r: number; deg: number }

// Pick the best-connected pages and lay them out with a small force simulation.
// Deterministic: the same wiki always draws the same map.
export function layout(snap: BrainSnapshot, w: number, h: number): { nodes: Node[]; edges: [number, number][] } {
  const deg = new Map<number, number>()
  snap.pages.forEach((p, i) => {
    for (const j of p.l) {
      deg.set(i, (deg.get(i) ?? 0) + 1)
      deg.set(j, (deg.get(j) ?? 0) + 1)
    }
  })
  const chosen = snap.pages
    .map((p, i) => ({ i, d: deg.get(i) ?? 0, m: p.m }))
    .sort((a, b) => b.d - a.d || b.m - a.m)
    .slice(0, MAX_NODES)
  const at = new Map<number, number>()
  chosen.forEach((c, k) => at.set(c.i, k))
  const edgeSet = new Set<string>()
  const edges: [number, number][] = []
  for (const c of chosen)
    for (const j of snap.pages[c.i]?.l ?? []) {
      const a = at.get(c.i)
      const b = at.get(j)
      if (a === undefined || b === undefined) continue
      const id = a < b ? `${a}-${b}` : `${b}-${a}`
      if (!edgeSet.has(id)) {
        edgeSet.add(id)
        edges.push([a, b])
      }
    }
  const maxDeg = Math.max(1, ...chosen.map(c => c.d))
  const nodes: Node[] = chosen.map(c => {
    const id = snap.pages[c.i]?.id ?? String(c.i)
    return { i: c.i, deg: c.d, r: 4 + Math.round(11 * Math.sqrt(c.d / maxDeg)), x: w * (0.15 + 0.7 * hash(id)), y: h * (0.15 + 0.7 * hash(`${id}#y`)) }
  })
  const n = nodes.length
  if (n === 0) return { nodes, edges }
  const area = w * h
  const k = Math.sqrt(area / Math.max(n, 4)) * 0.55
  for (let iter = 0; iter < 160; iter++) {
    const t = 18 * (1 - iter / 160) + 0.5
    const dx = new Array<number>(n).fill(0)
    const dy = new Array<number>(n).fill(0)
    for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++) {
        const A = nodes[a]!
        const B = nodes[b]!
        let ex = A.x - B.x
        let ey = A.y - B.y
        let d = Math.hypot(ex, ey)
        if (d < 0.01) {
          ex = 0.1 + a * 0.01
          ey = 0.1
          d = 0.15
        }
        const f = (k * k) / d
        dx[a] = (dx[a] ?? 0) + (ex / d) * f
        dy[a] = (dy[a] ?? 0) + (ey / d) * f
        dx[b] = (dx[b] ?? 0) - (ex / d) * f
        dy[b] = (dy[b] ?? 0) - (ey / d) * f
      }
    for (const [a, b] of edges) {
      const A = nodes[a]!
      const B = nodes[b]!
      const ex = A.x - B.x
      const ey = A.y - B.y
      const d = Math.max(0.01, Math.hypot(ex, ey))
      const f = (d * d) / k
      dx[a] = (dx[a] ?? 0) - (ex / d) * f
      dy[a] = (dy[a] ?? 0) - (ey / d) * f
      dx[b] = (dx[b] ?? 0) + (ex / d) * f
      dy[b] = (dy[b] ?? 0) + (ey / d) * f
    }
    for (let a = 0; a < n; a++) {
      const A = nodes[a]!
      // A gentle pull to the middle keeps unlinked pages from drifting off.
      dx[a] = (dx[a] ?? 0) + (w / 2 - A.x) * 0.06 * k * 0.1
      dy[a] = (dy[a] ?? 0) + (h / 2 - A.y) * 0.06 * k * 0.1
      const d = Math.max(0.01, Math.hypot(dx[a] ?? 0, dy[a] ?? 0))
      A.x = Math.min(w - 28, Math.max(28, A.x + ((dx[a] ?? 0) / d) * Math.min(d, t)))
      A.y = Math.min(h - 26, Math.max(26, A.y + ((dy[a] ?? 0) / d) * Math.min(d, t)))
    }
  }
  return { nodes, edges }
}

export function mapSvg(snap: BrainSnapshot, now: number): string {
  const W = 480
  const H = 400
  const top = 44
  const graphH = H - top - 26
  const c = counts(snap)
  const p: string[] = [`<rect width="${W}" height="${H}" fill="#111827"/>`, `<rect width="${W}" height="${top}" fill="#1f2937"/>`]
  const fresh = snap.pages.filter(pg => now - pg.m < NEW_MS).length
  const stats: [string, string][] = [
    [String(snap.pages.length), 'pages'],
    [String(c['sources'] ?? 0), 'sources'],
    [String(snap.waiting), 'in raw/'],
    [String(snap.questions.length), 'questions'],
    [ago(snap.lastIngestAt, now), 'last ingest'],
  ]
  stats.forEach(([v, l], i) => {
    const x = 14 + i * 93
    p.push(
      `<text x="${x}" y="20" font-family="monospace" font-size="13" font-weight="bold" fill="#f8fafc">${esc(v)}</text>`,
      `<text x="${x}" y="35" font-family="monospace" font-size="9" fill="#94a3b8">${l}</text>`,
    )
  })

  if (snap.pages.length === 0) {
    p.push(`<text x="${W / 2}" y="${top + graphH / 2}" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#94a3b8">No wiki pages yet. Drop files into raw/ and the librarian builds the map.</text>`)
  } else {
    const { nodes, edges } = layout(snap, W, graphH)
    p.push(`<g transform="translate(0 ${top})">`)
    for (const [a, b] of edges) {
      const A = nodes[a]!
      const B = nodes[b]!
      p.push(`<line x1="${A.x.toFixed(1)}" y1="${A.y.toFixed(1)}" x2="${B.x.toFixed(1)}" y2="${B.y.toFixed(1)}" stroke="#475569" stroke-width="1" opacity=".7"/>`)
    }
    // Label the best-connected pages, skipping any label that would overlap one already placed.
    const labelled = new Map<number, { x: number; y: number; text: string }>()
    const boxes: { x1: number; x2: number; y1: number; y2: number }[] = []
    for (const nd of [...nodes].sort((a, b) => b.deg - a.deg)) {
      if (labelled.size >= LABELS) break
      const text = cut(snap.pages[nd.i]!.t, 22)
      const half = text.length * 2.6 + 2
      const x = Math.min(W - half - 2, Math.max(half + 2, nd.x))
      // Below the dot first, then above it.
      for (const y of [nd.y + nd.r + 11, nd.y - nd.r - 4]) {
        const box = { x1: x - half, x2: x + half, y1: y - 9, y2: y + 2 }
        const hitsLabel = boxes.some(b => b.x1 < box.x2 && box.x1 < b.x2 && b.y1 < box.y2 && box.y1 < b.y2)
        const hitsDot = nodes.some(o => o !== nd && o.x + o.r * 0.5 > box.x1 && o.x - o.r * 0.5 < box.x2 && o.y + o.r * 0.5 > box.y1 && o.y - o.r * 0.5 < box.y2)
        if (hitsLabel || hitsDot || box.y1 < 0) continue
        boxes.push(box)
        labelled.set(nd.i, { x, y, text })
        break
      }
    }
    for (const nd of nodes) {
      const pg = snap.pages[nd.i]!
      const col = COLORS[pg.s] ?? COLORS['other']!
      const isNew = now - pg.m < NEW_MS
      const tip = `${isNew ? 'NEW · ' : ''}${pg.t} (${pg.s}, ${nd.deg} link${nd.deg === 1 ? '' : 's'})`
      p.push(`<g><title>${esc(tip)}</title>`)
      if (isNew) {
        p.push(
          `<circle cx="${nd.x.toFixed(1)}" cy="${nd.y.toFixed(1)}" r="${nd.r + 5}" fill="none" stroke="${col}" stroke-width="2" opacity=".6"><animate attributeName="r" values="${nd.r + 3};${nd.r + 7};${nd.r + 3}" dur="2s" repeatCount="indefinite"/></circle>`,
        )
      }
      p.push(`<circle cx="${nd.x.toFixed(1)}" cy="${nd.y.toFixed(1)}" r="${nd.r}" fill="${col}" stroke="#0f172a" stroke-width="1.5"/></g>`)
      const lab = labelled.get(nd.i)
      if (lab) p.push(`<text x="${lab.x.toFixed(1)}" y="${lab.y.toFixed(1)}" text-anchor="middle" font-family="sans-serif" font-size="9" fill="#e2e8f0">${esc(lab.text)}</text>`)
    }
    p.push('</g>')
    const shown = nodes.length < snap.pages.length ? `showing the ${nodes.length} best-connected of ${snap.pages.length} pages · ` : ''
    p.push(`<text x="${W - 10}" y="${top + 14}" text-anchor="end" font-family="sans-serif" font-size="9" fill="#64748b">${shown}${fresh} new today · hover a dot for its name</text>`)
  }

  const legend = Object.entries(COLORS).filter(([k]) => k !== 'other')
  legend.forEach(([k, col], i) => {
    const x = 12 + i * 78
    p.push(`<circle cx="${x + 5}" cy="${H - 10}" r="4" fill="${col}"/><text x="${x + 13}" y="${H - 7}" font-family="monospace" font-size="9" fill="#cbd5e1">${k}</text>`)
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${p.join('')}</svg>`
}
