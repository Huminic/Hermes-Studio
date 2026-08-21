/**
 * Andromeda-side Semantic Watchdog calculation engine (HUM-VIN-006, Phase 1).
 *
 * Computes ONLY over accepted, non-superseded analytical rows (`listActiveRows`).
 * Contamination guard: a metric is WITHHELD entirely if any required source kind
 * has no active accepted delivery for the period (quarantined/superseded/absent
 * data yields no active rows). Never claims native thread identity, status-
 * transition history, causality, or actual ROI without keys/timestamps/costs.
 * Customer-label grouping is labelled provisional. No autonomous action; no
 * customer message bodies persisted (PII-minimised).
 *
 * Cross-family joins need stable IDs the exports don't carry, so only the SAFE
 * within-kind aggregate subset is computed; unsafe metrics are enumerated in
 * FAST_FOLLOW_MANIFEST with the keys required to make them safe.
 */
import { createHash } from 'node:crypto'
import { listActiveRows, type ActiveRow } from '../ingest/ingest-delivery-store'
import type { ReportKind } from '../ingest/vin-contracts'

export type MetricPeriod = { start: string | null; end: string | null }

export type MetricResult = {
  metric_id: string
  period: MetricPeriod
  profile: string
  dealer: string
  source_kinds: Array<ReportKind>
  value: number | null
  count: number | null
  explanation: string
  evidence: { delivery_ids: Array<string>; aggregate_basis: string; row_refs?: Array<number> }
  derived: boolean
  /** true when grouping relies on customer labels (no native thread identity). */
  provisional: boolean
  limitations: Array<string>
  autonomous_action: false
}

export type WithheldMetric = {
  metric_id: string
  period: MetricPeriod
  profile: string
  status: 'withheld'
  reason: string
  source_kinds: Array<ReportKind>
  limitations: Array<string>
}

export type FastFollowItem = {
  metric_id: string
  reason: string
  requires: Array<string>
}

/** Cross-family / latency / actual-ROI metrics that are UNSAFE without stable IDs. */
export const FAST_FOLLOW_MANIFEST: Array<FastFollowItem> = [
  {
    metric_id: 'cross.lead_to_appointment_to_sale_funnel',
    reason: 'exports carry no stable key linking a lead across ROI, Appointments, and Gross',
    requires: ['lead_id present in Lead Source ROI + Appointments + CRM Sales Gross', 'deal_id linking Appointments→Gross', 'per-row timestamps'],
  },
  {
    metric_id: 'roi.actual_roi',
    reason: 'ROI export has no cost or attributed-revenue columns',
    requires: ['per-source spend/cost', 'attributed revenue per source', 'source keys + timestamps'],
  },
  {
    metric_id: 'comm.response_latency_unanswered',
    reason: 'Sales Communication Log has Activity Date + Direction but no native thread identity or status transitions',
    requires: ['native thread_id', 'inbound/outbound message timestamps at thread grain', 'thread status-transition history'],
  },
  {
    metric_id: 'comm.question_answer_fit',
    reason: 'no threaded pairing of an inbound question to its outbound answer',
    requires: ['thread_id', 'message ordering within a thread', 'inbound/outbound linkage'],
  },
]

const NO_CAUSALITY = 'No causal claim: this is a descriptive aggregate, not an attribution.'
const NO_THREAD = 'No native thread identity or status-transition history in the source.'

// ── row helpers ─────────────────────────────────────────────────────────────

function colIndex(header: Array<string>, name: string): number {
  return header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase())
}
function cell(row: ActiveRow, name: string): string {
  const i = colIndex(row.header, name)
  return i >= 0 ? (row.row[i] ?? '').trim() : ''
}
function num(v: string): number {
  const n = Number(v.replace(/[$,%\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}
const isTrue = (v: string) => /^(true|yes|1|y)$/i.test(v.trim())

type Source = { rows: Array<ActiveRow>; delivery_ids: Array<string>; period: MetricPeriod }

function sourceFor(profile: string, kind: ReportKind, opts: PeriodOpts): Source | null {
  const rows = listActiveRows(profile, {
    report_kind: kind,
    period_start: opts.period_start,
    period_end: opts.period_end,
    profileRoot: opts.profileRoot,
  })
  if (rows.length === 0) return null
  const delivery_ids = [...new Set(rows.map((r) => r.delivery_id))]
  const period: MetricPeriod = { start: rows[0].period_start, end: rows[0].period_end }
  return { rows, delivery_ids, period }
}

type PeriodOpts = { period_start?: string; period_end?: string; profileRoot?: string }

// ── metric builders (one input kind each — the SAFE subset) ─────────────────

function mk(
  profile: string,
  dealer: string,
  kind: ReportKind,
  src: Source,
  m: {
    metric_id: string
    value: number | null
    count: number | null
    explanation: string
    aggregate_basis: string
    derived?: boolean
    provisional?: boolean
    limitations: Array<string>
    row_refs?: Array<number>
  },
): MetricResult {
  return {
    metric_id: m.metric_id,
    period: src.period,
    profile,
    dealer,
    source_kinds: [kind],
    value: m.value,
    count: m.count,
    explanation: m.explanation,
    evidence: { delivery_ids: src.delivery_ids, aggregate_basis: m.aggregate_basis, row_refs: m.row_refs },
    derived: m.derived ?? true,
    provisional: m.provisional ?? false,
    limitations: [...m.limitations, 'No autonomous action taken.'],
    autonomous_action: false,
  }
}

function appointmentMetrics(profile: string, dealer: string, src: Source): Array<MetricResult> {
  const total = src.rows.length
  const rate = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 1000 : null)
  const confirmed = src.rows.filter((r) => isTrue(cell(r, 'Is Confirmed'))).length
  const shown = src.rows.filter((r) => isTrue(cell(r, 'Is Show'))).length
  const noShow = src.rows.filter((r) => isTrue(cell(r, 'Is No Show'))).length
  const cancelled = src.rows.filter((r) => /cancel/i.test(cell(r, 'Appointment Status'))).length
  const rescheduled = src.rows.filter((r) => cell(r, 'Rescheduled Date') !== '').length
  const basis = `${total} accepted appointment rows`
  const lim = ['Rates are point-in-time flag counts (Is Confirmed/Is Show/Is No Show), not a status-transition history.', NO_THREAD, NO_CAUSALITY]
  const each: Array<[string, number, string]> = [
    ['appt.confirmed_rate', confirmed, 'share of appointments flagged Confirmed'],
    ['appt.show_rate', shown, 'share of appointments flagged Show'],
    ['appt.no_show_rate', noShow, 'share of appointments flagged No-Show'],
    ['appt.cancel_rate', cancelled, 'share with a Cancelled status'],
    ['appt.reschedule_rate', rescheduled, 'share with a Rescheduled Date'],
  ]
  return each.map(([id, n, desc]) =>
    mk(profile, dealer, 'appointments', src, {
      metric_id: id, value: rate(n), count: n,
      explanation: `${desc}: ${n} of ${total}.`, aggregate_basis: basis, limitations: lim,
    }),
  )
}

function grossMetrics(profile: string, dealer: string, src: Source): Array<MetricResult> {
  let front = 0, back = 0, totalG = 0, mismatch = 0
  const mismatchRefs: Array<number> = []
  for (const r of src.rows) {
    const f = num(cell(r, 'Front Gross')), b = num(cell(r, 'Back Gross')), t = num(cell(r, 'Total Gross'))
    front += f; back += b; totalG += t
    if (Math.abs(f + b - t) > 0.5) { mismatch++; mismatchRefs.push(r.row_index) }
  }
  const basis = `${src.rows.length} accepted gross rows`
  return [
    mk(profile, dealer, 'crm_sales_gross', src, {
      metric_id: 'gross.reconciliation_mismatches', value: mismatch, count: src.rows.length,
      explanation: `Rows where Front+Back ≠ Total: ${mismatch} of ${src.rows.length}.`,
      aggregate_basis: basis, row_refs: mismatchRefs,
      limitations: ['Reconciliation is within-row arithmetic only.', 'No revenue attribution without deal linkage.', NO_CAUSALITY],
    }),
    mk(profile, dealer, 'crm_sales_gross', src, {
      metric_id: 'gross.total_sum', value: Math.round(totalG * 100) / 100, count: src.rows.length,
      explanation: `Sum of Total Gross across accepted rows: ${totalG}. (Front=${front}, Back=${back}.)`,
      aggregate_basis: basis,
      limitations: ['Dollar sum of the accepted export only; not an attributed or verified financial figure.', NO_CAUSALITY],
    }),
  ]
}

function roiMetrics(profile: string, dealer: string, src: Source): Array<MetricResult> {
  const sum = (name: string) => src.rows.reduce((a, r) => a + num(cell(r, name)), 0)
  const totalLeads = sum('Total_Leads'), good = sum('Good_Leads'), bad = sum('Bad_Leads')
  const dup = sum('Duplicate_Leads'), sold = sum('Sold_from_Leads')
  const basis = `${src.rows.length} accepted lead-source rows`
  const ZERO_COST = 'Zero-cost caveat: the ROI export carries no cost/revenue columns — actual ROI is NOT computable; only volume/funnel counts are reported.'
  return [
    mk(profile, dealer, 'lead_source_roi', src, {
      metric_id: 'roi.total_leads', value: totalLeads, count: src.rows.length,
      explanation: `Total leads across sources: ${totalLeads} (good ${good}, bad ${bad}).`,
      aggregate_basis: basis, limitations: [ZERO_COST, NO_CAUSALITY],
    }),
    mk(profile, dealer, 'lead_source_roi', src, {
      metric_id: 'roi.sold_from_leads', value: sold, count: src.rows.length,
      explanation: `Sold-from-leads across sources: ${sold}.`,
      aggregate_basis: basis, limitations: [ZERO_COST, 'Sold counts are from the export, not reconciled against Gross without keys.', NO_CAUSALITY],
    }),
    mk(profile, dealer, 'lead_source_roi', src, {
      metric_id: 'roi.duplicate_rate', value: totalLeads > 0 ? Math.round((dup / totalLeads) * 1000) / 1000 : null, count: dup,
      explanation: `Duplicate-lead share: ${dup} of ${totalLeads}.`,
      aggregate_basis: basis, limitations: [ZERO_COST, NO_CAUSALITY],
    }),
  ]
}

function cageMetrics(profile: string, dealer: string, src: Source): Array<MetricResult> {
  const reps = new Set(src.rows.map((r) => cell(r, 'User')).filter(Boolean))
  const totalComms = src.rows.reduce((a, r) => a + num(cell(r, 'Total Comms')), 0)
  const deals = src.rows.reduce((a, r) => a + num(cell(r, 'Deals from Leads')), 0)
  const basis = `${src.rows.length} accepted rep rows`
  const lim = ['Single-period baseline; no trend without multiple accepted deliveries.', NO_CAUSALITY]
  return [
    mk(profile, dealer, 'cage_kpi', src, { metric_id: 'cage.rep_count', value: reps.size, count: reps.size, explanation: `Distinct reps in the period: ${reps.size}.`, aggregate_basis: basis, limitations: lim }),
    mk(profile, dealer, 'cage_kpi', src, { metric_id: 'cage.total_comms', value: totalComms, count: src.rows.length, explanation: `Total communications by reps: ${totalComms}.`, aggregate_basis: basis, limitations: lim }),
    mk(profile, dealer, 'cage_kpi', src, { metric_id: 'cage.deals_from_leads', value: deals, count: src.rows.length, explanation: `Deals from leads (rep-reported): ${deals}.`, aggregate_basis: basis, limitations: lim }),
  ]
}

const ESCALATION_RE = /\b(manager|complaint|refund|lawyer|attorney|unacceptable|escalate|supervisor)\b/i

function commMetrics(profile: string, dealer: string, src: Source): Array<MetricResult> {
  const basis = `${src.rows.length} accepted communication rows`
  // template overuse — hash bodies (never persist the body), report counts only.
  const bodyCounts = new Map<string, number>()
  for (const r of src.rows) {
    const body = cell(r, 'Message Content')
    if (!body) continue
    const h = createHash('sha256').update(body).digest('hex').slice(0, 16)
    bodyCounts.set(h, (bodyCounts.get(h) ?? 0) + 1)
  }
  const overusedTemplates = [...bodyCounts.values()].filter((c) => c >= 5).length
  // escalation keyword screen — count + row refs, NO bodies.
  const escRefs = src.rows.filter((r) => ESCALATION_RE.test(cell(r, 'Message Content'))).map((r) => r.row_index)
  // multi-rep within 24h — PROVISIONAL customer-label grouping.
  const byCustomer = new Map<string, Array<{ user: string; t: number }>>()
  for (const r of src.rows) {
    const c = cell(r, 'Customer'); if (!c) continue
    const t = Date.parse(cell(r, 'Activity Date') || '') || 0
    const list = byCustomer.get(c) ?? []; list.push({ user: cell(r, 'User'), t }); byCustomer.set(c, list)
  }
  let multiRep = 0
  for (const list of byCustomer.values()) {
    const sorted = list.filter((x) => x.t).sort((a, b) => a.t - b.t)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].user && sorted[i].user !== sorted[i - 1].user && sorted[i].t - sorted[i - 1].t <= 86_400_000) { multiRep++; break }
    }
  }
  return [
    mk(profile, dealer, 'sales_comm_log', src, {
      metric_id: 'comm.template_overuse', value: overusedTemplates, count: src.rows.length, provisional: true,
      explanation: `Message bodies reused ≥5× (hashed, not stored): ${overusedTemplates} template(s).`,
      aggregate_basis: basis, limitations: ['Body text is hashed and never persisted (PII).', 'Overuse is provisional — no thread identity to confirm intent.', NO_CAUSALITY],
    }),
    mk(profile, dealer, 'sales_comm_log', src, {
      metric_id: 'comm.escalation_keyword_screen', value: escRefs.length, count: src.rows.length, provisional: true, row_refs: escRefs,
      explanation: `Messages containing escalation keywords: ${escRefs.length} (row refs only; bodies not stored).`,
      aggregate_basis: basis, limitations: ['Keyword screen only — not a verified escalation; bodies not persisted (PII).', NO_THREAD, NO_CAUSALITY],
    }),
    mk(profile, dealer, 'sales_comm_log', src, {
      metric_id: 'comm.multi_rep_within_24h', value: multiRep, count: byCustomer.size, provisional: true,
      explanation: `Customers contacted by ≥2 different reps within 24h: ${multiRep} (provisional, customer-label grouped).`,
      aggregate_basis: basis, limitations: ['PROVISIONAL: grouped by customer label, not native thread identity.', NO_THREAD, NO_CAUSALITY],
    }),
  ]
}

function dashboardMetrics(profile: string, dealer: string, src: Source): Array<MetricResult> {
  const markers = src.rows.filter((r) => r.row.length === 1 && r.row[0].trim() !== '').length
  return [
    mk(profile, dealer, 'dealership_performance', src, {
      metric_id: 'dashboard.section_markers', value: markers, count: src.rows.length,
      explanation: `Aggregate dashboard preserved with ${src.rows.length} rows and ~${markers} single-cell section markers.`,
      aggregate_basis: `${src.rows.length} preserved dashboard rows (multi-section)`,
      limitations: ['Aggregate report: section values are preserved as evidence, NOT re-derived here.', 'No stable header/schema to re-compute section metrics safely.', NO_CAUSALITY],
    }),
  ]
}

// ── engine ────────────────────────────────────────────────────────────────

export type WatchdogRun = {
  profile: string
  period: MetricPeriod
  metrics: Array<MetricResult>
  withheld: Array<WithheldMetric>
  fast_follow: Array<FastFollowItem>
}

const BUILDERS: Array<{ kind: ReportKind; ids: Array<string>; build: (p: string, d: string, s: Source) => Array<MetricResult> }> = [
  { kind: 'appointments', ids: ['appt.confirmed_rate', 'appt.show_rate', 'appt.no_show_rate', 'appt.cancel_rate', 'appt.reschedule_rate'], build: appointmentMetrics },
  { kind: 'crm_sales_gross', ids: ['gross.reconciliation_mismatches', 'gross.total_sum'], build: grossMetrics },
  { kind: 'lead_source_roi', ids: ['roi.total_leads', 'roi.sold_from_leads', 'roi.duplicate_rate'], build: roiMetrics },
  { kind: 'cage_kpi', ids: ['cage.rep_count', 'cage.total_comms', 'cage.deals_from_leads'], build: cageMetrics },
  { kind: 'sales_comm_log', ids: ['comm.template_overuse', 'comm.escalation_keyword_screen', 'comm.multi_rep_within_24h'], build: commMetrics },
  { kind: 'dealership_performance', ids: ['dashboard.section_markers'], build: dashboardMetrics },
]

export function runVinWatchdog(
  profile: string,
  opts: PeriodOpts & { dealer?: string } = {},
): WatchdogRun {
  const dealer = opts.dealer ?? profile
  const period: MetricPeriod = { start: opts.period_start ?? null, end: opts.period_end ?? null }
  const metrics: Array<MetricResult> = []
  const withheld: Array<WithheldMetric> = []

  for (const b of BUILDERS) {
    const src = sourceFor(profile, b.kind, opts)
    if (!src) {
      // Contamination guard: no active accepted rows for this kind/period →
      // WITHHOLD every metric that depends on it (quarantined/superseded/absent).
      for (const id of b.ids) {
        withheld.push({
          metric_id: id, period, profile, status: 'withheld', source_kinds: [b.kind],
          reason: `no active accepted ${b.kind} delivery for the period (quarantined, superseded, or absent)`,
          limitations: ['Withheld to avoid computing from contaminated/absent data.'],
        })
      }
      continue
    }
    metrics.push(...b.build(profile, dealer, src))
  }

  // deterministic ordering
  metrics.sort((a, b) => a.metric_id.localeCompare(b.metric_id))
  withheld.sort((a, b) => a.metric_id.localeCompare(b.metric_id))
  return { profile, period, metrics, withheld, fast_follow: FAST_FOLLOW_MANIFEST }
}
