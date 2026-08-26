/**
 * Metric-alert evaluation engine. For each active metric alert on a profile, it
 * resolves the current value + (for baseline rules) a per-dealer baseline band from
 * trailing history, then asks the pure `evaluateAlertRule` whether it fires.
 *
 * AVAILABILITY-GATED + missing-is-not-zero: a metric with no resolvable current
 * value (e.g. a VinSolutions-report metric whose analytical store isn't present on
 * this branch, or a hub metric with no traffic) WITHHOLDS — it never fires from a
 * fabricated zero. Baseline rules withhold until ≥3 points of trailing history exist.
 * This module takes NO action (no email/no write) — dispatch is a separate, gated
 * step. It only decides.
 */
import {
  evaluateAlertRule,
  listMetricAlerts,
  type AlertEvaluation,
  type NotificationRecord,
} from './notifications-store'
import { mean, stddev } from './baseline'
import type { CockpitWindow } from '../cockpit/cockpit-window'

export type MetricValues = Map<string, number | null>
export type MetricHistory = Map<string, Array<number>>

export type AlertDecision = { alert: NotificationRecord; decision: AlertEvaluation }

/** A per-dealer baseline band from trailing history, or null if too little history. */
export function baselineFromHistory(history: Array<number>): { mean: number; stddev: number } | null {
  if (history.length < 3) return null
  const sd = stddev(history)
  if (sd === 0) return null
  return { mean: mean(history), stddev: sd }
}

/**
 * Resolve the hub-sourced (engagement.*) metric values from a computed cockpit
 * window. VinSolutions-report metrics are NOT resolved here (no source on this
 * branch) and are therefore withheld by the engine. Returns null for a metric that
 * has no denominator (e.g. reply rate with zero touched) — never a fabricated 0.
 */
export function resolveHubMetricValues(win: CockpitWindow): MetricValues {
  const v: MetricValues = new Map()
  v.set('engagement.reply_rate', win.touched > 0 ? win.replied / win.touched : null)
  v.set('engagement.conversations', win.replied)
  v.set('engagement.resurrections', win.resurrections)
  return v
}

/**
 * Decide every active metric alert for a profile. Pure given the value/history
 * context — does not send or persist. Callers dispatch on `decision.fires` and then
 * stamp dedup separately.
 */
export function evaluateProfileAlerts(
  profile: string,
  ctx: { values: MetricValues; history?: MetricHistory; now: number },
  opts: { profileRoot?: string } = {},
): Array<AlertDecision> {
  const alerts = listMetricAlerts(profile, opts)
  return alerts.map((alert) => {
    const id = alert.metric_id as string
    const value = ctx.values.has(id) ? ctx.values.get(id)! : null
    const history = ctx.history?.get(id) ?? []
    const baseline = alert.rule_type === 'baseline' ? baselineFromHistory(history) : null
    const decision = evaluateAlertRule(alert, { value, now: ctx.now, baseline })
    return { alert, decision }
  })
}

/** Convenience: only the alerts that fire (ready to dispatch). */
export function firingAlerts(decisions: Array<AlertDecision>): Array<AlertDecision> {
  return decisions.filter((d) => d.decision.fires)
}
