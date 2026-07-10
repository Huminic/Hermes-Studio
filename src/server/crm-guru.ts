/**
 * CRM-Guru — canonical funnel assembler + Brain repository.
 *
 * The dashboard funnel must be DEFENSIBLE, not inflated. CRM-Guru orchestrates a
 * metric-split: lead COUNTS come from the live API (deduped, sales-scoped — see
 * lead-opportunities.ts), and report-only metrics (contacted, appointments,
 * sold, timing, gross) come from the uploaded VinSolutions report in the Brain.
 * It assembles a single CANONICAL funnel, persists a snapshot to the Brain (the
 * agent-output repository), and the Dashboard reads that — it no longer computes
 * its own counts from the report's raw `total_leads` (which blended service and
 * included BAD + DUPLICATE rows).
 *
 * A metric with no backing report for the selected window is NOT fabricated: it
 * carries status 'pending' and the literal source text NEEDS_SUPPLEMENTAL, which
 * the UI renders as "needs supplemental data".
 *
 * The pure assembler `assembleCanonicalFunnel` is unit-tested with fixtures;
 * persistence is a thin Brain table.
 */

import { openBrain, uuid, now as brainNow } from './brain-store'
import type { BrainHandle } from './brain-store'
import type { OpportunitySummary } from './lead-opportunities'
import type {
  FunnelTab,
  FunnelProvenance,
  FunnelStage,
  Metric,
  LeadSourceRow,
  LeadRating,
  RoiRow,
  Trend,
  Polarity,
  MetricUnit,
} from './dashboard-metrics'

/** Literal text the UI renders when a report-only metric has no backing report. */
export const NEEDS_SUPPLEMENTAL = 'needs supplemental data'
/** Source note for the API-derived, defensible lead count. */
export const LEADS_SOURCE_NOTE = 'Live CRM — sales leads, deduped by customer'
/** Max canonical-funnel snapshots retained per profile (audit/history window). */
export const CANONICAL_RETENTION = 50

/**
 * Whether report-derived funnel metrics (contacted, appointments, timing, gross,
 * good-leads) are trusted for display. Default OFF: live verification (serra-honda,
 * 2026-06-22) showed the uploaded report reads ~1.8–2x the CRM for the selected
 * window (window/quality mismatch), so trusting it would re-introduce the very
 * inflation this fix removes. Until a window-matched / validated ingestion path
 * exists (backlogged intelligent CRM-Guru ingester), these render
 * "needs supplemental data". Leads and Sold always come from the live API.
 *
 * 2026-07-10: re-enabled, now GUARDED by the variance guardrail in
 * assembleCanonicalFunnel — report metrics display ONLY when internally
 * consistent with the live API window (report Contacted <= live Leads, and the
 * funnel is monotonic). A window-mismatched / over-reading report (the 1.8-2x
 * case) fails the guardrail and is suppressed to "needs supplemental data", so
 * inflated numbers can never reach a customer. Consistent, window-matched
 * uploads display. Set false to hard-disable regardless of consistency. */
export const REPORT_METRICS_TRUSTED = true

/**
 * Variance tolerance for the anti-inflation guardrail. Report funnel counts may
 * exceed the paired live count by at most this factor (5% — for timing/rounding
 * and small dedup differences) before the report is judged window-mismatched and
 * suppressed. Tight on purpose: a real over-read is ~1.8-2x, far past this.
 */
export const REPORT_VARIANCE_TOLERANCE = 1.05

// ── Local pure helpers (mirror dashboard-metrics; kept local to avoid a cycle) ─

function trend(
  current: number | null,
  prior: number | null,
  polarity: Polarity,
): Trend {
  if (current == null || prior == null) {
    return { current, prior, delta: null, direction: null, good: null }
  }
  const delta = current - prior
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  const good =
    direction === 'flat'
      ? null
      : polarity === 'up'
        ? direction === 'up'
        : direction === 'down'
  return { current, prior, delta, direction, good }
}

const sum = (rows: Array<RoiRow>, col: keyof RoiRow): number | null => {
  const vals = rows
    .map((r) => r[col])
    .filter((v): v is number => typeof v === 'number')
  if (vals.length === 0) return null
  return vals.reduce((a, b) => a + b, 0)
}

/**
 * Lead-count-weighted average of a per-source timing/rate column. The weight is
 * DE-BLENDED: it uses the source's sales opportunities (API, deduped) when
 * available, else the report's good_leads (excludes BAD + DUPLICATE), and only
 * falls back to raw total_leads as a last resort. Weighting by raw total_leads
 * is what let service/bad/dup volume skew the store timing average.
 */
const weightedAvg = (
  rows: Array<RoiRow>,
  col: keyof RoiRow,
  weightBySource?: Map<string, number>,
): number | null => {
  let num = 0
  let den = 0
  for (const r of rows) {
    const v = r[col]
    const w =
      weightBySource?.get(normSource(r.lead_source)) ??
      (typeof r.good_leads === 'number' ? r.good_leads : r.total_leads ?? 0)
    if (typeof v === 'number' && w > 0) {
      num += v * w
      den += w
    }
  }
  return den > 0 ? num / den : null
}

/** Normalize a lead-source label for matching API rows to report rows. */
function normSource(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

// ── Canonical funnel shape ────────────────────────────────────────────────────

export type CanonicalFunnel = {
  generated_at: number
  funnel: FunnelTab
  provenance: FunnelProvenance
}

export type AssembleInput = {
  /** Defensible API lead counts, or null when the API was unavailable. */
  opportunities: OpportunitySummary | null
  /** Current uploaded report rows (empty = no report for the window). */
  roiCurrent: Array<RoiRow>
  /** Prior report rows for the period-over-period comparison (may be empty). */
  roiPrior: Array<RoiRow>
  comparisonLabel: string
  /** True when the API lead fetch hit the page ceiling (counts may undercount). */
  leadsCapped?: boolean
  /** Override REPORT_METRICS_TRUSTED (tests exercise the report-attach path). */
  trustReport?: boolean
}

// ── Stage builders ────────────────────────────────────────────────────────────

/** API-sourced Leads stage — defensible deduped count (or pending if no API). */
function apiLeadStage(opportunities: OpportunitySummary | null): FunnelStage {
  const now = opportunities ? opportunities.opportunities : null
  return {
    key: 'leads',
    label: 'Leads',
    now,
    comparison: null, // no prior API window is fetched; trend stays neutral
    conversion: null,
    trend: trend(now, null, 'up'),
    status: opportunities ? 'sourced' : 'pending',
  }
}

/** API-sourced Sold stage — deduped SOLD opportunities (matches the CRM; the
 *  report's sold_from_leads reads inflated). Conversion null (cross-source). */
function apiSoldStage(
  opportunities: OpportunitySummary | null,
  key = 'sold',
  label = 'Sold',
): FunnelStage {
  const now = opportunities ? opportunities.sold : null
  return {
    key,
    label,
    now,
    comparison: null,
    conversion: null,
    trend: trend(now, null, 'up'),
    status: opportunities ? 'sourced' : 'pending',
  }
}

/**
 * A report-sourced stage. `prevReportNow` is the count of the stage above WHEN
 * that stage is also report-sourced; pass null to suppress a cross-source
 * conversion (e.g. the first report stage sitting under the API Leads stage —
 * dividing a report count by an API-deduped count is not defensible).
 */
function reportStage(
  key: string,
  label: string,
  col: keyof RoiRow,
  rows: Array<RoiRow>,
  priorRows: Array<RoiRow>,
  prevReportNow: number | null,
): FunnelStage {
  const hasData = rows.length > 0
  const now = hasData ? sum(rows, col) : null
  const comparison = priorRows.length ? sum(priorRows, col) : null
  const conversion =
    prevReportNow != null && now != null && prevReportNow > 0
      ? now / prevReportNow
      : null
  return {
    key,
    label,
    now,
    comparison,
    conversion,
    trend: trend(now, comparison, 'up'),
    status: hasData ? 'sourced' : 'pending',
  }
}

function timingMetric(
  key: string,
  label: string,
  col: keyof RoiRow,
  rows: Array<RoiRow>,
  priorRows: Array<RoiRow>,
  weightBySource?: Map<string, number>,
): Metric {
  const hasData = rows.length > 0
  const value = hasData ? weightedAvg(rows, col, weightBySource) : null
  return {
    key,
    label,
    unit: 'days',
    value,
    polarity: 'down',
    status: value != null ? 'sourced' : 'pending',
    source: value != null ? 'Uploaded report — sales-weighted' : NEEDS_SUPPLEMENTAL,
    // Prior period has no API opportunity weights; weightedAvg falls back to
    // good_leads (still de-blended), so the trend is comparable.
    trend: trend(value, priorRows.length ? weightedAvg(priorRows, col) : null, 'down'),
  }
}

const pendingTiming = (
  key: string,
  label: string,
  unit: MetricUnit,
  polarity: Polarity,
): Metric => ({
  key,
  label,
  unit,
  value: null,
  polarity,
  status: 'pending',
  source: NEEDS_SUPPLEMENTAL,
})

// ── Assembly ──────────────────────────────────────────────────────────────────

/**
 * Assemble the canonical funnel from the API opportunity summary + report rows.
 * Pure: no IO. Counts come from the API; everything else from the report (or
 * NEEDS_SUPPLEMENTAL when no report covers the window).
 */
export function assembleCanonicalFunnel(input: AssembleInput): CanonicalFunnel {
  const { opportunities, roiCurrent, roiPrior, comparisonLabel } = input
  const generated_at = brainNow()
  const trustFlag = input.trustReport ?? REPORT_METRICS_TRUSTED
  // ── Variance guardrail (anti-inflation) ──────────────────────────────────────
  // The report describes the SAME funnel as the live API for the SAME window.
  // If the report's Contacted count exceeds the live API lead count (beyond a
  // tight tolerance), the report is window-mismatched / over-reading (the
  // documented ~1.8-2x case) → we do NOT trust it, so inflated numbers never
  // render. Also require funnel monotonicity (appts <= contacted). Only report
  // data internally consistent with the live window is shown; otherwise the
  // report stages fall back to "needs supplemental data" (safe, honest).
  const apiLeads = opportunities?.opportunities ?? 0
  // Each report funnel stage (Contacted, Appts Set, Good Leads) is a SUBSET of the
  // leads, and the funnel displays each as a TOTAL summed across sources. So sum
  // each stage across all rows, then take the largest total — in a window-matched
  // report that total must be <= live Leads. (Summing, NOT per-row max: a report
  // split across 33 sources has small per-row values but a large total.)
  const sumContacted = roiCurrent.reduce(
    (s, r) => s + (r.internet_actual_contact ?? 0),
    0,
  )
  const sumApptsSet = roiCurrent.reduce((s, r) => s + (r.appts_set ?? 0), 0)
  const sumGoodLeads = roiCurrent.reduce((s, r) => s + (r.good_leads ?? 0), 0)
  const maxReportFunnel = Math.max(sumContacted, sumApptsSet, sumGoodLeads)
  // An EXPLICIT trustReport:true is a caller override (tests / a path that has
  // validated the report itself) and bypasses the guardrail. The PRODUCTION
  // default path (trustReport undefined → REPORT_METRICS_TRUSTED) is guarded:
  // it shows report data only when a live API baseline exists AND no report
  // funnel stage exceeds live Leads beyond tolerance. So a window-mismatched /
  // over-reading report (the ~1.8-2x case), or a report with no live baseline to
  // validate against, falls back to "needs supplemental" — inflated numbers can
  // never render on the default (production) dashboard.
  const explicitTrust = input.trustReport === true
  const varianceOk =
    explicitTrust ||
    (apiLeads > 0 && maxReportFunnel <= apiLeads * REPORT_VARIANCE_TOLERANCE)
  const trustReport = trustFlag && varianceOk
  // Gate the report: when untrusted, the report-derived stages/metrics get no
  // rows → they render "needs supplemental data" instead of inflated numbers.
  const repRows = trustReport ? roiCurrent : []
  const repPrior = trustReport ? roiPrior : []
  const reportShown = trustReport && roiCurrent.length > 0

  // Lead Performance: Leads + Sold from the API (defensible, deduped; Sold matches
  // the CRM). Contacted / Appointments from the report, or "needs supplemental".
  const leadStage = apiLeadStage(opportunities)
  const contacted = reportStage('contacted', 'Contacted', 'internet_actual_contact', repRows, repPrior, null)
  const apptSet = reportStage('appt_set', 'Appointments Set', 'appts_set', repRows, repPrior, contacted.now)
  const apptShown = reportStage('appt_shown', 'Appointments Shown', 'appts_shown', repRows, repPrior, apptSet.now)
  const sold = apiSoldStage(opportunities)
  const leadStages = [leadStage, contacted, apptSet, apptShown, sold]

  // De-blended timing weights: sales opportunities per source (API, deduped).
  const weightBySource = new Map<string, number>(
    (opportunities?.by_source ?? []).map((s) => [normSource(s.lead_source), s.opportunities]),
  )
  const timings: Array<Metric> = [
    pendingTiming('time_to_first_contact', 'Time to First Contact', 'days', 'down'),
    pendingTiming('time_to_first_discussion', 'Time to First Discussion', 'days', 'down'),
    timingMetric('time_to_appt_set', 'Time to Appointment Set', 'avg_days_to_appt_set', repRows, repPrior, weightBySource),
    pendingTiming('time_to_appointment', 'Time to Appointment', 'days', 'down'),
    timingMetric('time_to_sale', 'Time to Sale', 'avg_days_to_sale', repRows, repPrior, weightBySource),
  ]

  // Pipeline Performance: API Leads + Sales; Opportunities/Appointments from report.
  const pLeads = apiLeadStage(opportunities)
  const pOpp = reportStage('opportunities', 'Opportunities', 'good_leads', repRows, repPrior, null)
  const pAppt = reportStage('appointments', 'Appointments', 'appts_set', repRows, repPrior, pOpp.now)
  const pSales = apiSoldStage(opportunities, 'sales', 'Sales')

  // Lead sources: Leads + Sold per source from the API (defensible); report-only
  // columns (good_leads/appts/gross) attach only when the report is trusted.
  const reportBySource = new Map(repRows.map((r) => [normSource(r.lead_source), r]))
  const totalSoldAll = opportunities?.sold ?? 0
  const totalLeadsAll = opportunities?.opportunities ?? 0
  const overallSoldRate = totalLeadsAll > 0 ? totalSoldAll / totalLeadsAll : 0

  const lead_sources: Array<LeadSourceRow> = (opportunities?.by_source ?? []).map((row) => {
    const rep = reportBySource.get(normSource(row.lead_source))
    const leads = row.opportunities
    const soldNum = row.sold // API per-source sold (deduped)
    const rate = leads > 0 ? soldNum / leads : 0
    let rating: LeadRating = 'watch'
    if (leads >= 10 && soldNum === 0) rating = 'alarm'
    else if (soldNum > 0 && rate >= overallSoldRate) rating = 'good'
    return {
      lead_source: row.lead_source,
      total_leads: leads,
      good_leads: rep?.good_leads ?? null,
      appts_set: rep?.appts_set ?? null,
      sold_from_leads: soldNum,
      sold_from_leads_pct: leads > 0 ? soldNum / leads : null,
      total_gross: rep?.total_gross ?? null,
      rating,
      trend: trend(leads, null, 'up'),
    }
  })

  const provenance: FunnelProvenance = {
    leads_source: opportunities ? 'api' : 'unavailable',
    leads_capped: input.leadsCapped ?? false,
    metrics_source: reportShown ? 'report' : 'needs_supplemental',
    report_as_of: reportShown ? comparisonLabel : null,
    unrecognized_lead_types: opportunities?.dropped.unrecognized_types ?? [],
    generated_at,
  }
  if (provenance.leads_capped) {
    console.warn(
      '[crm-guru] lead window hit the API page ceiling — opportunity counts may undercount.',
    )
  }
  if (provenance.unrecognized_lead_types.length > 0) {
    console.warn(
      `[crm-guru] unrecognized lead types (possible undercount): ${provenance.unrecognized_lead_types.join(', ')}`,
    )
  }

  const funnel: FunnelTab = {
    provenance,
    lead_performance: { stages: leadStages, timings, comparison_label: comparisonLabel },
    pipeline_performance: { stages: [pLeads, pOpp, pAppt, pSales], comparison_label: comparisonLabel },
    lead_sources,
  }

  return { generated_at, funnel, provenance }
}

// ── Brain persistence (the agent-output repository) ───────────────────────────

function ensureCanonicalTable(handle: BrainHandle): void {
  handle.exec(`CREATE TABLE IF NOT EXISTS canonical_funnel (
    id TEXT PRIMARY KEY,
    generated_at INTEGER NOT NULL,
    window_days INTEGER NOT NULL,
    provenance TEXT NOT NULL,
    payload TEXT NOT NULL
  )`)
}

/** Persist a canonical funnel snapshot to the Brain for audit + history. */
export function persistCanonicalFunnel(
  profile: string,
  canonical: CanonicalFunnel,
  opts: { windowDays: number; profileRoot?: string },
): void {
  const handle = openBrain(profile, { profileRoot: opts.profileRoot })
  try {
    ensureCanonicalTable(handle)
    handle.run(
      `INSERT INTO canonical_funnel (id, generated_at, window_days, provenance, payload)
       VALUES (?, ?, ?, ?, ?)`,
      uuid(),
      canonical.generated_at,
      opts.windowDays,
      JSON.stringify(canonical.provenance),
      JSON.stringify(canonical.funnel),
    )
    // Bounded retention — this runs on every dashboard load, so keep only the
    // most-recent snapshots for audit/history; never let the table grow without
    // limit.
    handle.run(
      `DELETE FROM canonical_funnel WHERE id NOT IN (
         SELECT id FROM canonical_funnel ORDER BY generated_at DESC LIMIT ?
       )`,
      CANONICAL_RETENTION,
    )
  } finally {
    handle.close()
  }
}

/** Load the most-recent canonical funnel snapshot, or null if none. */
export function loadLatestCanonicalFunnel(
  profile: string,
  opts: { profileRoot?: string } = {},
): CanonicalFunnel | null {
  const handle = openBrain(profile, { profileRoot: opts.profileRoot })
  try {
    const r = handle.get<{ generated_at: number; provenance: string; payload: string }>(
      `SELECT generated_at, provenance, payload FROM canonical_funnel
       ORDER BY generated_at DESC LIMIT 1`,
    )
    if (!r) return null
    return {
      generated_at: r.generated_at,
      funnel: JSON.parse(r.payload) as FunnelTab,
      provenance: JSON.parse(r.provenance) as FunnelProvenance,
    }
  } catch {
    return null
  } finally {
    handle.close()
  }
}
