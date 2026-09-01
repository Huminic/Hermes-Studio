/**
 * Per-condition evaluators for the genuinely-evaluable set (SW-031, SW-032, SW-041).
 *
 * Each returns a candidate value computed from HELD families, or a precise reason it
 * cannot be evaluated (e.g. a null/zero denominator — missing is not zero). The spine
 * attaches the baseline, variance, rating, rank, confidence, and lineage, then runs the
 * strict predicate. Anything not covered here is unresolved by construction.
 *
 * Pure. No I/O.
 */
import type { AppointmentsHeld, CrmHeld, DashboardHeld } from './held-inputs'

export type HeldBundle = {
  appointments: AppointmentsHeld | null
  crm: CrmHeld | null
  dashboard: DashboardHeld | null
}

export type Candidate = {
  ok: true
  metric_slug: string
  source_family: string
  source_fields: Array<string>
  formula: string
  unit: string
  numerator: number
  denominator: number
  value: number
}

export type NotEvaluable = {
  ok: false
  source_family: string | null
  reason: string
}

export type EvaluatorResult = Candidate | NotEvaluable

export const EVALUABLE_IDS = ['SW-031', 'SW-032', 'SW-041'] as const
export type EvaluableId = (typeof EVALUABLE_IDS)[number]

/** SW-031 — lead-to-appointment SET rate (Dealership Performance Dashboard). */
export function evalSW031(b: HeldBundle): EvaluatorResult {
  const d = b.dashboard
  if (!d)
    return {
      ok: false,
      source_family: 'dealership_performance',
      reason: 'dealership_performance held family unavailable',
    }
  if (d.leads === null || d.apptsSet === null) {
    return {
      ok: false,
      source_family: 'dealership_performance',
      reason:
        'Leads or Appts Set blank in Dashboard TOTAL (missing is not zero)',
    }
  }
  if (d.leads <= 0) {
    return {
      ok: false,
      source_family: 'dealership_performance',
      reason: `Leads denominator is ${d.leads} (not a positive integer)`,
    }
  }
  const value = d.apptsSet / d.leads
  // Reconcile against the source's own Appts Set % TOTAL cell.
  if (d.apptsSetPct !== null && Math.abs(value - d.apptsSetPct) > 1e-6) {
    return {
      ok: false,
      source_family: 'dealership_performance',
      reason: `computed set rate ${value} != source Appts Set % ${d.apptsSetPct}`,
    }
  }
  return {
    ok: true,
    metric_slug: 'dashboard.lead_to_appt_set_rate',
    source_family: 'dealership_performance',
    source_fields: [
      'Leads (TOTAL)',
      'Appts Set (TOTAL)',
      'Appts Set % (TOTAL)',
    ],
    formula: 'appts_set_total / leads_total',
    unit: 'ratio_0_1',
    numerator: d.apptsSet,
    denominator: d.leads,
    value,
  }
}

/** SW-032 — appointment SHOW rate (Appointments weekly report). Ratified R2 definition. */
export function evalSW032(b: HeldBundle): EvaluatorResult {
  const a = b.appointments
  if (!a)
    return {
      ok: false,
      source_family: 'appointments',
      reason: 'appointments held family unavailable',
    }
  if (a.total <= 0)
    return {
      ok: false,
      source_family: 'appointments',
      reason: 'no appointment rows (denominator 0)',
    }
  return {
    ok: true,
    metric_slug: 'appt.show_rate',
    source_family: 'appointments',
    source_fields: ['Is Show', 'appointment rows (total)'],
    formula: 'count(Is Show=Yes) / count(appointment rows)',
    unit: 'ratio_0_1',
    numerator: a.show,
    denominator: a.total,
    value: a.show / a.total,
  }
}

/** SW-041 — appointment NO-SHOW rate (Appointments weekly report). Ratified R2 definition. */
export function evalSW041(b: HeldBundle): EvaluatorResult {
  const a = b.appointments
  if (!a)
    return {
      ok: false,
      source_family: 'appointments',
      reason: 'appointments held family unavailable',
    }
  if (a.total <= 0)
    return {
      ok: false,
      source_family: 'appointments',
      reason: 'no appointment rows (denominator 0)',
    }
  return {
    ok: true,
    metric_slug: 'appt.no_show_rate',
    source_family: 'appointments',
    source_fields: ['Is No Show', 'appointment rows (total)'],
    formula: 'count(Is No Show=Yes) / count(appointment rows)',
    unit: 'ratio_0_1',
    numerator: a.noShow,
    denominator: a.total,
    value: a.noShow / a.total,
  }
}

export const EVALUATORS: Record<
  EvaluableId,
  (b: HeldBundle) => EvaluatorResult
> = {
  'SW-031': evalSW031,
  'SW-032': evalSW032,
  'SW-041': evalSW041,
}
