/**
 * Custom-report audit engine: compare a dealer's current metric values against
 * industry best-practice benchmarks and produce a categorized audit in the report's
 * tentative voice. Benchmarks are encoded from the cited reference
 * (docs/watchdog-platform/BEST_PRACTICES_AUDIT_REFERENCE.md).
 *
 * Honesty rules (match the reference's epistemics):
 *  - Only metrics with a SOURCED numeric benchmark get a below/within/above verdict.
 *  - Metrics with no external benchmark (counts, gross, detection features) are
 *    reported as "compare to your own trend", never scored against an invented number.
 *  - A metric with no current value is "no data — connect the source", never a
 *    fabricated zero.
 *  - Estimated/contested benchmarks are flagged as such.
 * Pure — no I/O.
 */
import { METRIC_CATALOG, getCatalogMetric, type CatalogMetric } from '../watchdog/metric-catalog'

export type Benchmark = {
  slug: string
  /** 'above' = higher is better; 'below' = lower is better. */
  good: 'above' | 'below'
  /** Target floor for good='above' (0–1 for percents). */
  target_low?: number
  /** Target ceiling for good='below'. */
  target_high?: number
  note: string
  source?: string
  /** true when the benchmark is derived/contested rather than cleanly sourced. */
  estimate?: boolean
}

/** Sourced numeric benchmarks only. Absent slugs → "no external benchmark". */
export const BENCHMARKS: Record<string, Benchmark> = {
  'appt.show_rate': { slug: 'appt.show_rate', good: 'above', target_low: 0.5, note: 'Sales appointment show rate — ~50–65% typical, 70%+ excellent.', source: 'Foureyes / industry-cited ranges' },
  'appt.no_show_rate': { slug: 'appt.no_show_rate', good: 'below', target_high: 0.35, note: 'Derived from the published show-rate range — no clean sales-specific public benchmark.', estimate: true },
  'roi.duplicate_rate': { slug: 'roi.duplicate_rate', good: 'below', target_high: 0.4, note: '~30–40% is a plausible planning range; depends on how aggressively the CRM de-dupes.', estimate: true },
}

export type AuditStatus = 'below_target' | 'within_target' | 'above_target' | 'no_benchmark' | 'no_data'

export type AuditFinding = {
  slug: string
  label: string
  category: string
  value: number | null
  /** value formatted for display, or '—'. */
  display: string
  status: AuditStatus
  /** human target string ("≥ 50%") or null. */
  target: string | null
  note: string
  estimate?: boolean
  /** tentative, read-aloud phrasing. */
  phrasing: string
}

export type AuditReport = {
  /** Count of metrics that had a current value. */
  covered: number
  total: number
  categories: Array<{ category: string; findings: Array<AuditFinding> }>
}

function fmt(v: number, format: CatalogMetric['format']): string {
  if (format === 'percent') return `${Math.round(v * 1000) / 10}%`
  if (format === 'currency') return `$${Math.round(v).toLocaleString('en-US')}`
  return `${Math.round(v * 100) / 100}`
}

export function auditMetric(slug: string, value: number | null): AuditFinding {
  const m = getCatalogMetric(slug)
  const label = m?.label ?? slug
  const category = m?.category ?? 'Other'
  const format = m?.format ?? 'count'
  const display = value == null ? '—' : fmt(value, format)
  const b = BENCHMARKS[slug]

  if (value == null) {
    return { slug, label, category, value, display, status: 'no_data', target: null, note: b?.note ?? 'No external benchmark.', phrasing: `No data yet for ${label} — connect the source to include it in the audit.` }
  }
  if (!b) {
    return { slug, label, category, value, display, status: 'no_benchmark', target: null, note: 'No neutral external benchmark; best judged against this dealer’s own trend and brand cohort.', phrasing: `${label} sits at ${display}. There’s no fixed industry benchmark for it — worth watching against your own recent trend rather than a single number.` }
  }

  const targetStr = b.good === 'above' ? `≥ ${fmt(b.target_low as number, format)}` : `≤ ${fmt(b.target_high as number, format)}`
  const estNote = b.estimate ? ' (estimated benchmark — treat as directional)' : ''
  let status: AuditStatus
  let phrasing: string
  if (b.good === 'above') {
    status = value < (b.target_low as number) ? 'below_target' : 'within_target'
    phrasing = status === 'below_target'
      ? `${label} appears below the ${targetStr} target (now ${display}) — worth a look${estNote}.`
      : `${label} appears at or above the ${targetStr} target (${display}) — holding well${estNote}.`
  } else {
    status = value > (b.target_high as number) ? 'above_target' : 'within_target'
    phrasing = status === 'above_target'
      ? `${label} appears above the ${targetStr} guide (now ${display}) — worth a look${estNote}.`
      : `${label} appears within the ${targetStr} guide (${display}) — holding well${estNote}.`
  }
  return { slug, label, category, value, display, status, target: targetStr, note: b.note, ...(b.estimate ? { estimate: true } : {}), phrasing }
}

/** Audit every catalog metric against the values provided, grouped by category. */
export function auditMetrics(values: Map<string, number | null>): AuditReport {
  const findings = METRIC_CATALOG.map((m) => auditMetric(m.id, values.has(m.id) ? values.get(m.id)! : null))
  const covered = findings.filter((f) => f.value != null).length
  const categories: Array<{ category: string; findings: Array<AuditFinding> }> = []
  for (const f of findings) {
    let g = categories.find((c) => c.category === f.category)
    if (!g) { g = { category: f.category, findings: [] }; categories.push(g) }
    g.findings.push(f)
  }
  return { covered, total: findings.length, categories }
}
