/**
 * Halo Data — typed ACCEPTED-FACT layer (M2R R2, isolated dev).
 *
 * The single, auditable bridge between the governed native readers and the internal
 * consultant findings layer. Sorts one store's accepted Sales evidence into:
 *   (a) accepted_exact_condition   — RATIFIED SW-032/SW-041 (full lineage), from a
 *       FRESH accepted Appointments family only.
 *   (b) accepted_observed_kpi      — NATIVE7 product slugs (is_sw_condition always false).
 *   (c) accepted_context_fact      — broader strict Dashboard/CRM/Appointments facts for
 *       deep synthesis; a SEPARATE collection (never in the 20-slug product coverage,
 *       never an SW firing). Keys are an EXACT allowlist per family.
 *   (d) withheld_or_provisional    — quarantined ROI/CAGE/comm, no-current-data, or STALE.
 *
 * All gate/discrepancy/freshness logic lives in CANONICAL helpers used by BOTH assembly
 * and validation, so a caller-authored bundle cannot smuggle a claim past validation:
 *   - `computeFreshness` derives age/freshness/fresh from a source period end + a single
 *     bundle as_of + the recorded max-age policy (caller fresh/age_days/status are NOT
 *     trusted — they are recomputed and compared).
 *   - `buildCanon` normalizes the accepted facts; `deriveDiscrepancies`,
 *     `deriveCompositeBlock`, `deriveExactPromotion`, `derivePeriodsCompatible`, and
 *     `deriveCrossGross` produce every gate + the full discrepancy array from that canon.
 *   - `validateAcceptedFactsBundle` re-runs those helpers on the bundle's OWN coverage +
 *     context facts and rejects any divergence (forged gates, discrepancies, freshness,
 *     provenance, exact-condition math, or context inventory).
 *
 * Reader I/O (`resolveAcceptedFacts`) is separated from PURE assembly
 * (`assembleAcceptedFacts`) so acceptance is provable from a committed non-PII fixture.
 */
import {
  HALO_SUPPORT_MANIFEST,
  isHaloSalesProfile,
  type MetricUnit,
} from '../watchdog/halo-support-manifest'
import { METRIC_CATALOG } from '../watchdog/metric-catalog'
import { HaloProfileNotAllowedError } from './halo-report-card'
import { DEALER_REGISTRY } from './m2b/report-model'
import {
  readAppointments,
  readCrmSalesGross,
  readDealershipPerformance,
  type AppointmentsMetrics,
  type CrmSalesGross,
  type DealershipPerformance,
} from '../ingest-native-metrics'

export type FactClass =
  | 'accepted_exact_condition'
  | 'accepted_observed_kpi'
  | 'accepted_context_fact'
  | 'withheld_or_provisional'

export const RATIFIED_EXACT_CONDITIONS = ['SW-032', 'SW-041'] as const
export type RatifiedConditionId = (typeof RATIFIED_EXACT_CONDITIONS)[number]

export const NATIVE7 = [
  'gross.total_sum',
  'gross.reconciliation_mismatches',
  'dashboard.response_time_actual_avg_min',
  'appt.show_rate',
  'appt.no_show_rate',
  'appt.confirmed_rate',
  'appt.cancel_rate',
] as const

export const QUARANTINED_SLUGS = [
  'roi.total_leads', 'roi.sold_from_leads', 'roi.duplicate_rate',
  'cage.total_comms', 'cage.deals_from_leads', 'cage.rep_count',
  'comm.escalation_keyword_screen', 'comm.template_overuse',
  'comm.inbound_high_intent_keywords', 'comm.multi_rep_within_24h',
] as const

export const FRESH_MAX_DAYS = 8
export const AGING_MAX_DAYS = 14
export const DEFAULT_MAX_AGE_DAYS = 14
export const GROSS_RECONCILIATION_TOLERANCE = 0.5
const EPS = 1e-9
/** Canonical: this layer carries a single governed period per family (no history) => no trend. */
const SINGLE_PERIOD_NO_TREND = true as const

const NATIVE7_SET = new Set<string>(NATIVE7)
const QUARANTINED_SET = new Set<string>(QUARANTINED_SLUGS)

type FamilyName = 'appointments' | 'crm_sales_gross' | 'dealership_performance'
const ALL_FAMILIES: FamilyName[] = ['appointments', 'crm_sales_gross', 'dealership_performance']

const FAM = {
  APPT: 'appointments (native)',
  CRM_PRECEDENCE: 'crm_sales_gross (native - precedence)',
  CRM_PERDEAL: 'crm_sales_gross (native - per-deal)',
  DP_FALLBACK: 'dealership_performance (native - Dashboard TOTAL fallback)',
  DP_RESPONSE: 'dealership_performance (native - Response Time section)',
} as const

const KPI_ALLOW: Record<string, Array<{ source: string; family: FamilyName }>> = {
  'gross.total_sum': [
    { source: FAM.CRM_PRECEDENCE, family: 'crm_sales_gross' },
    { source: FAM.DP_FALLBACK, family: 'dealership_performance' },
  ],
  'gross.reconciliation_mismatches': [{ source: FAM.CRM_PERDEAL, family: 'crm_sales_gross' }],
  'dashboard.response_time_actual_avg_min': [{ source: FAM.DP_RESPONSE, family: 'dealership_performance' }],
  'appt.show_rate': [{ source: FAM.APPT, family: 'appointments' }],
  'appt.no_show_rate': [{ source: FAM.APPT, family: 'appointments' }],
  'appt.confirmed_rate': [{ source: FAM.APPT, family: 'appointments' }],
  'appt.cancel_rate': [{ source: FAM.APPT, family: 'appointments' }],
}

/** EXACT context-fact keys per family (no prefix acceptance). */
const CTX_KEYS_BY_FAMILY: Record<FamilyName, string[]> = {
  dealership_performance: ['dashboard.leads', 'dashboard.appts_set', 'dashboard.appts_shown', 'dashboard.total_visits', 'dashboard.visits_sold', 'dashboard.sold_in_period', 'dashboard.front_gross', 'dashboard.back_gross', 'dashboard.total_gross', 'dashboard.avg_actual_response_min'],
  crm_sales_gross: ['crm.row_count', 'crm.front_sum', 'crm.back_sum', 'crm.total_sum', 'crm.reconciliation_mismatches'],
  appointments: ['appointments.total', 'appointments.show', 'appointments.no_show', 'appointments.confirmed', 'appointments.cancelled', 'appointments.completed', 'appointments.rescheduled'],
}
const CTX_KEY_TO_FAMILY: Record<string, FamilyName> = (() => {
  const m: Record<string, FamilyName> = {}
  for (const fam of ALL_FAMILIES) for (const k of CTX_KEYS_BY_FAMILY[fam]) m[k] = fam
  return m
})()

export type PeriodRef = { start: string | null; end: string | null }
export type Freshness = 'fresh' | 'aging' | 'stale' | 'unknown'

export type FamilyCoverage = {
  family: string
  available: boolean
  period: PeriodRef
  age_days: number | null
  freshness: Freshness
  as_of_iso: string
  checksum: string | null
  accepted_rows: number | null
  fresh: boolean
}

export type FactCompatibility = {
  dealer_profile: string
  source_family: string
  period: PeriodRef
  grain: string
  unit: MetricUnit | 'condition_boolean'
  denominator_basis: string | null
  population: string
  checksum: string
  freshness: Freshness
}

export type AcceptedExactCondition = {
  fact_class: 'accepted_exact_condition'
  condition_id: RatifiedConditionId
  based_on_slug: string
  label: string
  numerator: number
  denominator: number
  value: number
  display: string
  comparator: '<' | '>'
  threshold: number
  fires: boolean
  compatibility: FactCompatibility
  evidence_ref: string
}

export type AcceptedObservedKpi = {
  fact_class: 'accepted_observed_kpi'
  slug: string
  label: string
  value: number
  unit: MetricUnit
  display: string
  is_sw_condition: false
  compatibility: FactCompatibility
  evidence_ref: string
  caveats: string[]
}

export type AcceptedContextFact = {
  fact_class: 'accepted_context_fact'
  key: string
  label: string
  source_family: string
  value: number
  unit: MetricUnit
  period: PeriodRef
  grain: string
  population: string
  freshness: Freshness
  checksum: string
  acceptance_state: 'accepted'
  compatibility_status: 'compatible' | 'source_specific_only'
  evidence_ref: string
}

export type WithheldFact = {
  fact_class: 'withheld_or_provisional'
  slug: string
  label: string
  sub_state: 'withheld' | 'no_current_data' | 'stale'
  source_family: string
  reason: string
}

export type CountDisagreement = {
  kind: 'count_disagreement'
  id: 'crm_rows_vs_dashboard_sold'
  description: string
  period: PeriodRef
  crm_rows: number
  dashboard_sold: number
  gross_reconciles: boolean
  blocks_count_dependent_composites: true
  still_usable: string[]
}
export type PeriodMismatch = {
  kind: 'period_mismatch'
  id: 'period_mismatch_across_families'
  description: string
  family_periods: Array<{ family: string; period: PeriodRef }>
  blocks_cross_source_claims: true
}
export type GrossMismatch = {
  kind: 'gross_mismatch'
  id: 'crm_vs_dashboard_gross_mismatch'
  description: string
  period: PeriodRef
  crm_total: number
  dp_total: number
  tolerance: number
  blocks_cross_source_gross_composites: true
}
export type SourceDiscrepancy = CountDisagreement | PeriodMismatch | GrossMismatch

export type CrossSourceGross = {
  crm_total: number
  dp_total: number
  tolerance: number
  periods_match: boolean
  reconciles: boolean
} | null

export type CompatibilityGates = {
  periods_compatible: boolean
  single_period_no_trend: boolean
  no_causal_or_ordered_claim: true
  comm_ids_unstable_block_comm_claims: true
  quarantined_cannot_feed_accepted: true
  count_dependent_composites_blocked: boolean
  blocked_composite_reason: string | null
  gross_cross_source_reconciles: boolean | null
  stale_families: string[]
  exact_conditions_promoted: boolean
  exact_conditions_block_reason: string | null
}

export type AcceptedFactsBundle = {
  schema_version: '1.1.0'
  profile: string
  dealer_name: string
  dealer_id: string
  sales_only: true
  /** Single bundle as-of (ISO); every family_coverage row shares it; freshness derives from it. */
  as_of_iso: string
  /** Max-age policy (days) used to decide fresh vs stale. */
  max_age_days: number
  period: PeriodRef
  family_coverage: FamilyCoverage[]
  exact_conditions: AcceptedExactCondition[]
  observed_kpis: AcceptedObservedKpi[]
  accepted_context_facts: AcceptedContextFact[]
  withheld: WithheldFact[]
  discrepancies: SourceDiscrepancy[]
  cross_source_gross: CrossSourceGross
  gates: CompatibilityGates
  counts: { exact_conditions: number; observed_kpis: number; context_facts: number; withheld: number }
}

export type AcceptedFactsOptions = { now?: number; maxAgeDays?: number }
export type AcceptedFactsSources = {
  appointments: AppointmentsMetrics | null
  crm: CrmSalesGross | null
  dashboard: DealershipPerformance | null
}

// ── Canonical spec + derivation helpers (SHARED by assembly AND validation) ──────────
type ExactSpec = { based_on: string; comparator: '<' | '>'; threshold: number }
const EXACT_SPEC: Record<RatifiedConditionId, ExactSpec> = {
  'SW-032': { based_on: 'appt.show_rate', comparator: '<', threshold: 0.55 },
  'SW-041': { based_on: 'appt.no_show_rate', comparator: '>', threshold: 0.45 },
}
const EXACT_LABEL: Record<RatifiedConditionId, string> = {
  'SW-032': 'Appointment show rate < 55%',
  'SW-041': 'Appointment no-show rate > 45%',
}

function formatDisplay(value: number, unit: MetricUnit): string {
  if (unit === 'currency_usd') return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (unit === 'ratio_0_1') return `${(value * 100).toFixed(1)}%`
  return String(Math.round(value))
}
function ageDaysOf(end: string | null, now: number): number | null {
  if (!end) return null
  const t = Date.parse(`${end}T23:59:59Z`)
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((now - t) / 86_400_000))
}
function freshnessLabel(age: number | null): Freshness {
  if (age == null) return 'unknown'
  if (age <= FRESH_MAX_DAYS) return 'fresh'
  if (age <= AGING_MAX_DAYS) return 'aging'
  return 'stale'
}
/** CANONICAL freshness: derived solely from period end + now + max-age policy. */
function computeFreshness(period: PeriodRef, available: boolean, now: number, maxAgeDays: number): { age_days: number | null; freshness: Freshness; fresh: boolean } {
  const age = available ? ageDaysOf(period.end, now) : null
  const freshness = available ? freshnessLabel(age) : 'unknown'
  const fresh = available && age != null && age <= maxAgeDays
  return { age_days: age, freshness, fresh }
}
function periodEq(a: PeriodRef, b: PeriodRef): boolean {
  return a.start === b.start && a.end === b.end
}
function derivePeriodsCompatible(freshPeriods: PeriodRef[]): { periods_compatible: boolean; period: PeriodRef } {
  const compatible = freshPeriods.length <= 1 || freshPeriods.every((p) => periodEq(p, freshPeriods[0]))
  return { periods_compatible: compatible, period: compatible && freshPeriods.length > 0 ? freshPeriods[0] : { start: null, end: null } }
}
function deriveCrossGross(crmTotal: number | null, dpTotal: number | null, crmPeriod: PeriodRef | null, dpPeriod: PeriodRef | null): CrossSourceGross {
  if (crmTotal == null || dpTotal == null || !crmPeriod || !dpPeriod) return null
  const periods_match = periodEq(crmPeriod, dpPeriod)
  return { crm_total: crmTotal, dp_total: dpTotal, tolerance: GROSS_RECONCILIATION_TOLERANCE, periods_match, reconciles: periods_match && Math.abs(crmTotal - dpTotal) <= GROSS_RECONCILIATION_TOLERANCE }
}
function computeExact(id: RatifiedConditionId, numerator: number, denominator: number): { numerator: number; denominator: number; value: number; display: string; comparator: '<' | '>'; threshold: number; fires: boolean } {
  const spec = EXACT_SPEC[id]
  const value = numerator / denominator
  return { numerator, denominator, value, display: formatDisplay(value, 'ratio_0_1'), comparator: spec.comparator, threshold: spec.threshold, fires: spec.comparator === '<' ? value < spec.threshold : value > spec.threshold }
}

/** Normalized accepted facts that fully determine gates + discrepancies. */
type FamGate = { present: boolean; fresh: boolean; period: PeriodRef }
type Canon = {
  appt: FamGate & { total: number | null }
  crm: FamGate & { total: number | null; rows: number | null }
  dp: FamGate & { total: number | null; sold: number | null }
  periods_compatible: boolean
  governed_period: PeriodRef
  cross_source_gross: CrossSourceGross
}
function buildCanon(parts: {
  apPresent: boolean; apFresh: boolean; apPeriod: PeriodRef; apTotal: number | null
  crmPresent: boolean; crmFresh: boolean; crmPeriod: PeriodRef; crmTotal: number | null; crmRows: number | null
  dpPresent: boolean; dpFresh: boolean; dpPeriod: PeriodRef; dpTotal: number | null; dpSold: number | null
}): Canon {
  const freshPeriods: PeriodRef[] = []
  if (parts.apPresent && parts.apFresh) freshPeriods.push(parts.apPeriod)
  if (parts.crmPresent && parts.crmFresh) freshPeriods.push(parts.crmPeriod)
  if (parts.dpPresent && parts.dpFresh) freshPeriods.push(parts.dpPeriod)
  const { periods_compatible, period } = derivePeriodsCompatible(freshPeriods)
  const cross = parts.crmPresent && parts.crmFresh && parts.dpPresent && parts.dpFresh ? deriveCrossGross(parts.crmTotal, parts.dpTotal, parts.crmPeriod, parts.dpPeriod) : null
  return {
    appt: { present: parts.apPresent, fresh: parts.apFresh, period: parts.apPeriod, total: parts.apTotal },
    crm: { present: parts.crmPresent, fresh: parts.crmFresh, period: parts.crmPeriod, total: parts.crmTotal, rows: parts.crmRows },
    dp: { present: parts.dpPresent, fresh: parts.dpFresh, period: parts.dpPeriod, total: parts.dpTotal, sold: parts.dpSold },
    periods_compatible, governed_period: period, cross_source_gross: cross,
  }
}
function bothGrossFresh(c: Canon): boolean {
  return c.crm.present && c.crm.fresh && c.dp.present && c.dp.fresh
}
function deriveCountDisagrees(c: Canon): boolean {
  return bothGrossFresh(c) && periodEq(c.crm.period, c.dp.period) && c.crm.rows != null && c.dp.sold != null && c.crm.rows !== c.dp.sold
}
/** CANONICAL, ordered discrepancy array (period_mismatch, count, gross). */
function deriveDiscrepancies(c: Canon): SourceDiscrepancy[] {
  const out: SourceDiscrepancy[] = []
  if (!c.periods_compatible) {
    const fp: Array<{ family: string; period: PeriodRef }> = []
    if (c.appt.present && c.appt.fresh) fp.push({ family: 'appointments', period: c.appt.period })
    if (c.crm.present && c.crm.fresh) fp.push({ family: 'crm_sales_gross', period: c.crm.period })
    if (c.dp.present && c.dp.fresh) fp.push({ family: 'dealership_performance', period: c.dp.period })
    out.push({ kind: 'period_mismatch', id: 'period_mismatch_across_families', description: 'Fresh accepted families report different governed periods; cross-source claims are blocked and source-specific facts are kept.', family_periods: fp, blocks_cross_source_claims: true })
  }
  if (deriveCountDisagrees(c)) {
    const grossReconciles = c.cross_source_gross?.reconciles === true
    out.push({ kind: 'count_disagreement', id: 'crm_rows_vs_dashboard_sold', description: `CRM Sales Gross delivered-sale rows (${c.crm.rows}) disagree with Dashboard sold-in-period (${c.dp.sold}) for the same governed period; neither is authoritative for a unit count.`, period: c.crm.period, crm_rows: c.crm.rows as number, dashboard_sold: c.dp.sold as number, gross_reconciles: grossReconciles, blocks_count_dependent_composites: true, still_usable: grossReconciles ? ['gross.total_sum (absolute; CRM total reconciles to Dashboard TOTAL within tolerance)'] : [] })
  }
  if (c.cross_source_gross && c.cross_source_gross.periods_match && !c.cross_source_gross.reconciles) {
    out.push({ kind: 'gross_mismatch', id: 'crm_vs_dashboard_gross_mismatch', description: `For the same governed period, CRM Sales Gross total (${formatDisplay(c.cross_source_gross.crm_total, 'currency_usd')}) and Dashboard total gross (${formatDisplay(c.cross_source_gross.dp_total, 'currency_usd')}) differ by more than the $0.50 tolerance.`, period: c.crm.period, crm_total: c.cross_source_gross.crm_total, dp_total: c.cross_source_gross.dp_total, tolerance: GROSS_RECONCILIATION_TOLERANCE, blocks_cross_source_gross_composites: true })
  }
  return out
}
function deriveCompositeBlock(c: Canon): { blocked: boolean; reason: string | null } {
  const countDisagree = deriveCountDisagrees(c)
  const blocked = countDisagree || !c.periods_compatible || (c.cross_source_gross ? !c.cross_source_gross.reconciles : false)
  const reason = blocked
    ? (countDisagree
        ? 'CRM delivered-sale rows disagree with Dashboard sold-in-period; count-dependent composites are blocked.'
        : !c.periods_compatible
          ? 'Accepted families do not share the same governed period; cross-source composites are blocked.'
          : 'CRM and Dashboard gross do not reconcile within tolerance; cross-source gross composites are blocked.')
    : null
  return { blocked, reason }
}
function deriveExactPromotion(appt: FamGate & { total: number | null }): { promoted: boolean; reason: string | null } {
  const promoted = appt.present && appt.fresh && appt.total != null && appt.total > 0
  const reason = promoted ? null : appt.present ? (appt.fresh ? 'appointments present but total is zero' : 'appointments family is stale (exceeds max age) - exact conditions not promoted') : 'no accepted appointments family'
  return { promoted, reason }
}

const OBSERVED_KPI_LABELS: Record<string, string> = {
  'gross.total_sum': 'Total gross',
  'gross.reconciliation_mismatches': 'Gross reconciliation mismatches',
  'dashboard.response_time_actual_avg_min': 'Avg response time (actual, min)',
  'appt.show_rate': 'Appointment show rate',
  'appt.no_show_rate': 'Appointment no-show rate',
  'appt.confirmed_rate': 'Appointment confirmed rate',
  'appt.cancel_rate': 'Appointment cancel rate',
}

export function assembleAcceptedFacts(profile: string, sources: AcceptedFactsSources, opts: AcceptedFactsOptions = {}): AcceptedFactsBundle {
  if (!isHaloSalesProfile(profile)) throw new HaloProfileNotAllowedError(profile)
  const dealer = DEALER_REGISTRY[profile]
  const now = opts.now ?? Date.now()
  const maxAgeDays = opts.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS
  const asOf = new Date(now).toISOString()

  const ap = sources.appointments
  const crm = sources.crm
  const dp = sources.dashboard

  const emptyPeriod: PeriodRef = { start: null, end: null }
  const apF = computeFreshness(ap ? ap.provenance.period : emptyPeriod, !!ap, now, maxAgeDays)
  const crmF = computeFreshness(crm ? crm.provenance.period : emptyPeriod, !!crm, now, maxAgeDays)
  const dpF = computeFreshness(dp ? dp.provenance.period : emptyPeriod, !!dp, now, maxAgeDays)

  const family_coverage: FamilyCoverage[] = [
    { family: 'appointments', available: !!ap, period: ap ? ap.provenance.period : emptyPeriod, ...apF, as_of_iso: asOf, checksum: ap ? ap.provenance.checksum : null, accepted_rows: ap ? ap.provenance.acceptedRows : null },
    { family: 'crm_sales_gross', available: !!crm, period: crm ? crm.provenance.period : emptyPeriod, ...crmF, as_of_iso: asOf, checksum: crm ? crm.provenance.checksum : null, accepted_rows: crm ? crm.provenance.acceptedRows : null },
    { family: 'dealership_performance', available: !!dp, period: dp ? dp.provenance.period : emptyPeriod, ...dpF, as_of_iso: asOf, checksum: dp ? dp.provenance.checksum : null, accepted_rows: dp ? dp.provenance.acceptedRows : null },
  ]
  const stale_families = family_coverage.filter((f) => f.available && !f.fresh).map((f) => f.family)

  const canon = buildCanon({
    apPresent: !!ap, apFresh: apF.fresh, apPeriod: ap ? ap.provenance.period : emptyPeriod, apTotal: ap ? ap.total : null,
    crmPresent: !!crm, crmFresh: crmF.fresh, crmPeriod: crm ? crm.provenance.period : emptyPeriod, crmTotal: crm ? crm.totalSum : null, crmRows: crm ? crm.rowCount : null,
    dpPresent: !!dp, dpFresh: dpF.fresh, dpPeriod: dp ? dp.provenance.period : emptyPeriod, dpTotal: dp ? dp.summary.totalGross : null, dpSold: dp ? dp.summary.soldInPeriod : null,
  })
  const discrepancies = deriveDiscrepancies(canon)
  const block = deriveCompositeBlock(canon)
  const exactPromo = deriveExactPromotion(canon.appt)

  const exact_conditions: AcceptedExactCondition[] = []
  const observed_kpis: AcceptedObservedKpi[] = []
  const accepted_context_facts: AcceptedContextFact[] = []
  const withheld: WithheldFact[] = []

  const grossCaveat = block.blocked ? ['Absolute gross only; per-unit/close-rate composites are blocked (source-count disagreement, period mismatch, or unreconciled cross-source gross).'] : []
  const compat = (family: string, unit: FactCompatibility['unit'], grain: string, denom: string | null, pop: string, checksum: string, period: PeriodRef, freshness: Freshness): FactCompatibility => ({ dealer_profile: profile, source_family: family, period, grain, unit, denominator_basis: denom, population: pop, checksum, freshness })

  if (crm && crmF.fresh && crm.totalSum != null) {
    observed_kpis.push(makeKpi('gross.total_sum', crm.totalSum, 'currency_usd', compat(FAM.CRM_PRECEDENCE, 'currency_usd', 'store × governed CRM Sales Gross period (per-deal totals summed)', null, `${crm.rowCount} accepted delivered-sale rows`, crm.provenance.checksum, crm.provenance.period, crmF.freshness), grossCaveat))
    if (crm.reconciliationMismatches != null) observed_kpis.push(makeKpi('gross.reconciliation_mismatches', crm.reconciliationMismatches, 'count', compat(FAM.CRM_PERDEAL, 'count', 'store × governed CRM Sales Gross period (per-deal rows)', 'per-deal rows where abs((Front+Back)-Total) > $0.50', `${crm.rowCount} accepted delivered-sale rows`, crm.provenance.checksum, crm.provenance.period, crmF.freshness), []))
  } else if (dp && dpF.fresh && dp.summary.totalGross != null) {
    observed_kpis.push(makeKpi('gross.total_sum', dp.summary.totalGross, 'currency_usd', compat(FAM.DP_FALLBACK, 'currency_usd', 'store × governed Dealership Performance period (Front+Back TOTAL)', null, 'Dashboard Summary TOTAL row', dp.provenance.checksum, dp.provenance.period, dpF.freshness), ['Dashboard TOTAL fallback (CRM Sales Gross absent); no per-deal reconciliation available.']))
  }
  if (dp && dpF.fresh && dp.summary.responseTimeActualAvgMin != null) observed_kpis.push(makeKpi('dashboard.response_time_actual_avg_min', dp.summary.responseTimeActualAvgMin, 'count', compat(FAM.DP_RESPONSE, 'count', 'store × governed Dealership Performance period', null, 'Dashboard "Avg Actual (Min)" (minutes; NOT first-response-time)', dp.provenance.checksum, dp.provenance.period, dpF.freshness), []))
  if (ap && apF.fresh && ap.total > 0) {
    const denom = `${ap.total} appointment rows`
    const apCompat = (unit: FactCompatibility['unit']) => compat(FAM.APPT, unit, 'store × governed appointment-report period', denom, `${ap.total} accepted appointment rows`, ap.provenance.checksum, ap.provenance.period, apF.freshness)
    observed_kpis.push(makeKpi('appt.show_rate', ap.show / ap.total, 'ratio_0_1', apCompat('ratio_0_1'), []))
    observed_kpis.push(makeKpi('appt.no_show_rate', ap.noShow / ap.total, 'ratio_0_1', apCompat('ratio_0_1'), []))
    observed_kpis.push(makeKpi('appt.confirmed_rate', ap.confirmed / ap.total, 'ratio_0_1', apCompat('ratio_0_1'), []))
    observed_kpis.push(makeKpi('appt.cancel_rate', ap.cancelled / ap.total, 'ratio_0_1', apCompat('ratio_0_1'), []))
    if (exactPromo.promoted) {
      for (const id of RATIFIED_EXACT_CONDITIONS) {
        const num = id === 'SW-032' ? ap.show : ap.noShow
        const c = computeExact(id, num, ap.total)
        exact_conditions.push({ fact_class: 'accepted_exact_condition', condition_id: id, based_on_slug: EXACT_SPEC[id].based_on, label: EXACT_LABEL[id], ...c, compatibility: { ...apCompat('condition_boolean') }, evidence_ref: EXACT_SPEC[id].based_on })
      }
    }
  }

  // (c) Context facts — per fresh family, EXACT allowlisted keys, non-null values.
  const ctxStatus: AcceptedContextFact['compatibility_status'] = canon.periods_compatible ? 'compatible' : 'source_specific_only'
  const pushCtx = (key: string, label: string, family: string, value: number | null, unit: MetricUnit, grain: string, pop: string, checksum: string, period: PeriodRef, freshness: Freshness) => {
    if (value == null) return
    accepted_context_facts.push({ fact_class: 'accepted_context_fact', key, label, source_family: family, value, unit, period, grain, population: pop, freshness, checksum, acceptance_state: 'accepted', compatibility_status: ctxStatus, evidence_ref: key })
  }
  if (dp && dpF.fresh) {
    const s = dp.summary, ck = dp.provenance.checksum, per = dp.provenance.period, fr = dpF.freshness, g = 'store × governed Dealership Performance period', pop = 'Dashboard Summary section'
    pushCtx('dashboard.leads', 'Leads (Dashboard)', 'dealership_performance', s.leads, 'count', g, pop, ck, per, fr)
    pushCtx('dashboard.appts_set', 'Appointments set (Dashboard)', 'dealership_performance', s.apptsSet, 'count', g, pop, ck, per, fr)
    pushCtx('dashboard.appts_shown', 'Appointments shown (Dashboard)', 'dealership_performance', s.apptsShow, 'count', g, pop, ck, per, fr)
    pushCtx('dashboard.total_visits', 'Total visits (Dashboard)', 'dealership_performance', s.totalVisits, 'count', g, pop, ck, per, fr)
    pushCtx('dashboard.visits_sold', 'Visits sold (Dashboard)', 'dealership_performance', s.visitsSold, 'count', g, pop, ck, per, fr)
    pushCtx('dashboard.sold_in_period', 'Sold in period (Dashboard)', 'dealership_performance', s.soldInPeriod, 'count', g, pop, ck, per, fr)
    pushCtx('dashboard.front_gross', 'Front gross (Dashboard)', 'dealership_performance', s.frontGross, 'currency_usd', g, pop, ck, per, fr)
    pushCtx('dashboard.back_gross', 'Back gross (Dashboard)', 'dealership_performance', s.backGross, 'currency_usd', g, pop, ck, per, fr)
    pushCtx('dashboard.total_gross', 'Total gross (Dashboard)', 'dealership_performance', s.totalGross, 'currency_usd', g, pop, ck, per, fr)
    pushCtx('dashboard.avg_actual_response_min', 'Avg actual response (min, Dashboard)', 'dealership_performance', s.responseTimeActualAvgMin, 'count', g, pop, ck, per, fr)
  }
  if (crm && crmF.fresh) {
    const ck = crm.provenance.checksum, per = crm.provenance.period, fr = crmF.freshness, g = 'store × governed CRM Sales Gross period', pop = `${crm.rowCount} accepted delivered-sale rows`
    pushCtx('crm.row_count', 'Sale rows (CRM Sales Gross)', 'crm_sales_gross', crm.rowCount, 'count', g, pop, ck, per, fr)
    pushCtx('crm.front_sum', 'Front gross sum (CRM)', 'crm_sales_gross', crm.frontSum, 'currency_usd', g, pop, ck, per, fr)
    pushCtx('crm.back_sum', 'Back gross sum (CRM)', 'crm_sales_gross', crm.backSum, 'currency_usd', g, pop, ck, per, fr)
    pushCtx('crm.total_sum', 'Total gross sum (CRM)', 'crm_sales_gross', crm.totalSum, 'currency_usd', g, pop, ck, per, fr)
    pushCtx('crm.reconciliation_mismatches', 'Reconciliation mismatches (CRM)', 'crm_sales_gross', crm.reconciliationMismatches, 'count', g, pop, ck, per, fr)
  }
  if (ap && apF.fresh) {
    const ck = ap.provenance.checksum, per = ap.provenance.period, fr = apF.freshness, g = 'store × governed appointment-report period', pop = `${ap.total} accepted appointment rows`
    pushCtx('appointments.total', 'Appointments total', 'appointments', ap.total, 'count', g, pop, ck, per, fr)
    pushCtx('appointments.show', 'Appointments shown', 'appointments', ap.show, 'count', g, pop, ck, per, fr)
    pushCtx('appointments.no_show', 'Appointments no-show', 'appointments', ap.noShow, 'count', g, pop, ck, per, fr)
    pushCtx('appointments.confirmed', 'Appointments confirmed', 'appointments', ap.confirmed, 'count', g, pop, ck, per, fr)
    pushCtx('appointments.cancelled', 'Appointments cancelled', 'appointments', ap.cancelled, 'count', g, pop, ck, per, fr)
    pushCtx('appointments.completed', 'Appointments completed', 'appointments', ap.completed, 'count', g, pop, ck, per, fr)
    pushCtx('appointments.rescheduled', 'Appointments rescheduled', 'appointments', ap.rescheduled, 'count', g, pop, ck, per, fr)
  }

  const accountedSlugs = new Set(observed_kpis.map((k) => k.slug))
  const staleSlugReason = (slug: string): string | null => {
    if (!NATIVE7_SET.has(slug)) return null
    if (slug.startsWith('appt.') && ap && !apF.fresh) return 'appointments family stale (exceeds max age); not promoted (missing, not zero)'
    if ((slug === 'gross.total_sum' || slug === 'gross.reconciliation_mismatches') && crm && !crmF.fresh) return 'CRM Sales Gross family stale (exceeds max age); not promoted (missing, not zero)'
    if (slug === 'dashboard.response_time_actual_avg_min' && dp && !dpF.fresh) return 'Dealership Performance family stale (exceeds max age); not promoted (missing, not zero)'
    return null
  }
  for (const m of METRIC_CATALOG) {
    if (accountedSlugs.has(m.id)) continue
    const support = HALO_SUPPORT_MANIFEST[m.id]
    const staleReason = staleSlugReason(m.id)
    const sub_state: WithheldFact['sub_state'] = staleReason ? 'stale' : support?.state === 'withheld' ? 'withheld' : 'no_current_data'
    withheld.push({ fact_class: 'withheld_or_provisional', slug: m.id, label: m.label, sub_state, source_family: support?.sourceFamily ?? m.category, reason: staleReason ?? support?.withheldReason ?? (sub_state === 'no_current_data' ? 'no current value for this period' : 'no governed reader') })
  }

  const gates: CompatibilityGates = {
    periods_compatible: canon.periods_compatible,
    single_period_no_trend: SINGLE_PERIOD_NO_TREND,
    no_causal_or_ordered_claim: true,
    comm_ids_unstable_block_comm_claims: true,
    quarantined_cannot_feed_accepted: true,
    count_dependent_composites_blocked: block.blocked,
    blocked_composite_reason: block.reason,
    gross_cross_source_reconciles: canon.cross_source_gross ? canon.cross_source_gross.reconciles : null,
    stale_families,
    exact_conditions_promoted: exactPromo.promoted,
    exact_conditions_block_reason: exactPromo.reason,
  }

  return {
    schema_version: '1.1.0', profile, dealer_name: dealer.name, dealer_id: dealer.dealerId, sales_only: true,
    as_of_iso: asOf, max_age_days: maxAgeDays,
    period: canon.governed_period, family_coverage, exact_conditions, observed_kpis, accepted_context_facts, withheld, discrepancies, cross_source_gross: canon.cross_source_gross, gates,
    counts: { exact_conditions: exact_conditions.length, observed_kpis: observed_kpis.length, context_facts: accepted_context_facts.length, withheld: withheld.length },
  }
}

export function resolveAcceptedFacts(profile: string, opts: AcceptedFactsOptions = {}): AcceptedFactsBundle {
  if (!isHaloSalesProfile(profile)) throw new HaloProfileNotAllowedError(profile)
  const ap = readAppointments(profile)
  const crm = readCrmSalesGross(profile)
  const dp = readDealershipPerformance(profile)
  return assembleAcceptedFacts(profile, { appointments: ap.available ? ap : null, crm: crm.available ? crm : null, dashboard: dp.available ? dp : null }, opts)
}

function makeKpi(slug: string, value: number, unit: MetricUnit, compatibility: FactCompatibility, caveats: string[]): AcceptedObservedKpi {
  return { fact_class: 'accepted_observed_kpi', slug, label: OBSERVED_KPI_LABELS[slug] ?? slug, value, unit, display: formatDisplay(value, unit), is_sw_condition: false, compatibility, evidence_ref: slug, caveats }
}

export class AcceptedFactsValidationError extends Error {
  constructor(message: string) {
    super(`accepted-facts validation failed: ${message}`)
    this.name = 'AcceptedFactsValidationError'
  }
}

const HEX64 = /^[0-9a-f]{64}$/i
const PROMOTABLE: Freshness[] = ['fresh', 'aging']

/**
 * INDEPENDENT fail-closed validation. Recomputes freshness (from period + bundle as_of +
 * policy), gates, and the full discrepancy array via the SAME canonical helpers used by
 * assembly, and rejects any divergence. Never trusts caller freshness/gates/discrepancies.
 */
export function validateAcceptedFactsBundle(bundle: AcceptedFactsBundle): void {
  const bad = (m: string): never => { throw new AcceptedFactsValidationError(m) }
  if (!bundle || typeof bundle !== 'object') return void bad('bundle missing')
  if (!isHaloSalesProfile(bundle.profile) || /service|parts/i.test(bundle.profile)) return void bad(`non-Sales/Service profile: ${String(bundle.profile)}`)
  if (bundle.sales_only !== true) return void bad('sales_only is not true')
  const reg = DEALER_REGISTRY[bundle.profile]
  if (!reg || reg.name !== bundle.dealer_name || reg.dealerId !== bundle.dealer_id) return void bad('dealer identity does not match the profile registry')
  const g = bundle.gates
  if (!g || g.no_causal_or_ordered_claim !== true || g.comm_ids_unstable_block_comm_claims !== true || g.quarantined_cannot_feed_accepted !== true) return void bad('compatibility-gate invariants are tampered/missing')

  // as-of / policy metadata must be internally consistent.
  const now = Date.parse(bundle.as_of_iso)
  if (Number.isNaN(now)) return void bad('bundle.as_of_iso is not a valid timestamp')
  if (typeof bundle.max_age_days !== 'number' || !Number.isFinite(bundle.max_age_days) || bundle.max_age_days <= 0) return void bad('bundle.max_age_days policy is invalid')

  // Exactly the three families, once each; RECOMPUTE freshness from period + as_of + policy.
  if (bundle.family_coverage.length !== ALL_FAMILIES.length) return void bad('family_coverage must contain exactly the three governed families')
  const cov = new Map<string, FamilyCoverage>()
  for (const f of bundle.family_coverage) {
    if (!(ALL_FAMILIES as string[]).includes(f.family)) return void bad(`unknown family in coverage: ${f.family}`)
    if (cov.has(f.family)) return void bad(`duplicate family coverage: ${f.family}`)
    if (f.as_of_iso !== bundle.as_of_iso) return void bad(`family coverage as_of inconsistent with bundle: ${f.family}`)
    const re = computeFreshness(f.period, f.available, now, bundle.max_age_days)
    if (re.age_days !== f.age_days || re.freshness !== f.freshness || re.fresh !== f.fresh) return void bad(`family coverage freshness not consistent with period/as_of/policy: ${f.family}`)
    cov.set(f.family, f)
  }
  const covOf = (family: FamilyName) => cov.get(family)!

  // Context facts: exact key allowlist, no dup/unknown, correct family, checksum/period/freshness == coverage.
  const ctx = new Map<string, AcceptedContextFact>()
  for (const f of bundle.accepted_context_facts) {
    if (ctx.has(f.key)) return void bad(`duplicate context key: ${f.key}`)
    const family = CTX_KEY_TO_FAMILY[f.key]
    if (!family) return void bad(`unknown context key (not in the exact allowlist): ${f.key}`)
    if (f.source_family !== family) return void bad(`context fact source_family not allowlisted for ${f.key}: ${f.source_family}`)
    if (f.acceptance_state !== 'accepted') return void bad(`non-accepted context fact: ${f.key}`)
    if (!HEX64.test(f.checksum)) return void bad(`context fact non-SHA-256 checksum: ${f.key}`)
    const c = covOf(family)
    if (!c.available || !c.fresh) return void bad(`context fact promoted from a non-fresh family: ${f.key}`)
    if (c.checksum !== f.checksum) return void bad(`context fact checksum != family coverage: ${f.key}`)
    if (!periodEq(c.period, f.period)) return void bad(`context fact period != family coverage: ${f.key}`)
    if (f.freshness !== c.freshness || !PROMOTABLE.includes(f.freshness)) return void bad(`context fact freshness inconsistent/stale: ${f.key}`)
    ctx.set(f.key, f)
  }
  // Exact family subset: a fresh family must expose ALL its keys and nothing else; a
  // non-fresh/absent family must expose NONE.
  for (const fam of ALL_FAMILIES) {
    const c = covOf(fam)
    const present = CTX_KEYS_BY_FAMILY[fam].filter((k) => ctx.has(k))
    if (c.available && c.fresh) {
      if (present.length !== CTX_KEYS_BY_FAMILY[fam].length) return void bad(`context inventory for ${fam} is not the exact required subset`)
    } else if (present.length > 0) {
      return void bad(`context facts present for a non-fresh family: ${fam}`)
    }
  }
  const ctxVal = (k: string): number | null => (ctx.has(k) ? ctx.get(k)!.value : null)

  // Recompute the canon (freshness recomputed above; values from context) and every gate.
  const apCov = covOf('appointments'), crmCov = covOf('crm_sales_gross'), dpCov = covOf('dealership_performance')
  const canon = buildCanon({
    apPresent: apCov.available, apFresh: apCov.fresh, apPeriod: apCov.period, apTotal: ctxVal('appointments.total'),
    crmPresent: crmCov.available, crmFresh: crmCov.fresh, crmPeriod: crmCov.period, crmTotal: ctxVal('crm.total_sum'), crmRows: ctxVal('crm.row_count'),
    dpPresent: dpCov.available, dpFresh: dpCov.fresh, dpPeriod: dpCov.period, dpTotal: ctxVal('dashboard.total_gross'), dpSold: ctxVal('dashboard.sold_in_period'),
  })
  if (canon.periods_compatible !== g.periods_compatible) return void bad('gates.periods_compatible does not match recomputed coverage')
  if (!periodEq(canon.governed_period, bundle.period)) return void bad('bundle.period does not match the recomputed governed period')
  const staleRecomputed = bundle.family_coverage.filter((f) => f.available && !f.fresh).map((f) => f.family).sort()
  if (JSON.stringify(staleRecomputed) !== JSON.stringify([...g.stale_families].sort())) return void bad('gates.stale_families does not match recomputed coverage')
  if (JSON.stringify(canon.cross_source_gross) !== JSON.stringify(bundle.cross_source_gross)) return void bad('cross_source_gross does not match recomputed value')
  if ((canon.cross_source_gross ? canon.cross_source_gross.reconciles : null) !== g.gross_cross_source_reconciles) return void bad('gates.gross_cross_source_reconciles forged')
  const block = deriveCompositeBlock(canon)
  if (block.blocked !== g.count_dependent_composites_blocked) return void bad('gates.count_dependent_composites_blocked forged')
  if (block.reason !== g.blocked_composite_reason) return void bad('gates.blocked_composite_reason forged')
  const exactPromo = deriveExactPromotion(canon.appt)
  if (exactPromo.promoted !== g.exact_conditions_promoted) return void bad('gates.exact_conditions_promoted forged')
  if (exactPromo.reason !== g.exact_conditions_block_reason) return void bad('gates.exact_conditions_block_reason forged')
  // single_period_no_trend is canonically ALWAYS true in this single-period layer (no
  // historical periods are carried), so a caller-supplied false is a forgery.
  if (g.single_period_no_trend !== SINGLE_PERIOD_NO_TREND) return void bad('gates.single_period_no_trend forged (canonically true in the single-period layer)')

  // Full discrepancy array recomputed and compared field-by-field (order + payload).
  if (JSON.stringify(deriveDiscrepancies(canon)) !== JSON.stringify(bundle.discrepancies)) return void bad('discrepancies do not match the canonical recomputation')

  // Observed KPIs: allowlisted source, provenance == coverage, value recomputed from context.
  for (const k of bundle.observed_kpis) {
    if (!NATIVE7_SET.has(k.slug)) return void bad(`observed KPI not a NATIVE7 slug: ${k.slug}`)
    if (QUARANTINED_SET.has(k.slug)) return void bad(`quarantined slug promoted as observed KPI: ${k.slug}`)
    if (k.is_sw_condition !== false) return void bad(`observed KPI mislabeled as an SW condition: ${k.slug}`)
    if (k.evidence_ref !== k.slug) return void bad(`observed KPI evidence_ref mismatch: ${k.slug}`)
    if (k.compatibility.dealer_profile !== bundle.profile) return void bad(`observed KPI dealer mismatch: ${k.slug}`)
    if (!HEX64.test(k.compatibility.checksum)) return void bad(`observed KPI non-SHA-256 checksum: ${k.slug}`)
    const allow = (KPI_ALLOW[k.slug] ?? []).find((a) => a.source === k.compatibility.source_family)
    if (!allow) return void bad(`observed KPI source_family not allowlisted for ${k.slug}: ${k.compatibility.source_family}`)
    const c = covOf(allow.family)
    if (!c.available || !c.fresh) return void bad(`observed KPI promoted from a non-fresh family: ${k.slug}`)
    if (c.checksum !== k.compatibility.checksum) return void bad(`observed KPI checksum != family coverage: ${k.slug}`)
    if (!periodEq(c.period, k.compatibility.period)) return void bad(`observed KPI period != family coverage: ${k.slug}`)
    if (k.compatibility.freshness !== c.freshness || !PROMOTABLE.includes(k.compatibility.freshness)) return void bad(`observed KPI freshness inconsistent/stale: ${k.slug}`)
    const expected = expectedKpiValue(k.slug, allow.source, ctxVal)
    if (expected == null) return void bad(`observed KPI value cannot be recomputed from context: ${k.slug}`)
    if (Math.abs(expected - k.value) > EPS) return void bad(`observed KPI value != recomputed: ${k.slug}`)
    if (k.display !== formatDisplay(k.value, k.unit)) return void bad(`observed KPI display != formatted value: ${k.slug}`)
  }

  // Exact conditions: fully recomputed from appointments context facts.
  const apTotal = ctxVal('appointments.total')
  for (const c of bundle.exact_conditions) {
    const spec = EXACT_SPEC[c.condition_id]
    if (!spec) return void bad(`unratified exact condition: ${c.condition_id}`)
    if (c.based_on_slug !== spec.based_on || c.evidence_ref !== spec.based_on) return void bad(`exact condition base/evidence mismatch: ${c.condition_id}`)
    if (c.compatibility.source_family !== FAM.APPT) return void bad(`exact condition source_family not appointments: ${c.condition_id}`)
    if (!apCov.available || !apCov.fresh) return void bad(`exact condition promoted from a non-fresh appointments family: ${c.condition_id}`)
    if (c.compatibility.checksum !== apCov.checksum) return void bad(`exact condition checksum != appointments coverage: ${c.condition_id}`)
    if (!periodEq(c.compatibility.period, apCov.period)) return void bad(`exact condition period != appointments coverage: ${c.condition_id}`)
    if (c.compatibility.freshness !== apCov.freshness || !PROMOTABLE.includes(c.compatibility.freshness)) return void bad(`exact condition freshness inconsistent/stale: ${c.condition_id}`)
    const num = ctxVal(c.condition_id === 'SW-032' ? 'appointments.show' : 'appointments.no_show')
    if (num == null || apTotal == null || apTotal === 0) return void bad(`exact condition cannot be recomputed from context: ${c.condition_id}`)
    const exp = computeExact(c.condition_id, num, apTotal)
    if (c.numerator !== exp.numerator || c.denominator !== exp.denominator) return void bad(`exact condition numerator/denominator forged: ${c.condition_id}`)
    if (Math.abs(c.value - exp.value) > EPS) return void bad(`exact condition value forged: ${c.condition_id}`)
    if (c.comparator !== exp.comparator || c.threshold !== exp.threshold) return void bad(`exact condition comparator/threshold forged: ${c.condition_id}`)
    if (c.fires !== exp.fires) return void bad(`exact condition 'fires' forged: ${c.condition_id}`)
    if (c.display !== exp.display) return void bad(`exact condition display forged: ${c.condition_id}`)
    const baseKpi = bundle.observed_kpis.find((k) => k.slug === c.based_on_slug)
    if (!baseKpi || Math.abs(baseKpi.value - exp.value) > EPS) return void bad(`exact condition ${c.condition_id} does not resolve to its accepted observed base fact`)
  }
  // Exact ID set: when promoted, EXACTLY the ratified ids [SW-032, SW-041] in canonical
  // order (rejects duplicates, missing, extras, wrong ids); zero when not promoted.
  const ids = bundle.exact_conditions.map((c) => c.condition_id)
  if (exactPromo.promoted) {
    if (JSON.stringify(ids) !== JSON.stringify([...RATIFIED_EXACT_CONDITIONS])) return void bad(`exact conditions are not exactly [${RATIFIED_EXACT_CONDITIONS.join(', ')}] in canonical order: got [${ids.join(', ')}]`)
  } else if (ids.length !== 0) {
    return void bad('exact conditions present while the promotion gate is false')
  }
}

function expectedKpiValue(slug: string, source: string, ctxVal: (k: string) => number | null): number | null {
  switch (slug) {
    case 'gross.total_sum':
      return source === FAM.CRM_PRECEDENCE ? ctxVal('crm.total_sum') : ctxVal('dashboard.total_gross')
    case 'gross.reconciliation_mismatches':
      return ctxVal('crm.reconciliation_mismatches')
    case 'dashboard.response_time_actual_avg_min':
      return ctxVal('dashboard.avg_actual_response_min')
    case 'appt.show_rate': { const t = ctxVal('appointments.total'); const n = ctxVal('appointments.show'); return t && n != null ? n / t : null }
    case 'appt.no_show_rate': { const t = ctxVal('appointments.total'); const n = ctxVal('appointments.no_show'); return t && n != null ? n / t : null }
    case 'appt.confirmed_rate': { const t = ctxVal('appointments.total'); const n = ctxVal('appointments.confirmed'); return t && n != null ? n / t : null }
    case 'appt.cancel_rate': { const t = ctxVal('appointments.total'); const n = ctxVal('appointments.cancelled'); return t && n != null ? n / t : null }
    default: return null
  }
}

export function acceptedEvidenceRefs(bundle: AcceptedFactsBundle): Set<string> {
  const s = new Set<string>()
  for (const k of bundle.observed_kpis) s.add(k.slug)
  for (const f of bundle.accepted_context_facts) s.add(f.key)
  for (const c of bundle.exact_conditions) s.add(c.based_on_slug)
  return s
}
