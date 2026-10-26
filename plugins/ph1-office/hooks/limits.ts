// Usage-limit gauge: pure drawing and formatting, no engine calls.

export type LimitReading = { kind: string; percentUsed: number; resetsAt?: string }
export type Limits = { readings: LimitReading[]; at: number }

export const LABELS: Record<string, string> = { five_hour: '5-hour limit', seven_day: 'Weekly limit', spend_limit: 'Spend limit' }

export function pick(readings: LimitReading[], kind: string): LimitReading | undefined {
  return readings.find(r => r.kind === kind)
}

export function color(pct: number): string {
  return pct >= 90 ? '#dc2626' : pct >= 70 ? '#f59e0b' : '#22c55e'
}

export function resetsIn(resetsAt: string | undefined, now: number): string | undefined {
  if (!resetsAt) return undefined
  const ms = Date.parse(resetsAt) - now
  if (!Number.isFinite(ms)) return undefined
  if (ms <= 0) return 'resetting now'
  const mins = Math.ceil(ms / 60000)
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  return d > 0 ? `resets in ${d}d ${h}h` : h > 0 ? `resets in ${h}h ${m}m` : `resets in ${m}m`
}

const pad = (n: number) => String(n).padStart(2, '0')
export function clock(resetsAt: string | undefined): string | undefined {
  if (!resetsAt) return undefined
  const t = new Date(resetsAt)
  if (Number.isNaN(t.getTime())) return undefined
  const h = t.getHours()
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(t.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`
}

export function line(r: LimitReading, now: number): string {
  const label = LABELS[r.kind] ?? r.kind
  const when = [resetsIn(r.resetsAt, now), clock(r.resetsAt) ? `(${clock(r.resetsAt)})` : ''].filter(Boolean).join(' ')
  return `${label}: ${Math.round(r.percentUsed)}% used${when ? ` · ${when}` : ''}`
}

// The status bar entry: the 5-hour window, short.
export function statusLine(readings: LimitReading[], now: number): string | undefined {
  const r = pick(readings, 'five_hour')
  if (!r) return undefined
  const when = resetsIn(r.resetsAt, now)?.replace('resets in ', 'reset ')
  return `5h limit ${Math.round(r.percentUsed)}%${when ? ` · ${when}` : ''}`
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Pixel-style segmented bars, one per window, with the 5-hour window first.
export function limitsSvg(readings: LimitReading[], now: number): string {
  const W = 480
  const order = ['five_hour', 'seven_day', 'spend_limit']
  const rows = order.map(k => pick(readings, k)).filter((r): r is LimitReading => !!r)
  const H = rows.length === 0 ? 34 : 14 + rows.length * 30
  const parts: string[] = [`<rect x="0" y="0" width="${W}" height="${H}" fill="#1f2937"/>`]
  if (rows.length === 0) {
    parts.push(
      `<text x="12" y="21" font-family="monospace" font-size="10" fill="#cbd5e1">No limit reading yet. It appears after Claude's next reply.</text>`,
    )
  }
  rows.forEach((r, i) => {
    const y = 8 + i * 30
    const pct = Math.max(0, Math.min(100, r.percentUsed))
    const lit = Math.round(pct / 5)
    const fill = color(r.percentUsed)
    parts.push(`<text x="12" y="${y + 9}" font-family="monospace" font-size="10" font-weight="bold" fill="#f8fafc">${esc(line(r, now))}</text>`)
    for (let s = 0; s < 20; s++) {
      const x = 12 + s * 23
      parts.push(`<rect x="${x}" y="${y + 13}" width="20" height="9" fill="${s < lit ? fill : '#374151'}"/>`)
    }
    // A blinking marker on the current segment while the window is in use.
    if (lit > 0 && lit < 20) {
      parts.push(
        `<rect x="${12 + (lit - 1) * 23}" y="${y + 13}" width="20" height="9" fill="#ffffff" opacity="0.35"><animate attributeName="opacity" values="0.35;0;0.35" dur="1.6s" repeatCount="indefinite"/></rect>`,
      )
    }
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">${parts.join('')}</svg>`
}
