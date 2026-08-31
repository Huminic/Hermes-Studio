/**
 * ONE shared alert display read-model, used by BOTH the alerts GET API and the
 * AlertsPanel. For a metric alert it exposes status, metric label, threshold, the
 * current value WHEN resolvable (accepted sources only), recipient role (optional
 * additive metadata; null for legacy alerts), and the correct SOURCE data-through age.
 *
 * Missing-is-not-zero: a metric whose current value is withheld (no accepted source)
 * has `currentValue: null` + `currentValueResolved: false` — never a fabricated 0.
 */
import type { AlertDirection, AlertRuleType, NotificationRecord } from './notifications-store'
import { resolveNativeMetricValues } from './metric-values'
import { resolveReportFreshness } from '../reports/data-freshness'

export type AlertDisplay = {
  id: string
  kind: 'metric' | 'manual'
  status: 'active' | 'paused'
  query_name: string
  description: string
  email: string
  metric_id: string | null
  metric_label: string | null
  rule_type: AlertRuleType | null
  direction: AlertDirection | null
  threshold: number | null
  recipientRole: string | null
  currentValue: number | null
  currentValueResolved: boolean
  dataThroughLabel: string | null
  ageLabel: string | null
}

export function buildAlertDisplay(
  profile: string,
  records: ReadonlyArray<NotificationRecord>,
  now: Date,
): AlertDisplay[] {
  // Resolve accepted-source values + freshness once per profile.
  let values: Map<string, number | null>
  try {
    values = resolveNativeMetricValues(profile)
  } catch {
    values = new Map()
  }
  const fresh = resolveReportFreshness(profile, now)

  return records.map((r) => {
    const isMetric = r.metric_id != null && r.rule_type != null
    let currentValue: number | null = null
    let currentValueResolved = false
    if (isMetric && r.metric_id && values.has(r.metric_id)) {
      const v = values.get(r.metric_id) ?? null
      if (v != null) {
        currentValue = v
        currentValueResolved = true
      }
      // v === null → withheld: stays absent (never a fabricated zero).
    }
    return {
      id: r.id,
      kind: isMetric ? 'metric' : 'manual',
      status: r.status,
      query_name: r.query_name,
      description: r.description,
      email: r.email,
      metric_id: r.metric_id,
      metric_label: r.metric_label,
      rule_type: r.rule_type,
      direction: r.direction,
      threshold: r.threshold,
      recipientRole: r.recipient_role ?? null,
      currentValue,
      currentValueResolved,
      // Source data-through age applies to metric alerts (accepted native sources).
      dataThroughLabel: isMetric ? fresh.dataThroughLabel : null,
      ageLabel: isMetric ? fresh.ageLabel : null,
    }
  })
}
