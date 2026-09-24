/**
 * Lead Source report assembly (AC6 / P5 — Serra comms recovery).
 *
 * Per NAMED lead source: leads + cars-sold (lead-attributed cohort) over 24h /
 * 7d / 30d, with an up/down/even delta vs the previous 24h. Pure over
 * `summarizeOpportunities().by_source` outputs (one per window), which are ALREADY
 * sales-only + BAD-dropped + deduped — so "service = 0 rows" is structural. The
 * caller supplies the four window summaries (fetched via vin_query_leads).
 */
import { deltaOf, type Delta } from './text-report'

/** A `summarizeOpportunities().by_source[]` entry. */
export type SourceSummary = {
  lead_source: string
  opportunities: number
  sold: number
}

export type LeadSourceRow = {
  source: string
  leads24h: number
  leads7d: number
  leads30d: number
  sold24h: number
  sold7d: number
  sold30d: number
  /** 24h leads vs the previous 24h. */
  leadsDelta: Delta
  /** 24h cars-sold vs the previous 24h. */
  soldDelta: Delta
}

function index(rows: ReadonlyArray<SourceSummary>): Map<string, SourceSummary> {
  const m = new Map<string, SourceSummary>()
  for (const r of rows) m.set(r.lead_source, r)
  return m
}

/**
 * Build the per-source rows. Sources present in ANY current window appear;
 * missing counts are 0. Rows sort by 30-day volume (then name). Numbers are
 * taken verbatim from the summaries — never invented.
 */
export function buildLeadSourceReport(input: {
  window24h: ReadonlyArray<SourceSummary>
  window7d: ReadonlyArray<SourceSummary>
  window30d: ReadonlyArray<SourceSummary>
  /** Previous 24h (yesterday), for the up/down delta. */
  prev24h: ReadonlyArray<SourceSummary>
}): LeadSourceRow[] {
  const a = index(input.window24h)
  const b = index(input.window7d)
  const c = index(input.window30d)
  const p = index(input.prev24h)

  const sources = new Set<string>([...a.keys(), ...b.keys(), ...c.keys()])
  const rows: LeadSourceRow[] = []
  for (const source of sources) {
    const cur = a.get(source)
    const prev = p.get(source)
    rows.push({
      source,
      leads24h: cur?.opportunities ?? 0,
      leads7d: b.get(source)?.opportunities ?? 0,
      leads30d: c.get(source)?.opportunities ?? 0,
      sold24h: cur?.sold ?? 0,
      sold7d: b.get(source)?.sold ?? 0,
      sold30d: c.get(source)?.sold ?? 0,
      leadsDelta: deltaOf(cur?.opportunities ?? 0, prev?.opportunities ?? 0),
      soldDelta: deltaOf(cur?.sold ?? 0, prev?.sold ?? 0),
    })
  }
  rows.sort((x, y) => y.leads30d - x.leads30d || x.source.localeCompare(y.source))
  return rows
}
