/**
 * Halo Data — deterministic INTERNAL consultant findings (M2R R2, isolated dev).
 *
 * Turns ONE store's accepted-fact bundle into ranked, owner-specific internal action
 * candidates. STRICT rules:
 *   - Findings are derived ONLY from ACCEPTED facts (exact conditions + observed KPIs +
 *     cross-source discrepancies). Quarantined ROI/CAGE/Sales-Communication and every
 *     withheld/no-current slug can NEVER feed a finding, a score, an alert, or a
 *     customer narrative.
 *   - Only a RATIFIED Semantic-Watchdog condition may "fire" (SW-032 / SW-041). An
 *     observed KPI may contextualize but never fires an SW condition on its own.
 *   - Single governed period => no trend, no causal/ordered claim, no benchmark score.
 *   - A count-dependent composite is skipped when the store's accepted sources disagree
 *     on the unit count (absolute figures that reconcile stay usable).
 *   - Every finding states what the data PROVES and what it DOES NOT prove, an owner,
 *     a next action, a follow-up metric, and an INERT notification/automation preview
 *     (nothing is sent, dispatched, or activated).
 *   - Internal only — this is NOT a customer document. Sales-only; no Service/Parts.
 *
 * Deterministic: pure over the bundle; ranked by expected_impact x confidence with a
 * stable tie order. ASCII hyphens only (PDF-QA parity).
 */
import {
  acceptedEvidenceRefs,
  validateAcceptedFactsBundle,
  AcceptedFactsValidationError,
  type AcceptedFactsBundle,
  type AcceptedExactCondition,
  type AcceptedObservedKpi,
} from './accepted-facts'

/** Consultant priority lenses (ranking taxonomy, not a score). */
export type ImpactLens =
  | 'sales_gross_lift'
  | 'expense_reduction'
  | 'training'
  | 'handoff_process'
  | 'prospect_friction'

export type FindingOwner = 'GM' | 'Sales Manager' | 'Salesperson'

export type AcceptedFinding = {
  rank: number
  score: number
  id: string
  title: string
  lens: ImpactLens
  owner: FindingOwner
  /** RATIFIED SW conditions this finding rests on ([] when it only contextualizes). */
  fired_conditions: string[]
  /** Accepted slug(s) the finding cites — NEVER a withheld/quarantined slug. */
  evidence_refs: string[]
  confidence: number
  expected_impact: number // 1..5
  proves: string
  does_not_prove: string
  next_action: string
  follow_up_metric: string
  /** INERT preview text — nothing is actually sent/dispatched. */
  inert_notification_preview: string
  /** INERT preview text — nothing is actually activated. */
  inert_automation_preview: string
}

type Draft = Omit<AcceptedFinding, 'rank' | 'score'>

const SINGLE_PERIOD_CAVEAT =
  'a cause, a trend (only one governed period is on file), or any benchmark ranking'

export function buildAcceptedFindings(bundle: AcceptedFactsBundle): AcceptedFinding[] {
  // FAIL-CLOSED: independently validate the input bundle (do not trust caller shape).
  validateAcceptedFactsBundle(bundle)

  const drafts: Draft[] = []
  const dealer = bundle.dealer_name
  const acceptedRefs = acceptedEvidenceRefs(bundle)
  const grossRef = bundle.observed_kpis.some((k) => k.slug === 'gross.total_sum')
    ? 'gross.total_sum'
    : bundle.accepted_context_facts.some((f) => f.key === 'crm.total_sum')
      ? 'crm.total_sum'
      : null
  // Source-specific wording: only call it "the governed week" when families actually
  // share a compatible period; otherwise each fact stands on its own source period.
  const periodWord = bundle.period.end ? 'the governed week' : 'its governed source period'
  const cond = (id: string): AcceptedExactCondition | undefined =>
    bundle.exact_conditions.find((c) => c.condition_id === id)
  const kpi = (slug: string): AcceptedObservedKpi | undefined =>
    bundle.observed_kpis.find((k) => k.slug === slug)

  const sw032 = cond('SW-032')
  const sw041 = cond('SW-041')

  // 1. SW-032 fired: show rate below the ratified 55% floor.
  if (sw032 && sw032.fires) {
    drafts.push({
      id: 'sw032-low-show-rate',
      title: `Lift the appointment show rate above the ratified 55% floor at ${dealer}`,
      lens: 'prospect_friction',
      owner: 'Sales Manager',
      fired_conditions: ['SW-032'],
      evidence_refs: ['appt.show_rate'],
      confidence: 0.7,
      expected_impact: 4,
      proves: `Appointment show rate ${sw032.display} is below the ratified SW-032 threshold of 55% for ${periodWord} (${sw032.numerator} of ${sw032.denominator} booked appointments shown).`,
      does_not_prove: `${cap(SINGLE_PERIOD_CAVEAT)}. SW-032 is a threshold flag, not a score.`,
      next_action: `Same-week manager review of appointment confirmation and reminder cadence for the ${sw032.denominator} booked appointments.`,
      follow_up_metric: 'appt.show_rate',
      inert_notification_preview: `INERT (not sent): notify the Sales Manager that the weekly appointment show rate ${sw032.display} is below the 55% floor (SW-032).`,
      inert_automation_preview: `INERT (not activated): a customer reminder-cadence automation could be proposed only after explicit Duane approval.`,
    })
  }

  // 2. SW-041 fired: no-show rate above the ratified 45% ceiling.
  if (sw041 && sw041.fires) {
    drafts.push({
      id: 'sw041-high-no-show-rate',
      title: `Reduce the appointment no-show rate below the ratified 45% ceiling at ${dealer}`,
      lens: 'handoff_process',
      owner: 'Sales Manager',
      fired_conditions: ['SW-041'],
      evidence_refs: ['appt.no_show_rate'],
      confidence: 0.7,
      expected_impact: 4,
      proves: `Appointment no-show rate ${sw041.display} is above the ratified SW-041 threshold of 45% for ${periodWord} (${sw041.numerator} of ${sw041.denominator} booked appointments were no-shows).`,
      does_not_prove: `${cap(SINGLE_PERIOD_CAVEAT)}. SW-041 is a threshold flag, not a score.`,
      next_action: `Manager review of the no-show follow-up and re-engagement handoff for the ${sw041.denominator} booked appointments; recover same day where possible.`,
      follow_up_metric: 'appt.no_show_rate',
      inert_notification_preview: `INERT (not sent): notify the Sales Manager on a same-day appointment no-show so the rep re-engages (SW-041).`,
      inert_automation_preview: `INERT (not activated): a customer reschedule-text automation could be proposed only after explicit Duane approval.`,
    })
  }

  // 3. Discrepancies — TRUTHFUL, kind-specific dispatch (no generic sold-count routing).
  for (const d of bundle.discrepancies) {
    if (d.kind === 'count_disagreement') {
      if (!grossRef) continue
      const grossClause = d.gross_reconciles
        ? 'The absolute gross total reconciles across both sources within tolerance and stays usable; count-dependent composites (close rate, per-unit gross) are blocked.'
        : 'The cross-source gross does not reconcile within tolerance either; both count-dependent composites and cross-source gross composites are blocked.'
      drafts.push({
        id: 'discrepancy-crm_rows_vs_dashboard_sold',
        title: `Reconcile the CRM-rows vs Dashboard-sold count disagreement at ${dealer}`,
        lens: 'handoff_process', owner: 'GM', fired_conditions: [], evidence_refs: [grossRef],
        confidence: 0.8, expected_impact: 3,
        proves: d.description,
        does_not_prove: `Which source is correct; no unit count is authoritative for this period. ${grossClause}`,
        next_action: `Reconcile the CRM delivered-sale rows (${d.crm_rows}) against the Dashboard sold-in-period figure (${d.dashboard_sold}) before any count-based composite is reported.`,
        follow_up_metric: grossRef,
        inert_notification_preview: `INERT (not sent): flag the GM that two accepted sources disagree on the sold count (${d.crm_rows} vs ${d.dashboard_sold}).`,
        inert_automation_preview: `INERT (not activated): data-integrity reconciliation, not a customer action.`,
      })
    } else if (d.kind === 'period_mismatch') {
      const ref = grossRef ?? [...acceptedRefs][0]
      if (!ref) continue
      const periods = d.family_periods.map((f) => `${f.family} ${f.period.start ?? 'n/a'}..${f.period.end ?? 'n/a'}`).join('; ')
      drafts.push({
        id: 'discrepancy-period_mismatch_across_families',
        title: `Reconcile mismatched governed periods across accepted families at ${dealer}`,
        lens: 'handoff_process', owner: 'GM', fired_conditions: [], evidence_refs: [ref],
        confidence: 0.8, expected_impact: 3,
        proves: `Accepted families report different governed periods (${periods}), so there is no single shared governed period to compare across sources.`,
        does_not_prove: `Any cross-source comparison, cross-source gross reconciliation, or unit-count claim; only source-specific facts (each within its own period) are usable.`,
        next_action: `Align the scheduled report periods so the accepted families cover the same governed week, then re-evaluate cross-source facts.`,
        follow_up_metric: ref,
        inert_notification_preview: `INERT (not sent): flag the GM that accepted families cover different periods.`,
        inert_automation_preview: `INERT (not activated): scheduling alignment, not a customer action.`,
      })
    } else if (d.kind === 'gross_mismatch') {
      if (!grossRef) continue
      drafts.push({
        id: 'discrepancy-crm_vs_dashboard_gross_mismatch',
        title: `Reconcile the CRM vs Dashboard total-gross mismatch at ${dealer}`,
        lens: 'handoff_process', owner: 'GM', fired_conditions: [], evidence_refs: [grossRef],
        confidence: 0.8, expected_impact: 3,
        proves: d.description,
        does_not_prove: `Which source's total is correct; cross-source gross composites are blocked until the two totals reconcile within the $0.50 tolerance for the same period.`,
        next_action: `Reconcile the CRM total gross against the Dashboard total gross for the period before using any cross-source gross composite.`,
        follow_up_metric: grossRef,
        inert_notification_preview: `INERT (not sent): flag the GM that CRM and Dashboard total gross differ beyond tolerance.`,
        inert_automation_preview: `INERT (not activated): data-integrity reconciliation, not a customer action.`,
      })
    }
  }

  // 4. Gross context (observed KPI; never an SW firing). Source-specific wording when
  //    families do not share a governed week; block reason comes from the ACTUAL gate.
  const gross = kpi('gross.total_sum')
  if (gross) {
    const composBlocked = bundle.gates.count_dependent_composites_blocked
    const periodWord = bundle.period.end ? 'the governed week' : 'its own source period'
    const blockReason = bundle.gates.blocked_composite_reason
    drafts.push({
      id: 'gross-context-review',
      title: `Focus the gross review at ${dealer}`,
      lens: 'sales_gross_lift', owner: 'Sales Manager', fired_conditions: [], evidence_refs: ['gross.total_sum'],
      confidence: 0.5, expected_impact: 3,
      proves: `Total gross for ${periodWord} is ${gross.display} (accepted ${gross.compatibility.source_family}).`,
      does_not_prove: `${cap(SINGLE_PERIOD_CAVEAT)}.${composBlocked && blockReason ? ` Per-unit gross and close rate are blocked: ${blockReason}` : ''}`,
      next_action: `Use the accepted absolute gross as directional context only; do not derive per-unit or close-rate composites${composBlocked ? ' (blocked this period)' : ' until at least three governed periods exist'}.`,
      follow_up_metric: 'gross.total_sum',
      inert_notification_preview: `INERT (not sent): no gross alert is configured; internal review candidate only.`,
      inert_automation_preview: `INERT (not activated): no automation.`,
    })
  }

  // 5. Response-time context (observed KPI; explicitly NOT an SW firing).
  const rt = kpi('dashboard.response_time_actual_avg_min')
  if (rt) {
    drafts.push({
      id: 'response-time-context',
      title: `Coaching review of appointment/lead response time at ${dealer} (context, non-scoring)`,
      lens: 'training',
      owner: 'Sales Manager',
      fired_conditions: [],
      evidence_refs: ['dashboard.response_time_actual_avg_min'],
      confidence: 0.5,
      expected_impact: 3,
      proves: `The Dashboard "Avg Actual (Min)" value for ${periodWord} is ${rt.display} minutes.`,
      does_not_prove: `This is NOT a ratified SW condition and NOT a first-response-time metric; ${SINGLE_PERIOD_CAVEAT}.`,
      next_action: `Coaching review of the response workflow using the observed average as directional context only.`,
      follow_up_metric: 'dashboard.response_time_actual_avg_min',
      inert_notification_preview: `INERT (not sent): no response-time alert is configured (no ratified threshold).`,
      inert_automation_preview: `INERT (not activated): no automation.`,
    })
  }

  // 6. Positive control: appointments accepted but NEITHER SW condition fired.
  if (sw032 && sw041 && !sw032.fires && !sw041.fires) {
    drafts.push({
      id: 'appointments-within-ratified-thresholds',
      title: `Appointment execution is within the ratified thresholds at ${dealer} this week (non-scoring)`,
      lens: 'training',
      owner: 'Sales Manager',
      fired_conditions: [],
      evidence_refs: ['appt.show_rate', 'appt.no_show_rate'],
      confidence: 0.5,
      expected_impact: 2,
      proves: `Show rate ${sw032.display} is at or above 55% and no-show rate ${sw041.display} is at or below 45% for ${periodWord}; neither SW-032 nor SW-041 fired.`,
      does_not_prove: `Sustained performance or ${SINGLE_PERIOD_CAVEAT}.`,
      next_action: `Maintain the current confirmation cadence; continue to accumulate governed periods to unlock a dealer baseline.`,
      follow_up_metric: 'appt.show_rate',
      inert_notification_preview: `INERT (not sent): no alert; ratified appointment conditions did not fire.`,
      inert_automation_preview: `INERT (not activated): no automation.`,
    })
  }

  // FAIL-CLOSED: every finding's evidence must resolve to an accepted fact (observed KPI,
  // context fact, or exact-condition base). Exact-firing findings must cite ratified bases.
  for (const d of drafts) {
    for (const ref of d.evidence_refs) {
      if (!acceptedRefs.has(ref)) throw new AcceptedFactsValidationError(`finding "${d.id}" cites an unresolved evidence ref: ${ref}`)
    }
    for (const c of d.fired_conditions) {
      const cond = bundle.exact_conditions.find((x) => x.condition_id === c)
      if (!cond) throw new AcceptedFactsValidationError(`finding "${d.id}" fires ${c} with no accepted condition fact`)
    }
  }

  const scored = drafts.map((d) => ({ ...d, score: Math.round(d.expected_impact * d.confidence * 100) / 100 }))
  scored.sort((a, b) => b.score - a.score)
  return scored.map((d, i) => ({ rank: i + 1, ...d }))
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
