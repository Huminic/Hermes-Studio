/**
 * Send-window gating for message CLASSES (immediate lead-engagement vs 24-hour
 * follow-up). The comms-gate business-hours layer is a single global window
 * applied to every sms/voice send; it cannot express two different windows, so
 * this module adds a per-class window check used by the catch-up scripts and
 * (staged) the automation driver.
 *
 * Defaults are A2P/CTIA/TCPA-compliant and are the SINGLE SOURCE OF TRUTH:
 *   - IMMEDIATE lead-engagement: 08:00–09:00 (pre-open catch for overnight
 *     arrivals) + 18:00–20:00 (evening after-hours, 6–8pm). Off during business
 *     hours (09:00–18:00) and quiet hours (20:00–08:00). Overnight arrivals
 *     resolve to the next open = 08:00. (Operator policy 2026-07-08: 6–8pm + 8am.)
 *   - 24-HOUR FOLLOW-UP: 08:00–21:00 (the full A2P daytime window); the send is
 *     anniversary-timed (arrival + 24h) and only bounded by this window.
 *
 * TCPA quiet hours (before 08:00 / after 21:00 local) can never fall inside any
 * default window (the immediate window ends even earlier, at 20:00).
 * Timezone resolves from send_windows.tz, else comms.business_hours.tz, else the
 * platform TCPA default. Time math mirrors comms-gate.withinBusinessHours.
 */

export type SendWindow = { start: string; end: string }

export const DEFAULT_IMMEDIATE_WINDOWS: SendWindow[] = [
  { start: '08:00', end: '09:00' },
  { start: '18:00', end: '20:00' },
]

export const DEFAULT_FOLLOWUP_WINDOWS: SendWindow[] = [
  { start: '08:00', end: '21:00' },
]

/** Default timezone when neither send_windows nor business_hours declares one. */
const DEFAULT_TZ = 'America/New_York'

const MINUTES_PER_DAY = 24 * 60

/** Minutes-since-midnight for "HH:MM". */
function hm(s: string): number {
  const [h, m] = s.split(':').map((x) => parseInt(x, 10))
  return h * 60 + m
}

/** Current wall-clock minute-of-day in the given timezone. */
function minutesOfDay(tz: string, nowMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(nowMs))
  const hh = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const mm = parts.find((p) => p.type === 'minute')?.value ?? '00'
  return (parseInt(hh, 10) % 24) * 60 + parseInt(mm, 10)
}

/** Is `min` (minute-of-day) inside [start,end)? Supports overnight wraparound. */
function insideWindow(min: number, w: SendWindow): boolean {
  const start = hm(w.start)
  const end = hm(w.end)
  return start <= end ? min >= start && min < end : min >= start || min < end
}

export type WindowState = {
  open: boolean
  /**
   * Approximate epoch-ms of the next window opening — for DISPLAY/logging only.
   * It is NOT DST-exact (computed by adding a wall-clock minute-delta to now, so
   * across a DST transition it can be off by an hour). A scheduler MUST NOT fire
   * a send at this instant without re-checking `open` live at that time (which is
   * how the catch-up scripts already guard). See issues.md (nextOpenMs DST debt).
   */
  nextOpenMs: number | null
}

/**
 * Evaluate a set of daily windows at `nowMs` in `tz`. Returns whether any window
 * is currently open and, when closed, the epoch-ms of the NEXT window opening
 * (searching today then the following day). Windows are non-wrapping in the
 * defaults, but wraparound is tolerated for `open`.
 */
export function windowState(
  windows: SendWindow[],
  tz: string,
  nowMs: number,
): WindowState {
  if (!windows.length) return { open: false, nextOpenMs: null }

  const cur = minutesOfDay(tz, nowMs)
  if (windows.some((w) => insideWindow(cur, w))) return { open: true, nextOpenMs: null }

  // Find the smallest positive minute-delta to a window start, today or tomorrow.
  let bestDelta = Infinity
  for (const dayOffset of [0, 1]) {
    for (const w of windows) {
      const start = hm(w.start) + dayOffset * MINUTES_PER_DAY
      const delta = start - cur
      if (delta > 0 && delta < bestDelta) bestDelta = delta
    }
  }
  if (!Number.isFinite(bestDelta)) return { open: false, nextOpenMs: null }

  // Convert the minute-delta to an absolute instant by anchoring on the current
  // minute boundary in the target tz (drop seconds/millis so equality is exact).
  const anchor = nowMs - (nowMs % 60_000)
  const secondsWithinMinute = secondsOfMinute(tz, nowMs)
  const nextOpenMs = anchor + bestDelta * 60_000 - secondsWithinMinute * 1000
  return { open: false, nextOpenMs }
}

/** Seconds component of the current wall-clock minute in `tz` (for exact anchoring). */
function secondsOfMinute(tz: string, nowMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(nowMs))
  const ss = parts.find((p) => p.type === 'second')?.value ?? '00'
  return parseInt(ss, 10) % 60
}

/** Minimal config shape this module reads (subset of StudioConfig.comms). */
export type SendWindowConfig = {
  send_windows?: {
    tz?: string
    immediate?: SendWindow[]
    followup?: SendWindow[]
  }
  business_hours?: { tz?: string; start?: string; end?: string }
}

function resolveTz(cfg: SendWindowConfig | undefined): string {
  return cfg?.send_windows?.tz ?? cfg?.business_hours?.tz ?? DEFAULT_TZ
}

export function immediateWindowState(
  cfg: SendWindowConfig | undefined,
  nowMs: number,
): WindowState {
  const windows = cfg?.send_windows?.immediate ?? DEFAULT_IMMEDIATE_WINDOWS
  return windowState(windows, resolveTz(cfg), nowMs)
}

export function followupWindowState(
  cfg: SendWindowConfig | undefined,
  nowMs: number,
): WindowState {
  const windows = cfg?.send_windows?.followup ?? DEFAULT_FOLLOWUP_WINDOWS
  return windowState(windows, resolveTz(cfg), nowMs)
}
