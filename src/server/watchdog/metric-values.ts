/**
 * Current metric-value resolver — the single place that turns a live store into the
 * catalog's metric slugs → current values, for the alert engine AND the audit report.
 *
 * Two sources, both availability-gated + missing-not-zero:
 *   - hub (engagement.*) from the messaging-hub cockpit window; and
 *   - ACCEPTED native VinSolutions families via `ingest-native-metrics` — the reader
 *     enforces accepted + non-superseded + governed period + units + spaced/XLSX
 *     headers + tenant isolation (per-profile brain.db under BRAIN_PROFILES_ROOT).
 *
 * A catalog slug is set ONLY when its source is available AND the value (incl. a
 * valid, non-zero denominator for ratios) is computable; otherwise it is ABSENT —
 * consumers treat absent as "no data / withheld", never a fabricated zero.
 * Availability-safe: never throws.
 */
import { loadCockpitInputs } from '../messaging-hub-store'
import { computeCockpitWindow, type BusinessHours } from '../cockpit/cockpit-window'
import { readStudioConfig } from '../studio-config'
import { parseBusinessHours } from '../cockpit/cockpit-data'
import { resolveHubMetricValues, type MetricValues } from './alert-engine'
import { readAppointments, readCrmSalesGross, readDealershipPerformance } from '../ingest-native-metrics'

const DEFAULT_BH: BusinessHours = { tz: 'America/New_York', openH: 8, closeH: 21, closedDays: [] }

/**
 * Contract-supported catalog slugs derivable from the ACCEPTED native families.
 * Ratios use the 0..1 convention and are withheld when their denominator is
 * null/zero or the family is unavailable (missing, not zero).
 *
 * Deliberately WITHHELD (semantic contract):
 *   - roi.total_leads / roi.sold_from_leads — the Dashboard and Lead Source ROI
 *     definitions DIVERGE for the same period (e.g. Honda 89 leads/8 sold vs ROI
 *     110/5), so deriving these from dealership_performance would be a semantic
 *     defect. Withheld until a governed Lead Source ROI native reader exists.
 *   - gross.reconciliation_mismatches — withheld until per-deal CRM Sales Gross rows.
 *   - cage.* / comm.* — no governed native source here.
 *   - Response-Times — stays a separate labeled source, never a catalog slug.
 *
 * Never throws (reader is availability-safe).
 */
export function resolveNativeMetricValues(profile: string): MetricValues {
  const v: MetricValues = new Map()

  // gross.* SOURCE PRECEDENCE — never double-count Dashboard TOTAL and per-deal CRM gross:
  //   1. CRM Sales Gross (per-deal) is AUTHORITATIVE for gross.total_sum and is the ONLY
  //      source of gross.reconciliation_mismatches (within-row Front+Back vs Total).
  //   2. The Dealership Dashboard TOTAL is a FALLBACK for gross.total_sum ONLY when CRM
  //      Sales Gross is absent/unavailable.
  //   3. The two sources are NEVER summed. Missing-not-zero: absent → the slug is withheld.
  try {
    const crm = readCrmSalesGross(profile)
    if (crm.available && crm.totalSum != null) {
      v.set('gross.total_sum', crm.totalSum)
      if (crm.reconciliationMismatches != null) {
        v.set('gross.reconciliation_mismatches', crm.reconciliationMismatches)
      }
    } else {
      const dp = readDealershipPerformance(profile)
      if (dp.available && dp.provenance && dp.summary.totalGross != null) {
        // Dashboard fallback: total only (no per-deal reconciliation from a summary).
        v.set('gross.total_sum', dp.summary.totalGross)
      }
    }
  } catch {
    /* gross sources unreadable → withheld (never zero) */
  }

  // dashboard.response_time_actual_avg_min — ONLY from the accepted Dealership Performance
  // "Response Time" section. Missing → withheld (never zero).
  try {
    const dp = readDealershipPerformance(profile)
    if (dp.available && dp.summary.responseTimeActualAvgMin != null) {
      v.set('dashboard.response_time_actual_avg_min', dp.summary.responseTimeActualAvgMin)
    }
  } catch {
    /* dealership_performance unreadable → withheld */
  }

  // ALL FOUR appointment rates come from the SAME accepted appointments family and the
  // SAME denominator (ap.total > 0). Never mix Dashboard apptsSet with appointment rows.
  try {
    const ap = readAppointments(profile)
    if (ap.available && ap.total > 0) {
      v.set('appt.show_rate', ap.show / ap.total)
      v.set('appt.no_show_rate', ap.noShow / ap.total)
      v.set('appt.confirmed_rate', ap.confirmed / ap.total)
      v.set('appt.cancel_rate', ap.cancelled / ap.total)
    }
  } catch {
    /* appointments unreadable → withheld */
  }

  return v
}

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
  let values: MetricValues
  let hubHasSource = false
  try {
    const inputs = loadCockpitInputs(profile, sinceMs, now)
    hubHasSource = (inputs.threads?.length ?? 0) > 0
    const win = computeCockpitWindow({ ...inputs, bh, sinceMs, untilMs: now })
    values = resolveHubMetricValues(win)
  } catch {
    // Unreadable hub → treat as NO source (withheld below), never throw.
    hubHasSource = false
    const emptyWin = computeCockpitWindow({ threads: [], messagesByThread: new Map(), handleToContact: new Map(), bh, sinceMs, untilMs: now })
    values = resolveHubMetricValues(emptyWin)
  }

  // Missing-not-zero: with NO governed hub source (0 threads, or unreadable), the
  // engagement.* slugs have no current value — WITHHOLD them rather than emit the
  // pure helper's absent-as-zero (conversations/resurrections = 0). The pure
  // resolveHubMetricValues is unchanged for other callers.
  if (!hubHasSource) {
    for (const slug of ['engagement.reply_rate', 'engagement.conversations', 'engagement.resurrections']) {
      values.delete(slug)
    }
  }

  // Merge ACCEPTED native VinSolutions-report families (availability-safe,
  // missing-not-zero). Absent families simply do not appear in the map.
  for (const [slug, val] of resolveNativeMetricValues(profile)) values.set(slug, val)
  return values
}
