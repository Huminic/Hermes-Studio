/**
 * "Competitor" report.
 *
 * Compares this store against area competitors on listed-vehicle count, pricing,
 * running specials/ads, and lead-source presence (the marketplaces where each
 * competes — AutoTrader / Cargurus / Cars.com, etc.).
 *
 * DATA SOURCE (pending wiring): the live gathering of competitor listings /
 * pricing / ads is intended to run through the operator's background FEDERATED
 * SEARCH service. This module is source-agnostic: it accepts already-gathered
 * `CompetitorInput[]` (from the federated search when wired, or provided in the
 * request body) and produces the structured comparison + HTML. With no data it
 * returns an honest "connect the federated search" state — it NEVER fabricates
 * competitor pricing or ad claims. Generic per-profile.
 */

export type CompetitorInput = {
  name: string
  url?: string
  distance_miles?: number | null
  listed_vehicles?: number | null
  avg_price?: number | null
  specials?: Array<string>
  /** Marketplaces / lead sources where this competitor has a presence. */
  lead_presence?: Array<string>
  notes?: string
}

export type CompetitorSelf = {
  name: string
  listed_vehicles?: number | null
  avg_price?: number | null
  specials?: Array<string>
  lead_presence?: Array<string>
}

export type CompetitorReport =
  | {
      profile: string
      generated_at: number
      available: true
      us: CompetitorSelf
      competitors: Array<CompetitorInput>
      observations: Array<string>
      data_source: string
    }
  | { profile: string; generated_at: number; available: false; reason: string }

/**
 * Build the structured competitor comparison from already-gathered data.
 * `competitors` empty → honest unconfigured state (no fabrication).
 */
export function buildCompetitorReport(
  profile: string,
  opts: {
    now?: number
    us?: CompetitorSelf
    competitors?: Array<CompetitorInput>
    dataSource?: string
  } = {},
): CompetitorReport {
  const now = opts.now ?? Date.now()
  const competitors = (opts.competitors ?? []).filter((c) => c && c.name)
  if (competitors.length === 0) {
    return {
      profile,
      generated_at: now,
      available: false,
      reason:
        'No competitor data available yet. Connect the federated-search source (or supply competitors in the request) — competitor pricing and ads are never fabricated.',
    }
  }
  const us: CompetitorSelf = opts.us ?? { name: profile }

  // Observations — only from present, comparable numbers (no invention).
  const observations: Array<string> = []
  const priced = competitors.filter((c) => typeof c.avg_price === 'number') as Array<
    CompetitorInput & { avg_price: number }
  >
  if (typeof us.avg_price === 'number' && priced.length) {
    const avgComp = priced.reduce((t, c) => t + c.avg_price, 0) / priced.length
    const diff = Math.round(((us.avg_price - avgComp) / avgComp) * 1000) / 10
    observations.push(
      `Our average listed price ($${Math.round(us.avg_price).toLocaleString('en-US')}) is ${diff >= 0 ? diff : Math.abs(diff)}% ${diff >= 0 ? 'above' : 'below'} the competitor average ($${Math.round(avgComp).toLocaleString('en-US')}) — worth verifying against comparable trims.`,
    )
  }
  const inv = competitors.filter((c) => typeof c.listed_vehicles === 'number') as Array<
    CompetitorInput & { listed_vehicles: number }
  >
  if (typeof us.listed_vehicles === 'number' && inv.length) {
    const maxComp = Math.max(...inv.map((c) => c.listed_vehicles))
    if (us.listed_vehicles < maxComp) {
      observations.push(
        `A competitor lists ${maxComp} vehicles vs our ${us.listed_vehicles} — inventory depth gap worth reviewing.`,
      )
    }
  }
  const ourPresence = new Set((us.lead_presence ?? []).map((s) => s.toLowerCase()))
  const missing = new Set<string>()
  for (const c of competitors) {
    for (const src of c.lead_presence ?? []) {
      if (!ourPresence.has(src.toLowerCase())) missing.add(src)
    }
  }
  if (missing.size) {
    observations.push(
      `Competitors appear on marketplaces we do not: ${[...missing].join(', ')} — potential lead-source gaps to evaluate.`,
    )
  }

  return {
    profile,
    generated_at: now,
    available: true,
    us,
    competitors,
    observations,
    data_source: opts.dataSource ?? 'provided',
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
const n = (v: number | null | undefined) => (v == null ? '—' : String(v))
const money = (v: number | null | undefined) =>
  v == null ? '—' : `$${Math.round(v).toLocaleString('en-US')}`
const list = (a: Array<string> | undefined) => (a && a.length ? a.map(esc).join(', ') : '—')

export function renderCompetitorReportHtml(report: CompetitorReport): string {
  const head = (body: string) => `<!doctype html><html><head><meta charset="utf-8">
<title>Competitor Report — ${esc(report.profile)}</title>
<style>
 body{font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;max-width:960px;margin:2rem auto;padding:0 1rem}
 h1{font-size:22px;margin:0 0 .25rem}.sub{color:#64748b;margin:0 0 1.25rem}
 table{width:100%;border-collapse:collapse;font-size:13px}
 th,td{text-align:left;padding:.45rem .5rem;border-bottom:1px solid #e2e8f0;vertical-align:top}
 th{color:#475569;font-weight:600}
 tr.us{background:#f0f9ff;font-weight:600}
 .op{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:.6rem 1rem;margin:.4rem 0}
 .foot{color:#94a3b8;font-size:12px;margin-top:2rem}
</style></head><body>${body}
<p class="foot">Observations, not conclusions — verify against your own records. Competitor figures are gathered externally and may be stale or approximate.</p></body></html>`

  if (!report.available) {
    return head(
      `<h1>Competitor Report — ${esc(report.profile)}</h1><p class="sub">${esc(report.reason)}</p>`,
    )
  }
  const row = (name: string, c: Partial<CompetitorInput>, isUs: boolean) =>
    `<tr class="${isUs ? 'us' : ''}"><td>${esc(name)}${isUs ? ' (us)' : ''}</td><td>${n(c.listed_vehicles)}</td><td>${money(c.avg_price)}</td><td>${list(c.specials)}</td><td>${list(c.lead_presence)}</td></tr>`
  const rows = [
    row(report.us.name, report.us, true),
    ...report.competitors.map((c) => row(c.name, c, false)),
  ].join('')
  const ops = report.observations.length
    ? report.observations.map((o) => `<div class="op">${esc(o)}</div>`).join('')
    : '<p class="sub">No comparable numeric gaps detected from the provided data.</p>'
  return head(`
  <h1>Competitor Report — ${esc(report.profile)}</h1>
  <p class="sub">Us vs ${report.competitors.length} area competitor(s) · data source: ${esc(report.data_source)}</p>
  <table><thead><tr><th>Dealer</th><th>Listed vehicles</th><th>Avg price</th><th>Specials</th><th>Lead presence</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <h2 style="font-size:16px;margin:1.5rem 0 .5rem">Observations</h2>
  ${ops}`)
}
