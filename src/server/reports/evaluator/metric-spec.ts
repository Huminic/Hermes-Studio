/**
 * Canonical per-metric specification for the evaluable set. This is the source of truth
 * the semantic validator binds each evaluated row against: the exact source family,
 * metric slug, unit, source fields, formula, baseline id, comparator, direction, and
 * value_kind (a ratio value must equal numerator/denominator; a `statistic` value — e.g. a
 * median — is a computed statistic and is NOT bound to num/denom). Corruption of any of
 * these (or of a derived value) is detected by recomputation. Pure.
 */
import type { EvaluableId } from './evaluators'

export type MetricSpec = {
  metric_id: EvaluableId
  source_family:
    | 'appointments'
    | 'crm_sales_gross'
    | 'dealership_performance'
    | 'vinsolutions_custom_reporting_leads'
  metric_slug: string
  unit: string
  value_kind: 'ratio' | 'statistic'
  source_fields: Array<string>
  formula: string
  baseline_id: string
  baseline_basis: 'operational_target'
  comparator: '<' | '>'
  direction: 'higher_is_better' | 'lower_is_better'
}

const LEADS = 'vinsolutions_custom_reporting_leads' as const

export const METRIC_SPECS: Record<EvaluableId, MetricSpec> = {
  'SW-011': {
    metric_id: 'SW-011',
    source_family: LEADS,
    metric_slug: 'leads.median_first_touch_min',
    unit: 'minutes',
    value_kind: 'statistic',
    source_fields: ['Actual Response Time (Min)', 'Originated After Hours'],
    formula:
      'median(Actual Response Time (Min) where Originated After Hours=No, numeric only)',
    baseline_id: 'OT-SW-011',
    baseline_basis: 'operational_target',
    comparator: '>',
    direction: 'lower_is_better',
  },
  'SW-012': {
    metric_id: 'SW-012',
    source_family: LEADS,
    metric_slug: 'leads.untouched_strict_rate',
    unit: 'ratio_0_1',
    value_kind: 'ratio',
    source_fields: [
      'First Contact Attempt',
      'First Customer Contact',
      'Actual Response Time (Min)',
      'Originated After Hours',
    ],
    formula:
      'count(First Contact Attempt blank AND First Customer Contact blank AND Actual Response Time blank where Originated After Hours=No) / business_hours_population',
    baseline_id: 'OT-SW-012',
    baseline_basis: 'operational_target',
    comparator: '>',
    direction: 'lower_is_better',
  },
  'SW-015': {
    metric_id: 'SW-015',
    source_family: LEADS,
    metric_slug: 'leads.rep_response_2x_store_median_share',
    unit: 'ratio_0_1',
    value_kind: 'ratio',
    source_fields: [
      'Actual Response Time (Min)',
      'Originated After Hours',
      'Sales Rep (aggregated, pseudonymized)',
    ],
    formula:
      'count(rep mean Actual Response Time >= 2 x store median) / reps_with_numeric_response',
    baseline_id: 'OT-SW-015',
    baseline_basis: 'operational_target',
    comparator: '>',
    direction: 'lower_is_better',
  },
  'SW-031': {
    metric_id: 'SW-031',
    source_family: 'dealership_performance',
    metric_slug: 'dashboard.lead_to_appt_set_rate',
    unit: 'ratio_0_1',
    value_kind: 'ratio',
    source_fields: [
      'Leads (TOTAL)',
      'Appts Set (TOTAL)',
      'Appts Set % (TOTAL)',
    ],
    formula: 'appts_set_total / leads_total',
    baseline_id: 'OT-SW-031',
    baseline_basis: 'operational_target',
    comparator: '<',
    direction: 'higher_is_better',
  },
  'SW-032': {
    metric_id: 'SW-032',
    source_family: 'appointments',
    metric_slug: 'appt.show_rate',
    unit: 'ratio_0_1',
    value_kind: 'ratio',
    source_fields: ['Is Show', 'appointment rows (total)'],
    formula: 'count(Is Show=Yes) / count(appointment rows)',
    baseline_id: 'OT-SW-032',
    baseline_basis: 'operational_target',
    comparator: '<',
    direction: 'higher_is_better',
  },
  'SW-033': {
    metric_id: 'SW-033',
    source_family: 'dealership_performance',
    metric_slug: 'dashboard.show_to_write_rate',
    unit: 'ratio_0_1',
    value_kind: 'ratio',
    source_fields: [
      'Writeup (Visit Summary TOTAL)',
      'Appts Show (Dealership Summary TOTAL)',
    ],
    formula: 'writeup / appts_show',
    baseline_id: 'OT-SW-033',
    baseline_basis: 'operational_target',
    comparator: '<',
    direction: 'higher_is_better',
  },
  'SW-041': {
    metric_id: 'SW-041',
    source_family: 'appointments',
    metric_slug: 'appt.no_show_rate',
    unit: 'ratio_0_1',
    value_kind: 'ratio',
    source_fields: ['Is No Show', 'appointment rows (total)'],
    formula: 'count(Is No Show=Yes) / count(appointment rows)',
    baseline_id: 'OT-SW-041',
    baseline_basis: 'operational_target',
    comparator: '>',
    direction: 'lower_is_better',
  },
  'SW-045': {
    metric_id: 'SW-045',
    source_family: 'dealership_performance',
    metric_slug: 'dashboard.beback_to_freshup_ratio',
    unit: 'ratio',
    value_kind: 'ratio',
    source_fields: [
      'Be Backs (Visit Summary TOTAL)',
      'Initial Visits (Visit Summary TOTAL)',
    ],
    formula: 'be_backs / initial_visits',
    baseline_id: 'OT-SW-045',
    baseline_basis: 'operational_target',
    comparator: '>',
    direction: 'lower_is_better',
  },
  'SW-046': {
    metric_id: 'SW-046',
    source_family: 'dealership_performance',
    metric_slug: 'dashboard.test_drive_completion_rate',
    unit: 'ratio_0_1',
    value_kind: 'ratio',
    source_fields: [
      'Demo (Visit Summary TOTAL)',
      'Total Visits (Visit Summary TOTAL)',
    ],
    formula: 'demo / total_visits',
    baseline_id: 'OT-SW-046',
    baseline_basis: 'operational_target',
    comparator: '<',
    direction: 'higher_is_better',
  },
  'SW-090': {
    metric_id: 'SW-090',
    source_family: LEADS,
    metric_slug: 'leads.unassigned_over_2h_rate',
    unit: 'ratio_0_1',
    value_kind: 'ratio',
    source_fields: ['Sales Rep', 'Lead ID (accepted row count)'],
    formula:
      'count(Sales Rep blank AND unassigned >2h after creation) / total_accepted_leads_rows',
    baseline_id: 'OT-SW-090',
    baseline_basis: 'operational_target',
    comparator: '>',
    direction: 'lower_is_better',
  },
}
