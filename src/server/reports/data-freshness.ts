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

/** `now`'s calendar date (YYYY-MM-DD) in the given IANA timezone (en-CA → YYYY-MM-DD). */
function localDateISO(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Whole calendar days between the `dataThrough` date and `now`'s LOCAL date in `timeZone`. */
function ageInDays(dataThrough: string, now: Date, timeZone: string): number {
  const end = Date.parse(`${dataThrough}T00:00:00Z`)
  const today = Date.parse(`${localDateISO(now, timeZone)}T00:00:00Z`)
  return Math.floor((today - end) / 86_400_000)
}

const GOVERNED_PROFILE_TZ: Record<string, string> = {
  'serra-honda': 'America/Chicago',
  'serra-nissan': 'America/Chicago',
  'tony-serra-ford': 'America/Chicago',
}

/**
 * Dealership local timezone for visible freshness. The three governed Serra profiles are
 * America/Chicago. Conservative fallback: any unrelated profile keeps prior UTC behavior —
 * this never silently shifts another profile's dates.
 */
export function resolveProfileTimeZone(profile: string): string {
  return GOVERNED_PROFILE_TZ[profile] ?? 'UTC'
}

/**
 * @param periodEnds accepted-delivery period_end values (ISO). Absent/invalid ignored.
 * @param now injected clock.
 * @param weeklyMaxAgeDays fail-closed staleness threshold (contract: period-end age <= 8).
 * @param timeZone IANA timezone for the visible calendar day (default UTC for pure callers).
 */
export function computeDataFreshness(
  periodEnds: Array<string | null | undefined>,
  now: Date,
  weeklyMaxAgeDays = 8,
  timeZone = 'UTC',
): DataFreshness {
  const valid = periodEnds.filter((d): d is string => !!d && ISO_DATE.test(d))
  if (valid.length === 0) {
    // Missing is not zero: no accepted period → no date is fabricated.
    return { dataThrough: null, dataThroughLabel: null, ageDays: null, ageLabel: 'Data not yet available', state: 'missing' }
  }
  const dataThrough = valid.slice().sort().at(-1) as string
  const ageDays = ageInDays(dataThrough, now, timeZone)
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
export type MetricSourceFamily =
  | 'appointments'
  | 'crm_sales_gross'
  | 'dealership_performance'
  | 'gross_total' // CRM Sales Gross if present, else Dealership Performance fallback
  | null

/** Map a metric slug to the accepted native family that is its ACTUAL source. */
export function metricSourceFamily(metricId: string | null | undefined): MetricSourceFamily {
  if (!metricId) return null
  if (metricId.startsWith('appt.')) return 'appointments'
  if (metricId === 'gross.reconciliation_mismatches') return 'crm_sales_gross'
  if (metricId === 'gross.total_sum') return 'gross_total'
  if (metricId.startsWith('dashboard.')) return 'dealership_performance'
  return null // unknown / quarantined-only (e.g. comm.*, roi.*, cage.*) → no accepted source
}

/**
 * Freshness for a SINGLE metric, computed ONLY from that metric's actual source family
 * provenance — never a cross-family max-date. Fail-closed: an unknown source, or a source
 * family with no accepted delivery, yields state `missing` (no borrowed date).
 */
export function resolveMetricSourceFreshness(
  profile: string,
  metricId: string | null | undefined,
  now: Date,
): DataFreshness {
  const endOf = (r: { available: boolean; provenance?: { period?: { end?: string | null } } }): string | null =>
    r.available && r.provenance?.period?.end ? r.provenance.period.end : null
  let end: string | null = null
  try {
    const fam = metricSourceFamily(metricId)
    if (fam === 'appointments') end = endOf(readAppointments(profile))
    else if (fam === 'crm_sales_gross') end = endOf(readCrmSalesGross(profile))
    else if (fam === 'dealership_performance') end = endOf(readDealershipPerformance(profile))
    else if (fam === 'gross_total') {
      const crm = readCrmSalesGross(profile)
      end = crm.available ? endOf(crm) : endOf(readDealershipPerformance(profile))
    }
    // fam === null → unknown/quarantined-only → end stays null (missing)
  } catch {
    end = null
  }
  return computeDataFreshness(end ? [end] : [], now, 8, resolveProfileTimeZone(profile))
}

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
  return computeDataFreshness(ends, now, 8, resolveProfileTimeZone(profile))
}
