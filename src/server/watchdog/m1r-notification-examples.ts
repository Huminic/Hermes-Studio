/**
 * M1R dev notification/automation EXAMPLES — four INACTIVE definitions.
 *
 * Reuses the real alert model (notifications-store `AlertRuleType`/`AlertDirection`,
 * `MetricAlertInput`, `describeMetricAlert`) so these map straight onto the existing
 * dashboard notification-creation wizard/store — but every one is `status: 'paused'`
 * (INACTIVE) and is NEVER inserted, activated, dispatched, or sent here. Accepted metrics
 * only bind a live value; a quarantined source stays UNBOUND with `currentValue: null`
 * (no fabricated metric). Each definition also carries the data-through date + plain age
 * so the dashboard can show freshness. No Service/Parts; held families provide zero metrics.
 */
import {
  describeMetricAlert,
  type AlertDirection,
  type AlertRuleType,
  type MetricAlertInput,
} from './notifications-store'
import {
  readAppointments,
  readCrmSalesGross,
  readResponseTimes,
} from '../ingest-native-metrics'
import { resolveReportFreshness } from '../reports/data-freshness'

export type RecipientRole = 'Sales Manager' | 'Manager' | 'Salesperson or Manager' | 'Internal Analyst'

export type M1rNotificationExample = {
  profile: string
  dealer: string
  recipientRole: RecipientRole
  metric_id: string | null
  metric_label: string
  rule_type: AlertRuleType
  direction: AlertDirection
  threshold: number | null // configurable
  status: 'paused' // INACTIVE — never 'active'
  bound: boolean
  currentValue: number | null // resolved from accepted data, or null when unbound (never fabricated)
  unboundReason: string | null
  description: string
  source: string
  // freshness (dashboard-facing presentation)
  dataThrough: string | null
  dataThroughLabel: string | null
  ageLabel: string
  freshnessState: string
  // safety
  sendState: 'never — inactive dev example (no send, no activation)'
}

const DEALER: Record<string, string> = {
  'serra-honda': 'Serra Honda',
  'serra-nissan': 'Serra Nissan',
  'tony-serra-ford': 'Tony Serra Ford',
}

/** Map an example onto the real wizard input (status forced paused). Not inserted here. */
export function toPausedMetricAlertInput(e: M1rNotificationExample): (MetricAlertInput & { status: 'paused' }) | null {
  if (!e.metric_id) return null // unbound (e.g. quarantined source) → not registrable
  return {
    profile: e.profile,
    email: '', // intentionally empty: inactive, never dispatched
    metric_id: e.metric_id,
    metric_label: e.metric_label,
    rule_type: e.rule_type,
    direction: e.direction,
    threshold: e.threshold,
    query_name: `${e.metric_label} ${e.direction} threshold`,
    description: e.description,
    status: 'paused',
  }
}

export function m1rNotificationExamples(profile: string, now: Date): M1rNotificationExample[] {
  const dealer = DEALER[profile] ?? profile
  const f = resolveReportFreshness(profile, now)
  const base = {
    profile,
    dealer,
    status: 'paused' as const,
    dataThrough: f.dataThrough,
    dataThroughLabel: f.dataThroughLabel,
    ageLabel: f.ageLabel,
    freshnessState: f.state,
    sendState: 'never — inactive dev example (no send, no activation)' as const,
  }

  // 1) Appointment show rate below a configurable threshold → Sales Manager.
  const ap = readAppointments(profile)
  const apBound = ap.available && ap.total > 0
  const def1: M1rNotificationExample = {
    ...base,
    recipientRole: 'Sales Manager',
    metric_id: 'appt.show_rate',
    metric_label: 'Appointment show rate',
    rule_type: 'threshold',
    direction: 'below',
    threshold: 0.5,
    bound: apBound,
    currentValue: apBound ? Math.round((ap.show / ap.total) * 1000) / 1000 : null,
    unboundReason: apBound ? null : 'no accepted appointments delivery',
    description: describeMetricAlert({ metric_label: 'Appointment show rate', rule_type: 'threshold', direction: 'below', threshold: 0.5 }),
    source: 'metric-alert (M1R dev example, inactive)',
  }

  // 2) Response time above a configurable threshold → Manager. Sourced ONLY from the
  //    accepted Response Times readback field; otherwise UNBOUND.
  const rt = readResponseTimes(profile)
  const rtVal =
    rt.available && typeof (rt as { metrics?: Record<string, unknown> }).metrics?.response_time_actual_avg_min === 'number'
      ? ((rt as { metrics: Record<string, number> }).metrics.response_time_actual_avg_min)
      : null
  const def2: M1rNotificationExample = {
    ...base,
    recipientRole: 'Manager',
    metric_id: rtVal != null ? 'response.actual_avg_min' : null,
    metric_label: 'Average response time (minutes)',
    rule_type: 'threshold',
    direction: 'above',
    threshold: 30,
    bound: rtVal != null,
    currentValue: rtVal,
    unboundReason: rtVal != null ? null : 'no accepted Response Times readback field',
    description: describeMetricAlert({ metric_label: 'Average response time (minutes)', rule_type: 'threshold', direction: 'above', threshold: 30 }),
    source: 'metric-alert (M1R dev example, inactive)',
  }

  // 3) High-intent inbound without timely follow-up → Salesperson or Manager.
  //    Sales Communication is QUARANTINED → explicitly UNBOUND + inactive, no value.
  const def3: M1rNotificationExample = {
    ...base,
    recipientRole: 'Salesperson or Manager',
    metric_id: null,
    metric_label: 'High-intent inbound without timely follow-up',
    rule_type: 'threshold',
    direction: 'above',
    threshold: null,
    bound: false,
    currentValue: null,
    unboundReason:
      'Sales Communication is quarantined (Filters positively select Service/Parts Lead-Intent); zero metrics accepted — no value bound or fabricated.',
    description: 'Would alert when a high-intent inbound message goes without timely follow-up. Unbound until a clean Sales Communication source is accepted.',
    source: 'metric-alert (M1R dev example, inactive, UNBOUND)',
  }

  // 4) Gross reconciliation anomaly → Internal Analyst.
  const gr = readCrmSalesGross(profile)
  const grBound = gr.available && gr.reconciliationMismatches != null
  const def4: M1rNotificationExample = {
    ...base,
    recipientRole: 'Internal Analyst',
    metric_id: 'gross.reconciliation_mismatches',
    metric_label: 'Gross reconciliation mismatches (Front+Back ≠ Total)',
    rule_type: 'threshold',
    direction: 'above',
    threshold: 0,
    bound: grBound,
    currentValue: grBound ? (gr.reconciliationMismatches as number) : null,
    unboundReason: grBound ? null : 'no accepted CRM Sales Gross delivery',
    description: describeMetricAlert({ metric_label: 'Gross reconciliation mismatches', rule_type: 'threshold', direction: 'above', threshold: 0 }),
    source: 'metric-alert (M1R dev example, inactive)',
  }

  return [def1, def2, def3, def4]
}
