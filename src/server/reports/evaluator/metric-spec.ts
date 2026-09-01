/**
 * Canonical per-metric specification for the evaluable set. This is the source of truth
 * the semantic validator binds each evaluated row against: the exact source family,
 * metric slug, unit, source fields, formula, baseline id, comparator, and direction.
 * Corruption of any of these (or of a derived value) is detected by recomputation.
 * Pure.
 */
import type { EvaluableId } from './evaluators'

export type MetricSpec = {
  metric_id: EvaluableId
  source_family: 'appointments' | 'crm_sales_gross' | 'dealership_performance'
  metric_slug: string
  unit: string
  source_fields: Array<string>
  formula: string
  baseline_id: string
  baseline_basis: 'operational_target'
  comparator: '<' | '>'
  direction: 'higher_is_better' | 'lower_is_better'
}

export const METRIC_SPECS: Record<EvaluableId, MetricSpec> = {
  'SW-031': {
    metric_id: 'SW-031',
    source_family: 'dealership_performance',
    metric_slug: 'dashboard.lead_to_appt_set_rate',
    unit: 'ratio_0_1',
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
    source_fields: ['Is Show', 'appointment rows (total)'],
    formula: 'count(Is Show=Yes) / count(appointment rows)',
    baseline_id: 'OT-SW-032',
    baseline_basis: 'operational_target',
    comparator: '<',
    direction: 'higher_is_better',
  },
  'SW-041': {
    metric_id: 'SW-041',
    source_family: 'appointments',
    metric_slug: 'appt.no_show_rate',
    unit: 'ratio_0_1',
    source_fields: ['Is No Show', 'appointment rows (total)'],
    formula: 'count(Is No Show=Yes) / count(appointment rows)',
    baseline_id: 'OT-SW-041',
    baseline_basis: 'operational_target',
    comparator: '>',
    direction: 'lower_is_better',
  },
}
