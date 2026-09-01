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
  'SW-033',
  'SW-041',
  'SW-045',
  'SW-046',
  'SW-090',
] as const
export type EvaluableId = (typeof EVALUABLE_IDS)[number]

const LEADS_FAMILY = 'vinsolutions_custom_reporting_leads'
const DASH_FAMILY = 'dealership_performance'

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

/** SW-033 — show-to-write rate (Dashboard). Writeup / Appts Show; target 0.60, fires < 0.60. */
export function evalSW033(b: HeldBundle): EvaluatorResult {
  const d = b.dashboard
  if (!d)
    return {
      ok: false,
      source_family: DASH_FAMILY,
      reason: 'dealership_performance held family unavailable',
    }
  if (d.writeup === null || d.apptsShow === null)
    return {
      ok: false,
      source_family: DASH_FAMILY,
      reason: 'Writeup or Appts Show blank in Dashboard (missing is not zero)',
    }
  if (d.apptsShow <= 0)
    return {
      ok: false,
      source_family: DASH_FAMILY,
      reason: `Appts Show denominator is ${d.apptsShow} (not a positive integer)`,
    }
  return {
    ok: true,
    metric_slug: 'dashboard.show_to_write_rate',
    source_family: DASH_FAMILY,
    source_fields: [
      'Writeup (Visit Summary TOTAL)',
      'Appts Show (Dealership Summary TOTAL)',
    ],
    formula: 'writeup / appts_show',
    unit: 'ratio_0_1',
    numerator: d.writeup,
    denominator: d.apptsShow,
    value: d.writeup / d.apptsShow,
    detail: null,
  }
}

/** SW-045 — be-backs to fresh-ups ratio (Dashboard). Be Backs / Initial Visits; inverted = > 1. */
export function evalSW045(b: HeldBundle): EvaluatorResult {
  const d = b.dashboard
  if (!d)
    return {
      ok: false,
      source_family: DASH_FAMILY,
      reason: 'dealership_performance held family unavailable',
    }
  if (d.beBacks === null || d.initialVisits === null)
    return {
      ok: false,
      source_family: DASH_FAMILY,
      reason:
        'Be Backs or Initial Visits blank in Dashboard (missing is not zero)',
    }
  if (d.initialVisits <= 0)
    return {
      ok: false,
      source_family: DASH_FAMILY,
      // Both-zero => genuinely unresolved. Initial Visits=0 with Be Backs>0 is an
      // inverted/infinite firing signal, but an infinite ratio is not representable as a
      // finite evaluated row under the strict predicate (value must be finite, denominator a
      // positive integer). It does not occur in the accepted period (Initial Visits 24/17/11).
      reason:
        d.beBacks > 0
          ? 'Initial Visits=0 with Be Backs>0 is an inverted/infinite ratio (firing signal) not representable as a finite evaluated row; absent in the accepted period (see issues.md)'
          : 'Initial Visits denominator is 0 (missing is not zero)',
    }
  return {
    ok: true,
    metric_slug: 'dashboard.beback_to_freshup_ratio',
    source_family: DASH_FAMILY,
    source_fields: [
      'Be Backs (Visit Summary TOTAL)',
      'Initial Visits (Visit Summary TOTAL)',
    ],
    formula: 'be_backs / initial_visits',
    // Unbounded ratio: Be Backs may exceed Initial Visits, so the value can be > 1.0
    // (that is exactly the "inverted" firing case). Not a 0..1 ratio.
    unit: 'ratio',
    numerator: d.beBacks,
    denominator: d.initialVisits,
    value: d.beBacks / d.initialVisits,
    detail: null,
  }
}

/** SW-046 — test-drive completion rate (Dashboard). Demo / Total Visits; target 0.50, fires < 0.50. */
export function evalSW046(b: HeldBundle): EvaluatorResult {
  const d = b.dashboard
  if (!d)
    return {
      ok: false,
      source_family: DASH_FAMILY,
      reason: 'dealership_performance held family unavailable',
    }
  if (d.demo === null || d.totalVisits === null)
    return {
      ok: false,
      source_family: DASH_FAMILY,
      reason: 'Demo or Total Visits blank in Dashboard (missing is not zero)',
    }
  if (d.totalVisits <= 0)
    return {
      ok: false,
      source_family: DASH_FAMILY,
      reason: `Total Visits denominator is ${d.totalVisits} (not a positive integer)`,
    }
  return {
    ok: true,
    metric_slug: 'dashboard.test_drive_completion_rate',
    source_family: DASH_FAMILY,
    source_fields: [
      'Demo (Visit Summary TOTAL)',
      'Total Visits (Visit Summary TOTAL)',
    ],
    formula: 'demo / total_visits',
    unit: 'ratio_0_1',
    numerator: d.demo,
    denominator: d.totalVisits,
    value: d.demo / d.totalVisits,
    detail: null,
  }
}

/**
 * SW-090 — leads with no assigned salesperson >2 HOURS after creation (accepted Leads).
 *
 * The catalog condition is "no assigned salesperson >2 hours after creation" — NOT "any
 * blank Sales Rep". The accepted aggregate carries only the blank-Sales-Rep COUNT, not the
 * per-row age. So:
 *   - unassigned_sales_rep === 0 -> zero rows require an age determination; the >2h condition
 *     is vacuously false; evaluated with numerator 0 (no qualifying leads).
 *   - unassigned_sales_rep > 0 -> the aggregate cannot prove age >2h; fail CLOSED as
 *     unresolved (`unassigned_age_unproved`). It must NOT auto-fire an alert/rating/breach.
 */
export function evalSW090(b: HeldBundle): EvaluatorResult {
  const l = b.leads
  if (!l)
    return {
      ok: false,
      source_family: LEADS_FAMILY,
      reason: 'leads family unavailable',
    }
  if (l.total_rows <= 0)
    return {
      ok: false,
      source_family: LEADS_FAMILY,
      reason: 'no accepted Leads rows (denominator 0)',
    }
  if (l.unassigned_sales_rep > 0)
    return {
      ok: false,
      source_family: LEADS_FAMILY,
      reason: `unassigned_age_unproved: ${l.unassigned_sales_rep} of ${l.total_rows} accepted Leads rows have a blank Sales Rep, but the accepted aggregate cannot prove age >2h after creation; the condition requires unassigned for >2 hours, so it does not auto-fire without row-level age evidence`,
    }
  // Zero unassigned rows: nothing needs an age determination; the >2h condition is false.
  return {
    ok: true,
    metric_slug: 'leads.unassigned_over_2h_rate',
    source_family: LEADS_FAMILY,
    source_fields: ['Sales Rep', 'Lead ID (accepted row count)'],
    formula:
      'count(Sales Rep blank AND unassigned >2h after creation) / total_accepted_leads_rows',
    unit: 'ratio_0_1',
    numerator: 0,
    denominator: l.total_rows,
    value: 0,
    detail: {
      unassigned_sales_rep: l.unassigned_sales_rep,
      unassigned_over_2h: 0,
      total_rows: l.total_rows,
      rate: 0,
      footnote:
        'Leads with a BLANK Sales Rep >2 hours after creation, over all accepted Leads rows; a Sales Rep name is never persisted. With zero blank Sales Rep rows no age determination is required and the ">2 hours after creation" condition is false. Operational target 0; triggers only on a proven unassigned-over-2h count > 0 (a nonzero blank count without row-level age evidence stays unresolved: unassigned_age_unproved).',
    },
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
  'SW-033': evalSW033,
  'SW-041': evalSW041,
  'SW-045': evalSW045,
  'SW-046': evalSW046,
  'SW-090': evalSW090,
}
