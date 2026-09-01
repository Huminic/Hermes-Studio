/**
 * Per-condition evaluators for the genuinely-evaluable set (SW-011/012/015 from the accepted
 * Leads family; SW-031/032/041 from the native-scheduled held families).
 *
 * Each returns a candidate value computed from an ACCEPTED family, or a precise reason it
 * cannot be evaluated (e.g. a null/zero denominator — missing is not zero). The spine
 * attaches the baseline, variance, rating, rank, confidence, lineage, and evaluation_detail,
 * then runs the strict predicate + semantic validator. Anything not covered here is
 * unresolved by construction. Pure. No I/O.
 */
import type { AppointmentsHeld, CrmHeld, DashboardHeld } from './held-inputs'
import type { LeadsMetrics } from './leads-metrics'

export type HeldBundle = {
  appointments: AppointmentsHeld | null
  crm: CrmHeld | null
  dashboard: DashboardHeld | null
  leads: LeadsMetrics | null
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
  // Metric-specific, NON-PII persisted detail (coverage / distributions / footnote). null
  // for metrics that carry no extra detail.
  detail: Record<string, unknown> | null
}

export type NotEvaluable = {
  ok: false
  source_family: string | null
  reason: string
}

export type EvaluatorResult = Candidate | NotEvaluable

export const EVALUABLE_IDS = [
  'SW-011',
  'SW-012',
  'SW-015',
  'SW-031',
  'SW-032',
  'SW-041',
] as const
export type EvaluableId = (typeof EVALUABLE_IDS)[number]

const LEADS_FAMILY = 'vinsolutions_custom_reporting_leads'

/** SW-011 — median time-to-first-touch during business hours (accepted Leads). */
export function evalSW011(b: HeldBundle): EvaluatorResult {
  const l = b.leads
  if (!l)
    return {
      ok: false,
      source_family: LEADS_FAMILY,
      reason: 'leads family unavailable',
    }
  if (l.business_hours_population <= 0)
    return {
      ok: false,
      source_family: LEADS_FAMILY,
      reason: 'no business-hours population (denominator 0)',
    }
  if (l.median_response_min === null)
    return {
      ok: false,
      source_family: LEADS_FAMILY,
      reason:
        'no numeric response times in the business-hours population (missing is not zero)',
    }
  return {
    ok: true,
    metric_slug: 'leads.median_first_touch_min',
    source_family: LEADS_FAMILY,
    source_fields: ['Actual Response Time (Min)', 'Originated After Hours'],
    formula:
      'median(Actual Response Time (Min) where Originated After Hours=No, numeric only)',
    unit: 'minutes',
    numerator: l.response_numeric,
    denominator: l.business_hours_population,
    value: l.median_response_min,
    detail: {
      coverage_numeric: l.response_numeric,
      business_hours_population: l.business_hours_population,
      missing: l.response_missing,
      footnote:
        'Median over the numeric Actual Response Time (Min) within the native Originated-After-Hours=No population; blank response times remain MISSING and are excluded from the median (missing is not zero). Operational target 10 min; triggers when median > 10.',
    },
  }
}

/** SW-012 — strict-untouched business-hours leads (accepted Leads); trigger any count > 0. */
export function evalSW012(b: HeldBundle): EvaluatorResult {
  const l = b.leads
  if (!l)
    return {
      ok: false,
      source_family: LEADS_FAMILY,
      reason: 'leads family unavailable',
    }
  if (l.business_hours_population <= 0)
    return {
      ok: false,
      source_family: LEADS_FAMILY,
      reason: 'no business-hours population (denominator 0)',
    }
  const value = l.untouched_strict / l.business_hours_population
  return {
    ok: true,
    metric_slug: 'leads.untouched_strict_rate',
    source_family: LEADS_FAMILY,
    source_fields: [
      'First Contact Attempt',
      'First Customer Contact',
      'Actual Response Time (Min)',
      'Originated After Hours',
    ],
    formula:
      'count(First Contact Attempt blank AND First Customer Contact blank AND Actual Response Time blank where Originated After Hours=No) / business_hours_population',
    unit: 'ratio_0_1',
    numerator: l.untouched_strict,
    denominator: l.business_hours_population,
    value,
    detail: {
      count: l.untouched_strict,
      denominator: l.business_hours_population,
      rate: value,
      footnote:
        'Strict untouched = all three touch signals blank within the business-hours population. Each source period ended before captured_at, so every qualifying row is >30 minutes old. Operational target 0; triggers on any count > 0.',
    },
  }
}

/** SW-015 — rep first-response >= 2x the store median (accepted Leads); names never retained. */
export function evalSW015(b: HeldBundle): EvaluatorResult {
  const l = b.leads
  if (!l)
    return {
      ok: false,
      source_family: LEADS_FAMILY,
      reason: 'leads family unavailable',
    }
  if (l.reps_with_numeric <= 0)
    return {
      ok: false,
      source_family: LEADS_FAMILY,
      reason: 'no reps with numeric responses (denominator 0)',
    }
  const value = l.triggered_reps / l.reps_with_numeric
  return {
    ok: true,
    metric_slug: 'leads.rep_response_2x_store_median_share',
    source_family: LEADS_FAMILY,
    source_fields: [
      'Actual Response Time (Min)',
      'Originated After Hours',
      'Sales Rep (aggregated, pseudonymized)',
    ],
    formula:
      'count(rep mean Actual Response Time >= 2 x store median) / reps_with_numeric_response',
    unit: 'ratio_0_1',
    numerator: l.triggered_reps,
    denominator: l.reps_with_numeric,
    value,
    detail: {
      reps_with_numeric: l.reps_with_numeric,
      triggered_rep_count: l.triggered_reps,
      triggered_rep_share: value,
      triggered_rep_sample_sizes: l.triggered_rep_sample_sizes,
      max_rep_mean_min: l.max_rep_mean_min,
      store_median_min: l.store_median_min,
      footnote:
        'Per-rep mean Actual Response Time within the business-hours population vs the store median (SW-011 population); a rep triggers at >= 2x. Sales Rep is aggregated in-memory and never persisted as a name. Operational target 0; triggers on any triggered rep.',
    },
  }
}

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
    detail: null,
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
    detail: null,
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
    detail: null,
  }
}

export const EVALUATORS: Record<
  EvaluableId,
  (b: HeldBundle) => EvaluatorResult
> = {
  'SW-011': evalSW011,
  'SW-012': evalSW012,
  'SW-015': evalSW015,
  'SW-031': evalSW031,
  'SW-032': evalSW032,
  'SW-041': evalSW041,
}
