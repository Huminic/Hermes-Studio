/**
 * Current metric-value resolver — the single place that turns a live store into the
 * catalog's metric slugs → current values, for the alert engine AND the audit report.
 *
 * On this branch only the hub-sourced (engagement.*) metrics have a source; the
 * VinSolutions-report metrics (appt./roi./gross./cage./comm.) have no analytical
 * store here, so they are simply ABSENT from the map — consumers treat absent as
 * "no data / availability-gated", never a fabricated zero. Availability-safe: never
 * throws (an unreadable/empty hub yields an empty window, i.e. honest nulls/zeros).
 */
import { loadCockpitInputs } from '../messaging-hub-store'
import { computeCockpitWindow, type BusinessHours } from '../cockpit/cockpit-window'
import { readStudioConfig } from '../studio-config'
import { parseBusinessHours } from '../cockpit/cockpit-data'
import { resolveHubMetricValues, type MetricValues } from './alert-engine'

const DEFAULT_BH: BusinessHours = { tz: 'America/New_York', openH: 8, closeH: 21, closedDays: [] }

export function resolveMetricValues(
  profile: string,
  windowDays: number,
  now: number = Date.now(),
): MetricValues {
  let bh: BusinessHours = DEFAULT_BH
  try {
    const { config } = readStudioConfig(profile)
    bh = parseBusinessHours((config.comms?.business_hours ?? {}) as never)
  } catch {
    bh = DEFAULT_BH
  }

  const sinceMs = now - windowDays * 86_400_000
  try {
    const inputs = loadCockpitInputs(profile, sinceMs, now)
    const win = computeCockpitWindow({ ...inputs, bh, sinceMs, untilMs: now })
    return resolveHubMetricValues(win)
    // VinSolutions-report metric values are intentionally NOT added here (no source
    // on this branch) → absent → consumers withhold / report "no data".
  } catch {
    // Unreadable hub → empty window (honest zeros/nulls), never throw.
    const emptyWin = computeCockpitWindow({ threads: [], messagesByThread: new Map(), handleToContact: new Map(), bh, sinceMs, untilMs: now })
    return resolveHubMetricValues(emptyWin)
  }
}
