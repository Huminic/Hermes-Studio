/**
 * Data freshness + data-through date + plain-language age.
 *
 * Pure and deterministic (inject `now`). Fail-closed INTERNALLY: no accepted period →
 * state `missing`; past the weekly window → `stale`. The customer-safe `ageLabel` never
 * uses internal words ("stale"/"missing"); those live only in the internal `state` and
 * the internal evidence artifact. Missing is never rendered as a zero/valid date.
 */
import { readAppointments, readCrmSalesGross, readDealershipPerformance } from '../ingest-native-metrics'

export type FreshnessState = 'current' | 'aging' | 'stale' | 'missing'

export type DataFreshness = {
  dataThrough: string | null // ISO date (max accepted period_end) or null
  dataThroughLabel: string | null // "Aug 30, 2026"
  ageDays: number | null // whole calendar days from period_end to `now`
  ageLabel: string // customer-safe, plain language
  state: FreshnessState // INTERNAL fail-closed verdict
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** "2026-08-30" → "Aug 30, 2026". */
export function formatDataThrough(iso: string): string {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10))
  return `${MONTHS[(m - 1) % 12]} ${d}, ${y}`
}

/** Customer-safe, plain-language recency. */
export function plainAge(ageDays: number): string {
  if (ageDays <= 0) return 'updated today'
  if (ageDays === 1) return 'updated yesterday'
  if (ageDays <= 13) return `updated ${ageDays} days ago`
  if (ageDays <= 20) return 'updated last week'
  return `updated ${Math.round(ageDays / 7)} weeks ago`
}

/** Whole calendar days between the `dataThrough` date and `now`'s date. */
function ageInDays(dataThrough: string, now: Date): number {
  const end = Date.parse(`${dataThrough}T00:00:00Z`)
  const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`)
  return Math.floor((today - end) / 86_400_000)
}

/**
 * @param periodEnds accepted-delivery period_end values (ISO). Absent/invalid ignored.
 * @param now injected clock.
 * @param weeklyMaxAgeDays fail-closed staleness threshold (contract: period-end age <= 8).
 */
export function computeDataFreshness(
  periodEnds: Array<string | null | undefined>,
  now: Date,
  weeklyMaxAgeDays = 8,
): DataFreshness {
  const valid = periodEnds.filter((d): d is string => !!d && ISO_DATE.test(d))
  if (valid.length === 0) {
    // Missing is not zero: no accepted period → no date is fabricated.
    return { dataThrough: null, dataThroughLabel: null, ageDays: null, ageLabel: 'Data not yet available', state: 'missing' }
  }
  const dataThrough = valid.slice().sort().at(-1) as string
  const ageDays = ageInDays(dataThrough, now)
  const state: FreshnessState =
    ageDays <= 7 ? 'current' : ageDays <= weeklyMaxAgeDays ? 'aging' : 'stale'
  const ageLabel = `Data through ${formatDataThrough(dataThrough)} · ${plainAge(Math.max(0, ageDays))}`
  return { dataThrough, dataThroughLabel: formatDataThrough(dataThrough), ageDays, ageLabel, state }
}

/** True only when there is a current/aging accepted period (fail-closed for stale/missing). */
export function isFreshEnoughToPublish(f: DataFreshness): boolean {
  return f.state === 'current' || f.state === 'aging'
}

/**
 * Freshness for a profile from ACCEPTED native provenance only (Dashboard, Appointments,
 * CRM Sales Gross). Unavailable families contribute nothing (missing is not zero).
 */
export function resolveReportFreshness(profile: string, now: Date): DataFreshness {
  const ends: Array<string | null | undefined> = []
  for (const read of [readDealershipPerformance, readAppointments, readCrmSalesGross]) {
    try {
      const r = read(profile) as { available: boolean; provenance?: { period?: { end?: string | null } } }
      if (r.available && r.provenance?.period?.end) ends.push(r.provenance.period.end)
    } catch {
      /* unreadable family contributes nothing (fail-closed) */
    }
  }
  return computeDataFreshness(ends, now)
}
