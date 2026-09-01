/**
 * Halo Data — deterministic CROSS-METRIC CONSULTANT SYNTHESIS (M2R R3, isolated dev).
 *
 * Turns ONE store's validated accepted-fact bundle into definition-compatible derived
 * measures + ranked consultant findings, while preserving the authoritative 295-condition
 * catalog accounting. STRICT rules:
 *   - Input MUST pass `validateAcceptedFactsBundle` (fail-closed). Uses ONLY accepted
 *     evidence: 21 context facts, NATIVE7 observed KPIs, actually-promoted SW-032/SW-041.
 *     Quarantined ROI/CAGE/Sales-Communication and every withheld slug are excluded; zero
 *     Service/Parts facts (permanent Sales-only boundary). Missing is never zero.
 *   - EVERY division uses safe ratio semantics (finite guard, denominator > 0). No measure,
 *     finding, display, or JSON value is ever NaN/Infinity; a zero/absent denominator yields
 *     an explicitly blocked measure with an internal reason, never invalid data.
 *   - Findings state observed counts/rates for ONE period plus a testable recommendation.
 *     They never claim causality, trend, a magnitude/savings amount, guest intent, or a
 *     guaranteed outcome; careful hypotheses live only in `does_not_prove` / internal fields.
 *   - Funnel measures are named snapshots; lead-to-sale is END-TO-END YIELD, not a transition
 *     stage. No "weakest stage / biggest lever / leakage" claim from a raw percentage.
 *   - Benchmarks come only from definition-COMPATIBLE governed in-repo material. The current
 *     appointment material is definition-INCOMPATIBLE, so it is NOT a benchmark: it is kept as
 *     internal `incompatible_reference` provenance and never compared to in customer copy.
 *   - Internal proof (lineage/availability/caveats) is separated from external customer copy;
 *     external copy uses no engineering words and cannot be produced from a caller-forged
 *     synthesis (the external entry takes a bundle and rebuilds+validates internally).
 *
 * Pure & deterministic (no Date.now/random; stable ordering).
 */
import {
  validateAcceptedFactsBundle,
  type AcceptedFactsBundle,
  type PeriodRef,
} from './accepted-facts'
import type { ImpactLens, FindingOwner } from './accepted-findings'
import { evaluateThreeLayers } from './halo-three-layer'

export const CATALOG_CONDITION_COUNT = 295
export const CATALOG_SPINE = 'docs/halo/contract/sw295-inventory.json (SW-001..SW-295, 885 rows; R1 spine)'

export type SynthesisCluster =
  | 'lead_funnel'
  | 'appointments'
  | 'showroom_conversion'
  | 'gross_economics'
  | 'responsiveness'
  | 'cross_cluster'
  | 'data_integrity'

export type MeasureUnit = 'ratio_0_1' | 'currency_usd' | 'count'

export type DerivedMeasure = {
  key: string
  label: string
  cluster: SynthesisCluster
  value: number
  display: string
  unit: MeasureUnit
  formula: string
  inputs: string[]
  compatibility: 'within_family' | 'cross_family_period_matched'
}

export type BlockedMeasure = {
  key: string
  label: string
  cluster: SynthesisCluster
  blocked_by: 'count_disagreement' | 'period_mismatch' | 'missing_source' | 'stale' | 'zero_denominator'
  reason: string
}

/** Benchmarks are ONLY definition-compatible governed material; none currently qualify. */
export type BenchmarkRef = { state: 'no_benchmark'; note: string }
/** Definition-INCOMPATIBLE governed reference retained as internal provenance (never a benchmark). */
export type IncompatibleReference = {
  note: string
  source_url: string
  source_published_or_updated: string
  definition_compatibility: 'incompatible'
}

export type ConsultantFinding = {
  id: string
  profile: string
  dealer_name: string
  clusters: SynthesisCluster[]
  lens: ImpactLens
  period: PeriodRef
  evidence_refs: string[]
  formula: string
  proves: string
  does_not_prove: string
  confidence: number
  expected_impact: number
  impact_score: number
  impact_rank: number
  impact_rationale: string
  business_consequence: string
  owner: FindingOwner
  next_action: string
  follow_up_metric: string
  inert_notification_candidate: string
  external_automation_candidate: string
  benchmark: BenchmarkRef
  /** Internal-only: a definition-incompatible governed reference (NOT a benchmark). */
  incompatible_reference?: IncompatibleReference
  external_copy: string
}

export type CatalogAccountability = {
  total: number
  spine: string
  directly_evaluated: string[]
  directly_evaluated_count: number
  accounted_only_count: number
  note: string
}

export type ConsultantSynthesis = {
  schema_version: '1.0.0'
  profile: string
  dealer_name: string
  dealer_id: string
  period: PeriodRef
  as_of_iso: string
  derived_measures: DerivedMeasure[]
  blocked_measures: BlockedMeasure[]
  findings: ConsultantFinding[]
  catalog_accountability: CatalogAccountability
  rejected_source_families: Array<{ family: string; state: string; reason: string }>
  assumptions: string[]
  freshness: { as_of_iso: string; max_age_days: number; families: Array<{ family: string; freshness: string; period: PeriodRef; fresh: boolean }> }
}

const BANNED_EXTERNAL = /\b(limitation|limitations|quarantine|quarantined|withheld|missing|issue|issues)\b/i
// Unsupported causality / intent / magnitude / outcome-promise patterns (scanned on the
// customer-facing + observation fields; careful hypotheses are allowed only in does_not_prove).
/**
 * Centralized causal/outcome/magnitude claim scanner. Shared by the R3 synthesis post-checks
 * AND the R4 customer-safety guard so no customer-facing field can reintroduce a claim R3
 * removed. Extended (R4 shadow) with outcome-promise phrases; every added token is verified
 * absent from the R3 findings/narrative text so R3 behavior is unchanged.
 */
export const PROHIBITED_CLAIM = /\b(because|due to|caused? by|drives?|driven by|leads? to|result(?:s|ed)? in|reliabl\w*|guarantee\w*|paying off|pays? off|large share|unlikely|(?:more |keeps? )?prospects? engaged|wins? deals?|speed wins|keeps? more|will (?:lift|increase|reduce|improve|boost|save)|\blifts?\b|\bboosts?\b|biggest (?:lever|opportunity)|weakest stage|most direct path|(?:additional|into|more) deliveries|\bproductive\b|ready buyers|\bprotects?\b|toward a visit|\bfrees?\b|\bfreeing\b|showroom time|attention will pay|more resilient|\bresilient\b)\b/i

function fmt(value: number, unit: MeasureUnit): string {
  if (unit === 'currency_usd') return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (unit === 'ratio_0_1') return `${(value * 100).toFixed(1)}%`
  return String(Math.round(value))
}
/** Safe ratio: finite, denominator strictly > 0, numerator present; else null (never NaN/Inf). */
function safeRatio(num: number | null, den: number | null): number | null {
  if (num == null || den == null || den <= 0) return null
  const v = num / den
  return Number.isFinite(v) ? v : null
}

const NO_BENCHMARK: BenchmarkRef = { state: 'no_benchmark', note: 'No definition-compatible external benchmark in-repo; judged dealer-relative and by funnel logic (non-scoring).' }
/** Definition-incompatible governed reference for a slug (internal provenance only, NOT a benchmark). */
function incompatibleReferenceFor(slug: string): IncompatibleReference | undefined {
  const rows = evaluateThreeLayers({ values: new Map(), slugs: [slug] })
  const ind = rows[0]?.industry
  if (ind && ind.state === 'directional_non_scoring' && ind.definition_compatibility === 'incompatible') {
    return { note: ind.note, source_url: ind.source_url, source_published_or_updated: ind.source_published_or_updated, definition_compatibility: 'incompatible' }
  }
  return undefined
}

const SINGLE_PERIOD_CAVEAT = 'a cause, a trend, a magnitude or savings amount, guest intent, an industry-superiority claim, or a guaranteed outcome (only one governed period is on file)'

export function buildConsultantSynthesis(bundle: AcceptedFactsBundle): ConsultantSynthesis {
  validateAcceptedFactsBundle(bundle) // FAIL-CLOSED

  const profile = bundle.profile
  const dealer = bundle.dealer_name
  const period = bundle.period
  const ctx = new Map(bundle.accepted_context_facts.map((f) => [f.key, f.value]))
  const cv = (k: string): number | null => (ctx.has(k) ? (ctx.get(k) as number) : null)

  const periodsCompatible = bundle.gates.periods_compatible
  const countBlocked = bundle.gates.count_dependent_composites_blocked

  const derived_measures: DerivedMeasure[] = []
  const blocked_measures: BlockedMeasure[] = []
  // A ratio measure: missing input -> omit; present-but-zero denominator -> EXPLICITLY blocked
  // (never NaN/Infinity, never a fabricated value); otherwise the finite ratio.
  const ratioMeasure = (key: string, label: string, cluster: SynthesisCluster, num: number | null, den: number | null, formula: string, inputs: string[]) => {
    if (num == null || den == null) return
    if (den <= 0) { blocked_measures.push({ key, label, cluster, blocked_by: 'zero_denominator', reason: 'denominator is zero; ratio not computable (missing, not zero)' }); return }
    const v = num / den
    if (!Number.isFinite(v)) { blocked_measures.push({ key, label, cluster, blocked_by: 'zero_denominator', reason: 'non-finite ratio' }); return }
    derived_measures.push({ key, label, cluster, value: v, display: fmt(v, 'ratio_0_1'), unit: 'ratio_0_1', formula, inputs, compatibility: 'within_family' })
  }
  // A scalar (already-computed) measure: null -> omit; non-finite -> blocked; else push.
  const scalarMeasure = (key: string, label: string, cluster: SynthesisCluster, value: number | null, unit: MeasureUnit, formula: string, inputs: string[]) => {
    if (value == null) return
    if (!Number.isFinite(value)) { blocked_measures.push({ key, label, cluster, blocked_by: 'zero_denominator', reason: 'non-finite value' }); return }
    derived_measures.push({ key, label, cluster, value, display: fmt(value, unit), unit, formula, inputs, compatibility: 'within_family' })
  }

  // ── Lead funnel (Dashboard family; each a correctly named snapshot) ────────────────────
  const leads = cv('dashboard.leads'), apptsSet = cv('dashboard.appts_set'), apptsShown = cv('dashboard.appts_shown'), visits = cv('dashboard.total_visits'), visitsSold = cv('dashboard.visits_sold'), soldDash = cv('dashboard.sold_in_period')
  ratioMeasure('funnel.appointment_set_rate', 'Appointment-set rate (set / leads)', 'lead_funnel', apptsSet, leads, 'dashboard.appts_set / dashboard.leads', ['dashboard.appts_set', 'dashboard.leads'])
  ratioMeasure('funnel.shown_through_rate', 'Shown-through rate (shown / set)', 'appointments', apptsShown, apptsSet, 'dashboard.appts_shown / dashboard.appts_set', ['dashboard.appts_shown', 'dashboard.appts_set'])
  ratioMeasure('funnel.visit_rate', 'Visit rate (visits / leads)', 'lead_funnel', visits, leads, 'dashboard.total_visits / dashboard.leads', ['dashboard.total_visits', 'dashboard.leads'])
  // Visit-to-sale uses the governed Dashboard visits_sold numerator (NOT sold_in_period).
  ratioMeasure('funnel.visit_to_sale_rate', 'Visit-to-sale rate (visits-sold / visits)', 'showroom_conversion', visitsSold, visits, 'dashboard.visits_sold / dashboard.total_visits', ['dashboard.visits_sold', 'dashboard.total_visits'])
  ratioMeasure('funnel.lead_to_sale_yield', 'Lead-to-sale yield, end-to-end (sold / leads)', 'lead_funnel', soldDash, leads, 'dashboard.sold_in_period / dashboard.leads', ['dashboard.sold_in_period', 'dashboard.leads'])

  // ── Appointments (family) — all divisions safe, including the gap ──────────────────────
  const apTotal = cv('appointments.total'), apShow = cv('appointments.show'), apNoShow = cv('appointments.no_show'), apConf = cv('appointments.confirmed'), apCancel = cv('appointments.cancelled'), apResched = cv('appointments.rescheduled'), apCompleted = cv('appointments.completed')
  const confirmationRate = safeRatio(apConf, apTotal)
  const showRate = safeRatio(apShow, apTotal)
  ratioMeasure('appt.confirmation_rate', 'Confirmation rate (confirmed / total)', 'appointments', apConf, apTotal, 'appointments.confirmed / appointments.total', ['appointments.confirmed', 'appointments.total'])
  ratioMeasure('appt.confirmation_gap', 'Confirmation gap (unconfirmed / total)', 'appointments', apTotal != null && apConf != null ? apTotal - apConf : null, apTotal, '(appointments.total - appointments.confirmed) / appointments.total', ['appointments.total', 'appointments.confirmed'])
  ratioMeasure('appt.show_rate', 'Show rate (shown / total)', 'appointments', apShow, apTotal, 'appointments.show / appointments.total', ['appointments.show', 'appointments.total'])
  ratioMeasure('appt.no_show_rate', 'No-show rate (no-show / total)', 'appointments', apNoShow, apTotal, 'appointments.no_show / appointments.total', ['appointments.no_show', 'appointments.total'])
  ratioMeasure('appt.cancel_rate', 'Cancel rate (cancelled / total)', 'appointments', apCancel, apTotal, 'appointments.cancelled / appointments.total', ['appointments.cancelled', 'appointments.total'])
  ratioMeasure('appt.reschedule_rate', 'Reschedule rate (rescheduled / total)', 'appointments', apResched, apTotal, 'appointments.rescheduled / appointments.total', ['appointments.rescheduled', 'appointments.total'])
  ratioMeasure('appt.completion_rate', 'Completion rate (completed / total)', 'appointments', apCompleted, apTotal, 'appointments.completed / appointments.total', ['appointments.completed', 'appointments.total'])

  // ── Gross economics (CRM family; avg-per-sale count-gated) ─────────────────────────────
  const crmFront = cv('crm.front_sum'), crmBack = cv('crm.back_sum'), crmTotal = cv('crm.total_sum'), crmRows = cv('crm.row_count')
  scalarMeasure('gross.total', 'Total gross (CRM per-deal sum)', 'gross_economics', crmTotal, 'currency_usd', 'crm.total_sum', ['crm.total_sum'])
  ratioMeasure('gross.front_mix', 'Front-gross mix (front / total)', 'gross_economics', crmFront, crmTotal, 'crm.front_sum / crm.total_sum', ['crm.front_sum', 'crm.total_sum'])
  ratioMeasure('gross.back_mix', 'Back-gross mix (back / total)', 'gross_economics', crmBack, crmTotal, 'crm.back_sum / crm.total_sum', ['crm.back_sum', 'crm.total_sum'])
  if (crmTotal != null && crmRows != null) {
    if (crmRows <= 0) blocked_measures.push({ key: 'gross.avg_per_sale', label: 'Average gross per CRM sale', cluster: 'gross_economics', blocked_by: 'zero_denominator', reason: 'zero CRM sale rows; average not computable (missing, not zero)' })
    else if (countBlocked) blocked_measures.push({ key: 'gross.avg_per_sale', label: 'Average gross per CRM sale', cluster: 'gross_economics', blocked_by: 'count_disagreement', reason: bundle.gates.blocked_composite_reason ?? 'unit count disputed across accepted sources' })
    else scalarMeasure('gross.avg_per_sale', 'Average gross per CRM sale', 'gross_economics', crmTotal / crmRows, 'currency_usd', 'crm.total_sum / crm.row_count', ['crm.total_sum', 'crm.row_count'])
  }

  // ── Responsiveness (Dashboard family) ─────────────────────────────────────────────────
  const respMin = cv('dashboard.avg_actual_response_min')
  scalarMeasure('responsiveness.avg_actual_response_min', 'Avg actual response (minutes)', 'responsiveness', respMin, 'count', 'dashboard.avg_actual_response_min', ['dashboard.avg_actual_response_min'])

  // ── Cross-cluster ─────────────────────────────────────────────────────────────────────
  const confVsShowGap = confirmationRate != null && showRate != null && Number.isFinite(confirmationRate - showRate) ? confirmationRate - showRate : null
  scalarMeasure('cross.confirmation_vs_show_gap', 'Confirmed-not-shown gap (confirmation rate - show rate)', 'cross_cluster', confVsShowGap, 'ratio_0_1', 'appt.confirmation_rate - appt.show_rate', ['appointments.confirmed', 'appointments.show', 'appointments.total'])
  if (crmTotal != null && soldDash != null && soldDash > 0) {
    if (!periodsCompatible) blocked_measures.push({ key: 'cross.gross_per_delivered', label: 'Gross per delivered unit', cluster: 'cross_cluster', blocked_by: 'period_mismatch', reason: 'CRM and Dashboard periods are not compatible; cross-source composite blocked.' })
    else if (countBlocked || bundle.gates.gross_cross_source_reconciles !== true) blocked_measures.push({ key: 'cross.gross_per_delivered', label: 'Gross per delivered unit', cluster: 'cross_cluster', blocked_by: 'count_disagreement', reason: bundle.gates.blocked_composite_reason ?? 'cross-source unit count/gross not reconciled' })
    else { const v = crmTotal / soldDash; if (Number.isFinite(v)) derived_measures.push({ key: 'cross.gross_per_delivered', label: 'Gross per delivered unit (CRM gross / Dashboard sold)', cluster: 'cross_cluster', value: v, display: fmt(v, 'currency_usd'), unit: 'currency_usd', formula: 'crm.total_sum / dashboard.sold_in_period', inputs: ['crm.total_sum', 'dashboard.sold_in_period'], compatibility: 'cross_family_period_matched' }) }
  }

  // ── Findings ──────────────────────────────────────────────────────────────────────────
  const mv = (k: string) => derived_measures.find((m) => m.key === k)
  const sw032 = bundle.exact_conditions.find((c) => c.condition_id === 'SW-032')
  const sw041 = bundle.exact_conditions.find((c) => c.condition_id === 'SW-041')
  const drafts: Array<Omit<ConsultantFinding, 'impact_rank' | 'impact_score'>> = []

  // 1. Show below the ratified floor (SW-032 fired).
  if (sw032 && sw032.fires) {
    drafts.push({
      id: 'r3-appt-show-leakage', profile, dealer_name: dealer, clusters: ['appointments'], lens: 'prospect_friction', period,
      evidence_refs: ['appt.show_rate', 'appointments.show', 'appointments.total'],
      formula: 'appointments.show / appointments.total (SW-032 threshold < 55%)',
      proves: `${sw032.numerator} of ${sw032.denominator} booked appointments were recorded as shown (show rate ${sw032.display}), below the ratified SW-032 55% floor for this period.`,
      does_not_prove: `${cap(SINGLE_PERIOD_CAVEAT)}.`,
      confidence: 0.7, expected_impact: 5,
      impact_rationale: 'Recorded shows are the appointments that reached the showroom; the ratified floor was not met this period.',
      business_consequence: 'The recorded show count is the number of booked appointments that reached the showroom this period.',
      owner: 'Sales Manager', next_action: `Review the confirmation and reminder steps for the ${sw032.denominator} booked appointments this period.`,
      follow_up_metric: 'appt.show_rate',
      inert_notification_candidate: `INERT (not sent): notify the Sales Manager that the recorded show rate ${sw032.display} is below the 55% floor this period.`,
      external_automation_candidate: 'RECOMMENDATION ONLY (cannot execute): a guest reminder-cadence step, subject to explicit approval.',
      benchmark: NO_BENCHMARK, incompatible_reference: incompatibleReferenceFor('appt.show_rate'),
      external_copy: 'Review how booked appointments are confirmed and reminded. A structured confirmation routine is a practical step to test against next period\'s recorded show rate.',
    })
  }

  // 2. No-show above the ratified ceiling (SW-041 fired) + effort sibling.
  if (sw041 && sw041.fires) {
    drafts.push({
      id: 'r3-no-show-handoff', profile, dealer_name: dealer, clusters: ['appointments'], lens: 'handoff_process', period,
      evidence_refs: ['appt.no_show_rate', 'appointments.no_show', 'appointments.total'],
      formula: 'appointments.no_show / appointments.total (SW-041 threshold > 45%)',
      proves: `${sw041.numerator} of ${sw041.denominator} booked appointments were recorded as no-shows (no-show rate ${sw041.display}), above the ratified SW-041 45% ceiling for this period.`,
      does_not_prove: `${cap(SINGLE_PERIOD_CAVEAT)}.`,
      confidence: 0.7, expected_impact: 4,
      impact_rationale: 'A same-day recovery step is a defined process the manager can own; effect is testable next period.',
      business_consequence: 'The recorded no-show count is the number of booked appointments not recorded as arriving this period.',
      owner: 'Sales Manager', next_action: `Define a same-day follow-up step for no-shows and review the recorded no-show rate next period.`,
      follow_up_metric: 'appt.no_show_rate',
      inert_notification_candidate: 'INERT (not sent): notify the Sales Manager on a same-day recorded no-show.',
      external_automation_candidate: 'RECOMMENDATION ONLY (cannot execute): a same-day reschedule step, subject to explicit approval.',
      benchmark: NO_BENCHMARK, incompatible_reference: incompatibleReferenceFor('appt.no_show_rate'),
      external_copy: 'Consider a defined same-day follow-up step for guests who did not arrive, and compare the recorded no-show rate next period.',
    })
    drafts.push({
      id: 'r3-no-show-effort-reduction', profile, dealer_name: dealer, clusters: ['appointments'], lens: 'expense_reduction', period,
      evidence_refs: ['appt.no_show_rate', 'appointments.no_show'],
      formula: 'appointments.no_show (count) contextualized by appointments.total',
      proves: `${sw041!.numerator} booked appointments were recorded as no-shows this period.`,
      does_not_prove: `A dollar amount, wasted-effort quantity, guest intent, ${SINGLE_PERIOD_CAVEAT}.`,
      confidence: 0.55, expected_impact: 3,
      impact_rationale: 'No-show volume is an input a manager can weigh when allocating confirmation effort.',
      business_consequence: 'No-show volume is one input a manager can weigh when allocating confirmation effort this period.',
      owner: 'Sales Manager', next_action: 'Prioritize confirmation effort for this period\'s bookings and review the recorded no-show count next period.',
      follow_up_metric: 'appt.no_show_rate',
      inert_notification_candidate: 'INERT (not sent): weekly summary of recorded no-show volume to the Sales Manager.',
      external_automation_candidate: 'RECOMMENDATION ONLY (cannot execute): prioritized confirmation outreach, subject to approval.',
      benchmark: NO_BENCHMARK,
      external_copy: 'Use your recorded no-show count to decide where confirmation effort is worth prioritizing, and review the change next period.',
    })
  }

  // 3. Confirmed-not-shown gap.
  const gap = mv('cross.confirmation_vs_show_gap')
  if (gap && gap.value > 0.1) {
    drafts.push({
      id: 'r3-confirmation-show-gap', profile, dealer_name: dealer, clusters: ['cross_cluster', 'appointments'], lens: 'training', period,
      evidence_refs: ['appointments.confirmed', 'appointments.show', 'appointments.total'],
      formula: 'appt.confirmation_rate - appt.show_rate',
      proves: `Confirmation rate exceeded show rate by ${gap.display} this period.`,
      does_not_prove: `${cap(SINGLE_PERIOD_CAVEAT)}.`,
      confidence: 0.6, expected_impact: 3,
      impact_rationale: 'A confirm-to-show gap is a defined coaching focus; effect is testable next period.',
      business_consequence: 'The gap is the difference between recorded confirmations and recorded arrivals this period.',
      owner: 'Sales Manager', next_action: 'Review reminder timing and day-of steps, and compare the gap next period.',
      follow_up_metric: 'appt.show_rate',
      inert_notification_candidate: 'INERT (not sent): flag the confirm-to-show gap in the weekly coaching note.',
      external_automation_candidate: 'RECOMMENDATION ONLY (cannot execute): a day-of reminder step, subject to approval.',
      benchmark: NO_BENCHMARK,
      external_copy: 'Compare how many guests confirm versus how many are recorded as arriving, and test whether adjusting reminder timing changes the gap.',
    })
  }

  // 4. Response-time context.
  const resp = mv('responsiveness.avg_actual_response_min')
  if (resp) {
    drafts.push({
      id: 'r3-response-time-exposure', profile, dealer_name: dealer, clusters: ['responsiveness', 'cross_cluster'], lens: 'prospect_friction', period,
      evidence_refs: ['dashboard.avg_actual_response_min'],
      formula: 'dashboard.avg_actual_response_min (minutes)',
      proves: `Average actual response time was ${resp.display} minutes this period.`,
      does_not_prove: `That response time affected any outcome, guest intent, ${SINGLE_PERIOD_CAVEAT}. This is not a first-response-time metric.`,
      confidence: 0.5, expected_impact: 3,
      impact_rationale: 'Response time is a workflow measure with a dealer-relative target the team can set.',
      business_consequence: 'Average response time is a workflow measure the team can track period over period.',
      owner: 'Sales Manager', next_action: 'Set a dealer-relative response-time target and review next period.',
      follow_up_metric: 'dashboard.avg_actual_response_min',
      inert_notification_candidate: 'INERT (not sent): weekly response-time summary to the Sales Manager (no ratified threshold).',
      external_automation_candidate: 'RECOMMENDATION ONLY (cannot execute): a lead-response prompt, subject to approval.',
      benchmark: NO_BENCHMARK,
      external_copy: 'Track your average response time and set a dealer-relative target to review next period.',
    })
  }

  // 5. Funnel snapshot review — named snapshots only; NO weakest-stage/biggest-lever claim.
  const setR = mv('funnel.appointment_set_rate'), shownR = mv('funnel.shown_through_rate'), v2s = mv('funnel.visit_to_sale_rate'), yield_ = mv('funnel.lead_to_sale_yield')
  if (setR && yield_) {
    const parts: string[] = []
    if (setR) parts.push(`appointment-set rate ${setR.display}`)
    if (shownR) parts.push(`shown-through rate ${shownR.display}`)
    if (v2s) parts.push(`visit-to-sale rate ${v2s.display}`)
    drafts.push({
      id: 'r3-funnel-review', profile, dealer_name: dealer, clusters: ['lead_funnel', 'showroom_conversion'], lens: 'sales_gross_lift', period,
      evidence_refs: ['dashboard.leads', 'dashboard.appts_set', 'dashboard.appts_shown', 'dashboard.total_visits', 'dashboard.visits_sold', 'dashboard.sold_in_period'],
      formula: 'named transition snapshots (set/leads, shown/set, visits_sold/visits) and end-to-end yield (sold/leads)',
      proves: `This period: ${parts.join(', ')}; end-to-end lead-to-sale yield ${yield_.display}. These are distinct named snapshots, not interchangeable stages.`,
      does_not_prove: `Which step is the largest opportunity, where leakage occurs, a cause, or a guaranteed lift; the lowest raw percentage does not identify the biggest lever. Lead-to-sale is end-to-end yield, not a transition stage. ${cap(SINGLE_PERIOD_CAVEAT)}.`,
      confidence: 0.5, expected_impact: 4,
      impact_rationale: 'Reviewing the funnel snapshots together supports a structured, bounded diagnostic conversation.',
      business_consequence: 'These are period snapshots of distinct funnel steps and the end-to-end yield.',
      owner: 'Sales Manager', next_action: 'Walk the funnel steps in order in the weekly meeting and review each snapshot next period.',
      follow_up_metric: 'funnel.lead_to_sale_yield',
      inert_notification_candidate: 'INERT (not sent): include the funnel snapshots in the weekly review.',
      external_automation_candidate: 'RECOMMENDATION ONLY (cannot execute): a structured funnel-review checklist, subject to approval.',
      benchmark: NO_BENCHMARK,
      external_copy: 'Review your funnel steps together - set, show, and close - alongside your overall lead-to-sale yield, and track each snapshot next period.',
    })
  }

  // 6. Gross mix.
  const frontMix = mv('gross.front_mix'), backMix = mv('gross.back_mix')
  if (frontMix && crmFront != null) {
    const frontNegative = crmFront < 0
    drafts.push({
      id: 'r3-gross-mix', profile, dealer_name: dealer, clusters: ['gross_economics'], lens: frontNegative ? 'sales_gross_lift' : 'training', period,
      evidence_refs: ['crm.front_sum', 'crm.back_sum', 'crm.total_sum'],
      formula: 'crm.front_sum / crm.total_sum (front mix); crm.back_sum / crm.total_sum (back mix)',
      proves: frontNegative
        ? `Front gross was recorded below zero (${fmt(crmFront, 'currency_usd')}) this period; back-gross made up ${backMix?.display ?? 'n/a'} of total.`
        : `Front-gross made up ${frontMix.display} of total gross this period.`,
      does_not_prove: `${cap(SINGLE_PERIOD_CAVEAT)}.`,
      confidence: frontNegative ? 0.65 : 0.5, expected_impact: frontNegative ? 4 : 2,
      impact_rationale: frontNegative ? 'Front-end desking is a defined review focus when front gross is recorded below zero.' : 'Front/back balance is a defined coaching focus in deal reviews.',
      business_consequence: frontNegative ? 'This period, front gross was negative and back-end gross made up the majority of total gross.' : 'Front/back mix is a snapshot of gross composition this period.',
      owner: 'Sales Manager', next_action: frontNegative ? 'Review front-end desking on this period\'s deals.' : 'Review front/back balance in deal reviews.',
      follow_up_metric: 'gross.total_sum',
      inert_notification_candidate: 'INERT (not sent): weekly gross-mix summary to the Sales Manager.',
      external_automation_candidate: 'RECOMMENDATION ONLY (cannot execute): deal-desk review prompts, subject to approval.',
      benchmark: NO_BENCHMARK,
      external_copy: frontNegative
        ? 'Review front-end desking on recent deals; front gross was recorded below zero this period.'
        : 'Review your front/back gross mix in deal reviews.',
    })
  }

  // 7. Count reconciliation — lineage cites crm.row_count + dashboard.sold_in_period + gross.total_sum.
  for (const d of bundle.discrepancies) {
    if (d.kind !== 'count_disagreement') continue
    drafts.push({
      id: 'r3-count-reconciliation', profile, dealer_name: dealer, clusters: ['data_integrity', 'gross_economics'], lens: 'handoff_process', period,
      evidence_refs: ['crm.row_count', 'dashboard.sold_in_period', 'gross.total_sum'],
      formula: 'crm.row_count vs dashboard.sold_in_period (same period); gross.total_sum reconciliation stated separately',
      proves: `CRM delivered-sale rows (${d.crm_rows}) and Dashboard sold-in-period (${d.dashboard_sold}) disagree for this period. Total gross ${d.gross_reconciles ? 'reconciles across sources within tolerance' : 'does not reconcile across sources'}.`,
      does_not_prove: 'Which source\'s unit count is correct; per-unit and close-rate composites are blocked this period.',
      confidence: 0.8, expected_impact: 3,
      impact_rationale: 'A single trusted sold count is required before per-unit or close-rate measures are reported.',
      business_consequence: 'A single trusted sold count is required before per-unit or close-rate measures are reported.',
      owner: 'GM', next_action: `Reconcile the CRM delivered rows (${d.crm_rows}) against the Dashboard sold figure (${d.dashboard_sold}).`,
      follow_up_metric: 'gross.total_sum',
      inert_notification_candidate: `INERT (not sent): flag the GM that two accepted sources disagree on the sold count (${d.crm_rows} vs ${d.dashboard_sold}).`,
      external_automation_candidate: 'RECOMMENDATION ONLY (cannot execute): a reporting reconciliation checklist.',
      benchmark: NO_BENCHMARK,
      external_copy: 'Align your reports on a single trusted sold count so per-deal and close-rate views match across your reports.',
    })
  }

  // 8. Positive control: neither ratified condition fired.
  if (sw032 && sw041 && !sw032.fires && !sw041.fires) {
    drafts.push({
      id: 'r3-appointments-on-track', profile, dealer_name: dealer, clusters: ['appointments'], lens: 'training', period,
      evidence_refs: ['appt.show_rate', 'appt.no_show_rate'],
      formula: 'appt.show_rate >= 55% and appt.no_show_rate <= 45%',
      proves: `Show rate ${sw032.display} and no-show rate ${sw041.display} are within the ratified thresholds this period; neither SW-032 nor SW-041 fired.`,
      does_not_prove: `Sustained performance or ${SINGLE_PERIOD_CAVEAT}.`,
      confidence: 0.5, expected_impact: 2,
      impact_rationale: 'Both ratified appointment conditions are within range this period.',
      business_consequence: 'Both ratified appointment conditions are within range this period.',
      owner: 'Sales Manager', next_action: 'Continue the current confirmation steps and keep accumulating governed periods.',
      follow_up_metric: 'appt.show_rate',
      inert_notification_candidate: 'INERT (not sent): weekly appointment-status confirmation to the Sales Manager.',
      external_automation_candidate: 'RECOMMENDATION ONLY (cannot execute): none needed while within range.',
      benchmark: NO_BENCHMARK, incompatible_reference: incompatibleReferenceFor('appt.show_rate'),
      external_copy: 'Your appointment show and no-show rates are within range this period - keep the current confirmation steps and review again next period.',
    })
  }

  const scored = drafts.map((d) => ({ ...d, impact_score: Math.round(d.expected_impact * d.confidence * 100) / 100 }))
  scored.sort((a, b) => b.impact_score - a.impact_score)
  const findings: ConsultantFinding[] = scored.map((d, i) => ({ ...d, impact_rank: i + 1 }))

  // ── Fail-closed post-checks ────────────────────────────────────────────────────────────
  const acceptedRefs = new Set<string>([...bundle.observed_kpis.map((k) => k.slug), ...bundle.accepted_context_facts.map((f) => f.key)])
  for (const f of findings) {
    const dataFields = [f.external_copy, f.proves, f.business_consequence, f.next_action]
    if (/service|parts/i.test(dataFields.join(' ') + f.clusters.join(' '))) throw new Error(`R3 finding ${f.id} references Service/Parts`)
    if (BANNED_EXTERNAL.test(f.external_copy)) throw new Error(`R3 finding ${f.id} external_copy uses an engineering word`)
    for (const t of dataFields) if (PROHIBITED_CLAIM.test(t)) throw new Error(`R3 finding ${f.id} uses an unsupported causal/magnitude claim: ${t}`)
    for (const ref of f.evidence_refs) if (!acceptedRefs.has(ref)) throw new Error(`R3 finding ${f.id} cites an unresolved evidence ref: ${ref}`)
    if (f.benchmark.state !== 'no_benchmark') throw new Error(`R3 finding ${f.id} emitted a benchmark from non-compatible material`)
    if (f.incompatible_reference && f.incompatible_reference.definition_compatibility !== 'incompatible') throw new Error(`R3 finding ${f.id} mislabeled an incompatible reference`)
  }
  for (const m of derived_measures) { for (const inp of m.inputs) if (!acceptedRefs.has(inp)) throw new Error(`R3 measure ${m.key} uses an unaccepted input: ${inp}`); if (!Number.isFinite(m.value)) throw new Error(`R3 measure ${m.key} is not finite`) }

  const directly = bundle.exact_conditions.map((c) => c.condition_id)
  const catalog_accountability: CatalogAccountability = {
    total: CATALOG_CONDITION_COUNT, spine: CATALOG_SPINE, directly_evaluated: directly, directly_evaluated_count: directly.length, accounted_only_count: CATALOG_CONDITION_COUNT - directly.length,
    note: `Only the ratified conditions ${directly.join('/') || '(none - appointments not promoted)'} are directly evaluated this period; the remaining ${CATALOG_CONDITION_COUNT - directly.length} are accounted-only via the R1 inventory spine. Derived measures are definition-compatible context, not ratified SW firings.`,
  }
  const rejected_source_families = Array.from(bundle.withheld.reduce((m, w) => { const k = `${w.source_family}::${w.sub_state}`; if (!m.has(k)) m.set(k, { family: w.source_family, state: w.sub_state, reason: w.reason }); return m }, new Map<string, { family: string; state: string; reason: string }>()).values())
  rejected_source_families.push({ family: 'Service / Parts (any source)', state: 'excluded', reason: 'Permanent Sales-only boundary; zero Service/Parts facts or conclusions enter a Sales profile.' })

  const synthesis: ConsultantSynthesis = {
    schema_version: '1.0.0', profile, dealer_name: dealer, dealer_id: bundle.dealer_id, period, as_of_iso: bundle.as_of_iso,
    derived_measures, blocked_measures, findings, catalog_accountability, rejected_source_families,
    assumptions: [
      'Single governed period: no trend, causal, magnitude/savings, guest-intent, industry-superiority, or guaranteed-outcome claims.',
      'Every division uses safe ratio semantics; a zero/absent denominator yields a blocked measure, never an invalid non-finite value.',
      'Funnel measures are named snapshots; lead-to-sale is end-to-end yield, not a transition stage; no weakest-stage/biggest-lever claim.',
      'Benchmarks require definition-compatible governed material; the current appointment reference is incompatible and kept only as internal provenance, never a benchmark or a customer comparison.',
      'Count-dependent composites are blocked when accepted sources disagree on the unit count; separately-reconciled gross is preserved.',
      'Only accepted facts power measures/findings; quarantined ROI/CAGE/Sales-Communication and Service/Parts are excluded.',
    ],
    freshness: { as_of_iso: bundle.as_of_iso, max_age_days: bundle.max_age_days, families: bundle.family_coverage.map((f) => ({ family: f.family, freshness: f.freshness, period: f.period, fresh: f.fresh })) },
  }
  // Belt-and-suspenders: no NaN/Infinity anywhere in the emitted structure.
  assertAllFinite(synthesis)
  return synthesis
}

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1) }
function assertAllFinite(v: unknown, path = '$'): void {
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error(`non-finite number at ${path}`); return }
  if (Array.isArray(v)) { v.forEach((x, i) => assertAllFinite(x, `${path}[${i}]`)); return }
  if (v && typeof v === 'object') { for (const [k, x] of Object.entries(v)) assertAllFinite(x, `${path}.${k}`) }
}

// ── External narrative — bypass-proof: takes a BUNDLE and rebuilds+validates internally ──
export type ExternalNarrative = {
  profile: string
  dealer_name: string
  headline: string
  opportunities: Array<{ rank: number; title: string; message: string; owner: string; next_step: string }>
  closing: string
}

export function toExternalNarrative(bundle: AcceptedFactsBundle): ExternalNarrative {
  // A caller-constructed/tampered synthesis can NEVER reach customer output: we rebuild from the
  // (independently validated) accepted-fact bundle and derive external copy from that alone.
  const s = buildConsultantSynthesis(bundle)
  const opportunities = s.findings.map((f) => ({ rank: f.impact_rank, title: titleFor(f), message: f.external_copy, owner: f.owner, next_step: f.next_action }))
  const narrative: ExternalNarrative = {
    profile: s.profile, dealer_name: s.dealer_name,
    headline: `${s.dealer_name}: your prioritized Sales opportunities for the week`,
    opportunities,
    closing: 'These are prioritized, dealer-relative opportunities based on your own governed Sales results. Each is a recommendation your team can act on and review next period.',
  }
  const blob = JSON.stringify(narrative)
  if (BANNED_EXTERNAL.test(blob)) throw new Error('external narrative uses an engineering word')
  if (/service|parts/i.test(blob)) throw new Error('external narrative references Service/Parts')
  if (PROHIBITED_CLAIM.test(opportunities.map((o) => o.message + ' ' + o.next_step).join(' '))) throw new Error('external narrative uses an unsupported causal/magnitude claim')
  return narrative
}

function titleFor(f: ConsultantFinding): string {
  switch (f.lens) {
    case 'sales_gross_lift': return 'Grow sales and gross'
    case 'expense_reduction': return 'Focus your team\'s effort'
    case 'training': return 'Coach for consistency'
    case 'handoff_process': return 'Tighten your process'
    case 'prospect_friction': return 'Smooth the buyer path'
    default: return 'Opportunity'
  }
}
