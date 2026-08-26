/**
 * Andromeda-side Semantic Watchdog calculation engine (HUM-VIN-006, Phase 1).
 *
 * Computes ONLY over accepted, non-superseded analytical rows (`listActiveRows`).
 *
 * Missing/late/unsupported-data-never-zero: a required column that is absent or
 * unparseable WITHHOLDS that metric with an exact missing/unparseable-field
 * reason — a numeric zero is NEVER emitted from schema absence. Legitimate source
 * zero values (a present, parseable "0") are preserved as real metric values.
 *
 * Contamination guard: a metric is WITHHELD entirely if its source kind has no
 * active accepted delivery for the period (quarantined/superseded/absent → no
 * active rows). Never claims native thread identity, status-transition history,
 * causality, or actual ROI. Customer-label grouping is labelled provisional.
 * No autonomous action; no customer message bodies persisted (PII-minimised).
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

type Out = MetricResult | WithheldMetric
const isWithheld = (o: Out): o is WithheldMetric => 'status' in o

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
    reason: 'ROI schema includes cost/profit fields, but all configured source costs are zero and attributed-revenue keys are absent',
    requires: ['non-zero configured source costs', 'attributed revenue per source', 'source keys + timestamps'],
  },
  {
    metric_id: 'comm.response_latency_unanswered',
    reason: 'Sales Communication Log has Activity Date + Direction but no native thread identity or status transitions',
    requires: ['native thread_id', 'inbound/outbound message timestamps at thread grain', 'thread status-transition history'],
  },
  {
    metric_id: 'comm.chasing_cadence',
    reason: 'chasing cadence needs ordered per-thread outbound sequences; no native thread identity in the log',
    requires: ['native thread_id', 'ordered message timestamps within a thread'],
  },
  {
    metric_id: 'comm.question_answer_fit',
    reason: 'no threaded pairing of an inbound question to its outbound answer',
    requires: ['thread_id', 'message ordering within a thread', 'inbound/outbound linkage'],
  },
]

const NO_CAUSALITY = 'No causal claim: this is a descriptive aggregate, not an attribution.'
const NO_THREAD = 'No native thread identity or status-transition history in the source.'
const ROI_COST_NOTE =
  'Actual ROI withheld: the ROI schema includes cost/profit fields, but all configured source costs are zero — volume/funnel counts only, not an ROI figure.'

// ── row helpers ─────────────────────────────────────────────────────────────

/** Normalize a header/column name so native spaced VinSolutions headers ("Total
 *  Leads") and underscored variants ("Total_Leads") are recognized as the same
 *  column. Per operator decision (ROI Option A): Codex delivers the ORIGINAL native
 *  spaced XLSX headers unchanged; the consumer aligns to them here rather than asking
 *  the producer to rename native columns. Case-, space-, and underscore-insensitive. */
const normColName = (s: string): string => s.trim().toLowerCase().replace(/[_\s]+/g, ' ')
function colIndex(header: Array<string>, name: string): number {
  const n = normColName(name)
  return header.findIndex((h) => normColName(h) === n)
}
function cell(row: ActiveRow, name: string): string {
  const i = colIndex(row.header, name)
  return i >= 0 ? (row.row[i] ?? '').trim() : ''
}
const isTrue = (v: string) => /^(true|yes|1|y)$/i.test(v.trim())

/** Column names absent from at least one active row's header. */
function missingCols(rows: Array<ActiveRow>, names: Array<string>): Array<string> {
  return names.filter((n) => rows.some((r) => colIndex(r.header, n) < 0))
}

/** Sum a required numeric column. Empty cell = legitimate blank (0 contribution);
 *  a present column is assumed validated. Non-empty non-numeric → unparseableAt. */
function sumCol(rows: Array<ActiveRow>, name: string): { sum: number } | { unparseableAt: number } {
  let sum = 0
  for (const r of rows) {
    const raw = cell(r, name)
    if (raw === '') continue
    const n = Number(raw.replace(/[$,%\s]/g, ''))
    if (!Number.isFinite(n)) return { unparseableAt: r.row_index }
    sum += n
  }
  return { sum }
}

// ── result constructors ─────────────────────────────────────────────────────

type Ctx = { profile: string; dealer: string; kind: ReportKind; src: Source }

function metric(
  ctx: Ctx,
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
    period: ctx.src.period,
    profile: ctx.profile,
    dealer: ctx.dealer,
    source_kinds: [ctx.kind],
    value: m.value,
    count: m.count,
    explanation: m.explanation,
    evidence: { delivery_ids: ctx.src.delivery_ids, aggregate_basis: m.aggregate_basis, row_refs: m.row_refs },
    derived: m.derived ?? true,
    provisional: m.provisional ?? false,
    limitations: [...m.limitations, 'No autonomous action taken.'],
    autonomous_action: false,
  }
}

function withheld(ctx: Ctx, metric_id: string, reason: string, extra: Array<string> = []): WithheldMetric {
  return {
    metric_id,
    period: ctx.src.period,
    profile: ctx.profile,
    status: 'withheld',
    reason,
    source_kinds: [ctx.kind],
    limitations: [...extra, 'Withheld rather than emitting a zero from absent or unparseable data.'],
  }
}

/** Guard a metric on its required columns; returns a WithheldMetric or null. */
function requireColumns(ctx: Ctx, metric_id: string, required: Array<string>): WithheldMetric | null {
  const missing = missingCols(ctx.src.rows, required)
  if (missing.length > 0) return withheld(ctx, metric_id, `required column(s) absent: ${missing.join(', ')}`)
  return null
}

// ── metric builders (one input kind each — the SAFE subset) ─────────────────

function appointmentMetrics(ctx: Ctx): Array<Out> {
  const rows = ctx.src.rows
  const total = rows.length
  const rate = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 1000 : null)
  const basis = `${total} accepted appointment rows`
  const lim = ['Rates are point-in-time flag counts (Is Confirmed/Is Show/Is No Show), not a status-transition history.', NO_THREAD, NO_CAUSALITY]
  const specs: Array<{ id: string; col: string; pred: (v: string) => boolean; desc: string }> = [
    { id: 'appt.confirmed_rate', col: 'Is Confirmed', pred: isTrue, desc: 'flagged Confirmed' },
    { id: 'appt.show_rate', col: 'Is Show', pred: isTrue, desc: 'flagged Show' },
    { id: 'appt.no_show_rate', col: 'Is No Show', pred: isTrue, desc: 'flagged No-Show' },
    { id: 'appt.cancel_rate', col: 'Appointment Status', pred: (v) => /cancel/i.test(v), desc: 'with a Cancelled status' },
    { id: 'appt.reschedule_rate', col: 'Rescheduled Date', pred: (v) => v !== '', desc: 'with a Rescheduled Date' },
  ]
  return specs.map((s) => {
    const gate = requireColumns(ctx, s.id, [s.col])
    if (gate) return gate
    const n = rows.filter((r) => s.pred(cell(r, s.col))).length
    return metric(ctx, { metric_id: s.id, value: rate(n), count: n, explanation: `Share of appointments ${s.desc}: ${n} of ${total}.`, aggregate_basis: basis, limitations: lim })
  })
}

function grossMetrics(ctx: Ctx): Array<Out> {
  const rows = ctx.src.rows
  const cols = ['Front Gross', 'Back Gross', 'Total Gross']
  const basis = `${rows.length} accepted gross rows`
  const out: Array<Out> = []

  const gateRecon = requireColumns(ctx, 'gross.reconciliation_mismatches', cols)
  if (gateRecon) out.push(gateRecon)
  else {
    let mismatch = 0
    const refs: Array<number> = []
    let bad: number | null = null
    for (const r of rows) {
      const raw = [cell(r, 'Front Gross'), cell(r, 'Back Gross'), cell(r, 'Total Gross')]
      const parsed = raw.map((v) => (v === '' ? 0 : Number(v.replace(/[$,%\s]/g, ''))))
      if (parsed.some((n) => !Number.isFinite(n))) { bad = r.row_index; break }
      const [f, b, t] = parsed
      if (Math.abs(f + b - t) > 0.5) { mismatch++; refs.push(r.row_index) }
    }
    if (bad !== null) out.push(withheld(ctx, 'gross.reconciliation_mismatches', `unparseable gross value at row ${bad}`))
    else out.push(metric(ctx, { metric_id: 'gross.reconciliation_mismatches', value: mismatch, count: rows.length, explanation: `Rows where Front+Back ≠ Total: ${mismatch} of ${rows.length}.`, aggregate_basis: basis, row_refs: refs, limitations: ['Reconciliation is within-row arithmetic only.', 'No revenue attribution without deal linkage.', NO_CAUSALITY] }))
  }

  const gateSum = requireColumns(ctx, 'gross.total_sum', cols)
  if (gateSum) out.push(gateSum)
  else {
    const f = sumCol(rows, 'Front Gross'), b = sumCol(rows, 'Back Gross'), t = sumCol(rows, 'Total Gross')
    const un = [f, b, t].find((x) => 'unparseableAt' in x) as { unparseableAt: number } | undefined
    if (un) out.push(withheld(ctx, 'gross.total_sum', `unparseable gross value at row ${un.unparseableAt}`))
    else out.push(metric(ctx, { metric_id: 'gross.total_sum', value: Math.round((t as { sum: number }).sum * 100) / 100, count: rows.length, explanation: `Sum of Total Gross across accepted rows: ${(t as { sum: number }).sum}. (Front=${(f as { sum: number }).sum}, Back=${(b as { sum: number }).sum}.)`, aggregate_basis: basis, limitations: ['Dollar sum of the accepted export only; not an attributed or verified financial figure.', NO_CAUSALITY] }))
  }
  return out
}

function roiMetrics(ctx: Ctx): Array<Out> {
  const rows = ctx.src.rows
  const basis = `${rows.length} accepted lead-source rows`
  const out: Array<Out> = []

  const emitSum = (id: string, cols: Array<string>, valueCol: string, mk: (v: number, sums: Record<string, number>) => { value: number | null; count: number | null; explanation: string; limitations: Array<string> }) => {
    const gate = requireColumns(ctx, id, cols)
    if (gate) { out.push(gate); return }
    const sums: Record<string, number> = {}
    for (const c of cols) {
      const s = sumCol(rows, c)
      if ('unparseableAt' in s) { out.push(withheld(ctx, id, `unparseable value in required column "${c}" at row ${s.unparseableAt}`)); return }
      sums[c] = s.sum
    }
    const m = mk(sums[valueCol], sums)
    out.push(metric(ctx, { metric_id: id, value: m.value, count: m.count, explanation: m.explanation, aggregate_basis: basis, limitations: m.limitations }))
  }

  emitSum('roi.total_leads', ['Total_Leads', 'Good_Leads', 'Bad_Leads'], 'Total_Leads', (_v, s) => ({
    value: s['Total_Leads'], count: rows.length,
    explanation: `Total leads across sources: ${s['Total_Leads']} (good ${s['Good_Leads']}, bad ${s['Bad_Leads']}).`,
    limitations: [ROI_COST_NOTE, NO_CAUSALITY],
  }))
  emitSum('roi.sold_from_leads', ['Sold_from_Leads'], 'Sold_from_Leads', (_v, s) => ({
    value: s['Sold_from_Leads'], count: rows.length,
    explanation: `Sold-from-leads across sources: ${s['Sold_from_Leads']}.`,
    limitations: [ROI_COST_NOTE, 'Sold counts are from the export, not reconciled against Gross without keys.', NO_CAUSALITY],
  }))
  emitSum('roi.duplicate_rate', ['Duplicate_Leads', 'Total_Leads'], 'Duplicate_Leads', (_v, s) => ({
    value: s['Total_Leads'] > 0 ? Math.round((s['Duplicate_Leads'] / s['Total_Leads']) * 1000) / 1000 : null, count: s['Duplicate_Leads'],
    explanation: `Duplicate-lead share: ${s['Duplicate_Leads']} of ${s['Total_Leads']}.`,
    limitations: [ROI_COST_NOTE, NO_CAUSALITY],
  }))

  // Actual ROI is never a number: detect cost/profit fields; when present-and-zero
  // (or absent), keep it withheld/caveated with the delivery-specific reason.
  const header = rows[0]?.header ?? []
  const costCols = header.filter((h) => /(cost|profit|spend|expense|revenue)/i.test(h))
  let reason: string
  if (costCols.length > 0) {
    let anyNonZero = false
    for (const c of costCols) {
      const s = sumCol(rows, c)
      if ('sum' in s && s.sum !== 0) anyNonZero = true
    }
    reason = anyNonZero
      ? `cost/profit fields present with non-zero values (${costCols.join(', ')}), but attributed-revenue keys are absent`
      : `cost/profit fields present in this delivery (${costCols.join(', ')}) but all values are zero`
  } else {
    reason = 'cost/profit fields absent from this delivery (schema audit confirms the ROI schema includes them; observed configured source costs have been zero)'
  }
  out.push(withheld(ctx, 'roi.actual_roi', reason, [ROI_COST_NOTE]))
  return out
}

function cageMetrics(ctx: Ctx): Array<Out> {
  const rows = ctx.src.rows
  const basis = `${rows.length} accepted rep rows`
  const lim = ['Single-period baseline; no trend without multiple accepted deliveries.', NO_CAUSALITY]
  const out: Array<Out> = []

  const gateReps = requireColumns(ctx, 'cage.rep_count', ['User'])
  if (gateReps) out.push(gateReps)
  else {
    const reps = new Set(rows.map((r) => cell(r, 'User')).filter(Boolean))
    out.push(metric(ctx, { metric_id: 'cage.rep_count', value: reps.size, count: reps.size, explanation: `Distinct reps in the period: ${reps.size}.`, aggregate_basis: basis, limitations: lim }))
  }

  const numeric: Array<{ id: string; col: string; label: string }> = [
    { id: 'cage.total_comms', col: 'Total Comms', label: 'Total communications by reps' },
    { id: 'cage.deals_from_leads', col: 'Deals from Leads', label: 'Deals from leads (rep-reported)' },
  ]
  for (const n of numeric) {
    const gate = requireColumns(ctx, n.id, [n.col])
    if (gate) { out.push(gate); continue }
    const s = sumCol(rows, n.col)
    if ('unparseableAt' in s) out.push(withheld(ctx, n.id, `unparseable value in required column "${n.col}" at row ${s.unparseableAt}`))
    else out.push(metric(ctx, { metric_id: n.id, value: s.sum, count: rows.length, explanation: `${n.label}: ${s.sum}.`, aggregate_basis: basis, limitations: lim }))
  }
  return out
}

const ESCALATION_RE = /\b(manager|complaint|refund|lawyer|attorney|unacceptable|escalate|supervisor)\b/i
const HIGH_INTENT_RE = /\b(price|pricing|financ|test drive|trade|available|in stock|appointment|out the door|otd|best price|buy|purchase|today|this weekend)\b/i
const LINK_ONLY_RE = /^https?:\/\/\S+$/i
const isInbound = (v: string) => /^(in|inbound|received|incoming)$/i.test(v.trim())
const isOutbound = (v: string) => /^(out|outbound|sent|outgoing)$/i.test(v.trim())

function commMetrics(ctx: Ctx): Array<Out> {
  const rows = ctx.src.rows
  const basis = `${rows.length} accepted communication rows`
  const out: Array<Out> = []

  // template overuse — hash bodies (never persist the body), report counts only.
  const gTmpl = requireColumns(ctx, 'comm.template_overuse', ['Message Content'])
  if (gTmpl) out.push(gTmpl)
  else {
    const bodyCounts = new Map<string, number>()
    for (const r of rows) {
      const body = cell(r, 'Message Content')
      if (!body) continue
      const h = createHash('sha256').update(body).digest('hex').slice(0, 16)
      bodyCounts.set(h, (bodyCounts.get(h) ?? 0) + 1)
    }
    const overused = [...bodyCounts.values()].filter((c) => c >= 5).length
    out.push(metric(ctx, { metric_id: 'comm.template_overuse', value: overused, count: rows.length, provisional: true, explanation: `Message bodies reused ≥5× (hashed, not stored): ${overused} template(s).`, aggregate_basis: basis, limitations: ['Body text is hashed and never persisted (PII).', 'Overuse is provisional — no thread identity to confirm intent.', NO_CAUSALITY] }))
  }

  // escalation keyword screen — count + row refs, NO bodies.
  const gEsc = requireColumns(ctx, 'comm.escalation_keyword_screen', ['Message Content'])
  if (gEsc) out.push(gEsc)
  else {
    const refs = rows.filter((r) => ESCALATION_RE.test(cell(r, 'Message Content'))).map((r) => r.row_index)
    out.push(metric(ctx, { metric_id: 'comm.escalation_keyword_screen', value: refs.length, count: rows.length, provisional: true, row_refs: refs, explanation: `Messages containing escalation keywords: ${refs.length} (row refs only; bodies not stored).`, aggregate_basis: basis, limitations: ['Keyword screen only — not a verified escalation; bodies not persisted (PII).', NO_THREAD, NO_CAUSALITY] }))
  }

  // NEW: inbound high-intent keyword count — row refs only, no bodies.
  const gIn = requireColumns(ctx, 'comm.inbound_high_intent_keywords', ['Message Content', 'Direction'])
  if (gIn) out.push(gIn)
  else {
    const refs = rows.filter((r) => isInbound(cell(r, 'Direction')) && HIGH_INTENT_RE.test(cell(r, 'Message Content'))).map((r) => r.row_index)
    out.push(metric(ctx, { metric_id: 'comm.inbound_high_intent_keywords', value: refs.length, count: rows.length, provisional: true, row_refs: refs, explanation: `Inbound messages containing high-intent keywords: ${refs.length} (row refs only; bodies not stored).`, aggregate_basis: basis, limitations: ['Keyword screen on inbound messages only; bodies not persisted (PII).', NO_THREAD, NO_CAUSALITY] }))
  }

  // NEW: outbound link-only message count — row refs only, no bodies.
  const gLink = requireColumns(ctx, 'comm.outbound_link_only', ['Message Content', 'Direction'])
  if (gLink) out.push(gLink)
  else {
    const refs = rows.filter((r) => isOutbound(cell(r, 'Direction')) && LINK_ONLY_RE.test(cell(r, 'Message Content'))).map((r) => r.row_index)
    out.push(metric(ctx, { metric_id: 'comm.outbound_link_only', value: refs.length, count: rows.length, provisional: true, row_refs: refs, explanation: `Outbound messages whose body is a bare link: ${refs.length} (row refs only; bodies not stored).`, aggregate_basis: basis, limitations: ['Link-only screen on outbound messages only; bodies not persisted (PII).', NO_THREAD, NO_CAUSALITY] }))
  }

  // multi-rep within 24h — PROVISIONAL customer-label grouping.
  const gMulti = requireColumns(ctx, 'comm.multi_rep_within_24h', ['Customer', 'User', 'Activity Date'])
  if (gMulti) out.push(gMulti)
  else {
    const byCustomer = new Map<string, Array<{ user: string; t: number }>>()
    for (const r of rows) {
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
    out.push(metric(ctx, { metric_id: 'comm.multi_rep_within_24h', value: multiRep, count: byCustomer.size, provisional: true, explanation: `Customers contacted by ≥2 different reps within 24h: ${multiRep} (provisional, customer-label grouped).`, aggregate_basis: basis, limitations: ['PROVISIONAL: grouped by customer label, not native thread identity.', NO_THREAD, NO_CAUSALITY] }))
  }
  return out
}

function dashboardMetrics(ctx: Ctx): Array<Out> {
  const rows = ctx.src.rows
  const markers = rows.filter((r) => r.row.length === 1 && r.row[0].trim() !== '').length
  return [
    metric(ctx, {
      metric_id: 'dashboard.section_markers', value: markers, count: rows.length,
      explanation: `Aggregate dashboard preserved with ${rows.length} rows and ~${markers} single-cell section markers.`,
      aggregate_basis: `${rows.length} preserved dashboard rows (multi-section)`,
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

type PeriodOpts = { period_start?: string; period_end?: string; profileRoot?: string }
type Source = { rows: Array<ActiveRow>; delivery_ids: Array<string>; period: MetricPeriod }

function sourceFor(profile: string, kind: ReportKind, opts: PeriodOpts): Source | null {
  const rows = listActiveRows(profile, { report_kind: kind, period_start: opts.period_start, period_end: opts.period_end, profileRoot: opts.profileRoot })
  if (rows.length === 0) return null
  const delivery_ids = [...new Set(rows.map((r) => r.delivery_id))]
  const period: MetricPeriod = { start: rows[0].period_start, end: rows[0].period_end }
  return { rows, delivery_ids, period }
}

const BUILDERS: Array<{ kind: ReportKind; ids: Array<string>; build: (ctx: Ctx) => Array<Out> }> = [
  { kind: 'appointments', ids: ['appt.confirmed_rate', 'appt.show_rate', 'appt.no_show_rate', 'appt.cancel_rate', 'appt.reschedule_rate'], build: appointmentMetrics },
  { kind: 'crm_sales_gross', ids: ['gross.reconciliation_mismatches', 'gross.total_sum'], build: grossMetrics },
  { kind: 'lead_source_roi', ids: ['roi.total_leads', 'roi.sold_from_leads', 'roi.duplicate_rate', 'roi.actual_roi'], build: roiMetrics },
  { kind: 'cage_kpi', ids: ['cage.rep_count', 'cage.total_comms', 'cage.deals_from_leads'], build: cageMetrics },
  { kind: 'sales_comm_log', ids: ['comm.template_overuse', 'comm.escalation_keyword_screen', 'comm.inbound_high_intent_keywords', 'comm.outbound_link_only', 'comm.multi_rep_within_24h'], build: commMetrics },
  { kind: 'dealership_performance', ids: ['dashboard.section_markers'], build: dashboardMetrics },
]

export function runVinWatchdog(profile: string, opts: PeriodOpts & { dealer?: string } = {}): WatchdogRun {
  const dealer = opts.dealer ?? profile
  const period: MetricPeriod = { start: opts.period_start ?? null, end: opts.period_end ?? null }
  const metrics: Array<MetricResult> = []
  const withheldList: Array<WithheldMetric> = []

  for (const b of BUILDERS) {
    const src = sourceFor(profile, b.kind, opts)
    if (!src) {
      // Contamination guard: no active accepted rows for this kind/period →
      // WITHHOLD every metric that depends on it (quarantined/superseded/absent).
      for (const id of b.ids) {
        withheldList.push({
          metric_id: id, period, profile, status: 'withheld', source_kinds: [b.kind],
          reason: `no active accepted ${b.kind} delivery for the period (quarantined, superseded, or absent)`,
          limitations: ['Withheld to avoid computing from contaminated or absent data.'],
        })
      }
      continue
    }
    for (const o of b.build({ profile, dealer, kind: b.kind, src })) {
      if (isWithheld(o)) withheldList.push(o)
      else metrics.push(o)
    }
  }

  metrics.sort((a, b) => a.metric_id.localeCompare(b.metric_id))
  withheldList.sort((a, b) => a.metric_id.localeCompare(b.metric_id))
  return { profile, period, metrics, withheld: withheldList, fast_follow: FAST_FOLLOW_MANIFEST }
}
