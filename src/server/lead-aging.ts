/**
 * Lead aging + alert evaluation (AC5 — Serra comms recovery).
 *
 * The operator's rule: aging is counted LINEARLY within business hours only —
 * "a lead that comes in at 4pm and gets answered at 9am the next morning is 4
 * hours aged" (4pm→7pm = 3h + 8am→9am = 1h). Overnight, Sunday, and holidays
 * are frozen. Business week = Mon–Sat 08:00–19:00 Central by default.
 *
 * Pure + injectable: the holiday set and clock are parameters, so the engine is
 * correct now and the holiday LIST is filled from config later. The alert
 * evaluation is pure over injected leads (caller fetches via vin_query_leads).
 */
import { localMidnight } from './catchup-common'

export type BusinessHoursCfg = {
  tz: string
  /** Local hour the business day opens (default 8). */
  startHour: number
  /** Local hour the business day closes (default 19). */
  endHour: number
  /** Weekdays that count (0=Sun..6=Sat). Default Mon–Sat = {1,2,3,4,5,6}. */
  businessWeekdays: Set<number>
  /** Frozen dates as YYYY-MM-DD in `tz` (holidays). */
  holidays: Set<string>
}

export const DEFAULT_BUSINESS_HOURS: BusinessHoursCfg = {
  tz: 'America/Chicago',
  startHour: 8,
  endHour: 19,
  businessWeekdays: new Set([1, 2, 3, 4, 5, 6]), // Mon–Sat
  holidays: new Set(),
}

function tzDateStr(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms))
}

const WEEKDAY_NUM: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

function tzWeekday(ms: number, tz: string): number {
  const w = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(
    new Date(ms),
  )
  return WEEKDAY_NUM[w] ?? 0
}

/**
 * Business-hours elapsed (ms) between two instants, summing only the open
 * windows of business days (skipping overnight, non-business weekdays, and
 * holidays). Linear: partial first/last days count only their in-window slice.
 */
export function businessHoursElapsedMs(
  startMs: number,
  nowMs: number,
  cfg: BusinessHoursCfg = DEFAULT_BUSINESS_HOURS,
): number {
  if (nowMs <= startMs) return 0
  let total = 0
  let dayMid = localMidnight(cfg.tz, startMs)
  // Walk day-by-day; re-snap to each next local midnight so DST never drifts.
  for (let i = 0; i < 800 && dayMid <= nowMs; i++) {
    const wd = tzWeekday(dayMid, cfg.tz)
    const dateStr = tzDateStr(dayMid, cfg.tz)
    if (cfg.businessWeekdays.has(wd) && !cfg.holidays.has(dateStr)) {
      const open = dayMid + cfg.startHour * 3_600_000
      const close = dayMid + cfg.endHour * 3_600_000
      const lo = Math.max(open, startMs)
      const hi = Math.min(close, nowMs)
      if (hi > lo) total += hi - lo
    }
    dayMid = localMidnight(cfg.tz, dayMid + 25 * 3_600_000) // next local midnight
  }
  return total
}

/** Is `ms` inside an open business window (business weekday, not holiday, in-hours)? */
export function isWithinBusinessHours(
  ms: number,
  cfg: BusinessHoursCfg = DEFAULT_BUSINESS_HOURS,
): boolean {
  const wd = tzWeekday(ms, cfg.tz)
  if (!cfg.businessWeekdays.has(wd)) return false
  if (cfg.holidays.has(tzDateStr(ms, cfg.tz))) return false
  const hourOfDay = (ms - localMidnight(cfg.tz, ms)) / 3_600_000
  return hourOfDay >= cfg.startHour && hourOfDay < cfg.endHour
}

// ─── Alert evaluation ────────────────────────────────────────────────────────

export type LeadForAlert = {
  leadId: string
  leadStatus?: string | null
  leadStatusType?: string | null
  createdUtc?: string | null
}

export type LeadAlertBuckets = {
  /** No status at all (empty leadStatus/leadStatusType). */
  noStatus: string[]
  /** New/unactioned lead whose BUSINESS-hours aging since creation exceeds 5 min. */
  unactionedOver5Min: string[]
  /** New/unactioned lead created more than 3 calendar days ago. */
  sittingOver3Days: string[]
}

const FIVE_MIN_MS = 5 * 60_000
const THREE_DAYS_MS = 3 * 24 * 3_600_000
const NEW_STATUS = 'ACTIVE_NEW_LEAD'

function parseMs(iso?: string | null): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

/**
 * Categorize leads into the alert buckets. The 5-minute follow-up SLA uses
 * BUSINESS-hours aging (the operator's linear rule); the 3-day check uses plain
 * elapsed time since creation (createdUtc-based, per the plan). "Unactioned" =
 * still `ACTIVE_NEW_LEAD` (the only VinSolutions signal — there is no
 * rep-contact timestamp).
 */
export function evaluateLeadAlerts(input: {
  leads: ReadonlyArray<LeadForAlert>
  now: number
  businessHours?: BusinessHoursCfg
}): LeadAlertBuckets {
  const cfg = input.businessHours ?? DEFAULT_BUSINESS_HOURS
  const buckets: LeadAlertBuckets = {
    noStatus: [],
    unactionedOver5Min: [],
    sittingOver3Days: [],
  }
  for (const l of input.leads) {
    if (!l.leadId) continue
    const status = (l.leadStatus ?? '').trim()
    const statusType = (l.leadStatusType ?? '').trim()
    if (!status && !statusType) {
      buckets.noStatus.push(l.leadId)
      continue
    }
    const isNew = status === NEW_STATUS
    if (!isNew) continue
    const created = parseMs(l.createdUtc)
    if (created == null) continue
    if (businessHoursElapsedMs(created, input.now, cfg) > FIVE_MIN_MS) {
      buckets.unactionedOver5Min.push(l.leadId)
    }
    if (input.now - created > THREE_DAYS_MS) {
      buckets.sittingOver3Days.push(l.leadId)
    }
  }
  return buckets
}
