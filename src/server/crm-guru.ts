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
  const hasReport = roiCurrent.length > 0

  // Lead Performance: API Leads, then report Contacted → Appt Set → Shown → Sold.
  const leadStage = apiLeadStage(opportunities)
  const contacted = reportStage('contacted', 'Contacted', 'internet_actual_contact', roiCurrent, roiPrior, null)
  const apptSet = reportStage('appt_set', 'Appointments Set', 'appts_set', roiCurrent, roiPrior, contacted.now)
  const apptShown = reportStage('appt_shown', 'Appointments Shown', 'appts_shown', roiCurrent, roiPrior, apptSet.now)
  const sold = reportStage('sold', 'Sold', 'sold_from_leads', roiCurrent, roiPrior, apptShown.now)
  const leadStages = [leadStage, contacted, apptSet, apptShown, sold]

  // De-blended timing weights: sales opportunities per source (API, deduped).
  // weightedAvg falls back to good_leads when a source has no API weight.
  const weightBySource = new Map<string, number>(
    (opportunities?.by_source ?? []).map((s) => [normSource(s.lead_source), s.opportunities]),
  )
  const timings: Array<Metric> = [
    pendingTiming('time_to_first_contact', 'Time to First Contact', 'days', 'down'),
    pendingTiming('time_to_first_discussion', 'Time to First Discussion', 'days', 'down'),
    timingMetric('time_to_appt_set', 'Time to Appointment Set', 'avg_days_to_appt_set', roiCurrent, roiPrior, weightBySource),
    pendingTiming('time_to_appointment', 'Time to Appointment', 'days', 'down'),
    timingMetric('time_to_sale', 'Time to Sale', 'avg_days_to_sale', roiCurrent, roiPrior, weightBySource),
  ]

  // Pipeline Performance: API Leads, then report Opportunities → Appts → Sales.
  const pLeads = apiLeadStage(opportunities)
  const pOpp = reportStage('opportunities', 'Opportunities', 'good_leads', roiCurrent, roiPrior, null)
  const pAppt = reportStage('appointments', 'Appointments', 'appts_set', roiCurrent, roiPrior, pOpp.now)
  const pSales = reportStage('sales', 'Sales', 'sold_from_leads', roiCurrent, roiPrior, pAppt.now)

  // Lead sources: the defensible Leads count is the API per-source opportunities;
  // report-only columns attach where the source name matches.
  const reportBySource = new Map(roiCurrent.map((r) => [normSource(r.lead_source), r]))
  const totalSoldAll = sum(roiCurrent, 'sold_from_leads') ?? 0
  const totalLeadsAll = opportunities?.opportunities ?? 0
  const overallSoldRate = totalLeadsAll > 0 ? totalSoldAll / totalLeadsAll : 0

  let lead_sources: Array<LeadSourceRow>
  if (opportunities) {
    // API available → defensible Leads count per source; report-only columns
    // attach where the normalized source name matches.
    lead_sources = opportunities.by_source.map((row) => {
      const rep = reportBySource.get(normSource(row.lead_source))
      const leads = row.opportunities
      // Only rate when the report carries a real sold number — a null (missing)
      // sold must NOT be read as zero sales (that would be a false "alarm").
      const soldNum = typeof rep?.sold_from_leads === 'number' ? rep.sold_from_leads : null
      const rate = rep?.sold_from_leads_pct ?? (soldNum != null && leads > 0 ? soldNum / leads : 0)
      let rating: LeadRating = 'watch'
      if (rep && soldNum != null) {
        if (leads >= 10 && soldNum === 0) rating = 'alarm'
        else if (soldNum > 0 && rate >= overallSoldRate) rating = 'good'
      }
      return {
        lead_source: row.lead_source,
        total_leads: leads,
        good_leads: rep?.good_leads ?? null,
        appts_set: rep?.appts_set ?? null,
        sold_from_leads: rep?.sold_from_leads ?? null,
        sold_from_leads_pct: rep?.sold_from_leads_pct ?? null,
        total_gross: rep?.total_gross ?? null,
        rating,
        trend: trend(leads, null, 'up'),
      }
    })
  } else {
    // API unavailable but a report exists → still surface the report-sourced rows
    // (sold/gross/good are defensible report data). The Leads count is NOT
    // defensible without the API, so total_leads stays null ("needs supplemental")
    // — never the report's inflated raw total. Rating stays neutral.
    lead_sources = roiCurrent
      .map((r) => ({
        lead_source: r.lead_source,
        total_leads: null,
        good_leads: r.good_leads,
        appts_set: r.appts_set,
        sold_from_leads: r.sold_from_leads,
        sold_from_leads_pct: r.sold_from_leads_pct,
        total_gross: r.total_gross,
        rating: 'watch' as LeadRating,
        trend: trend(null, null, 'up'),
      }))
      .sort((a, b) => (b.sold_from_leads ?? 0) - (a.sold_from_leads ?? 0))
  }

  const provenance: FunnelProvenance = {
    leads_source: opportunities ? 'api' : 'unavailable',
    leads_capped: input.leadsCapped ?? false,
    metrics_source: hasReport ? 'report' : 'needs_supplemental',
    report_as_of: hasReport ? comparisonLabel : null,
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
