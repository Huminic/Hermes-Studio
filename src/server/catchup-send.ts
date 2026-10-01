/**
 * Catch-up send loop (N5/N6) — paced dispatch + honest, retryable ledger.
 *
 * Extracted from `scripts/catchup-followup.ts` so the pacing, retry and
 * ledger-cleanup logic can be unit-tested with an injected sender and clock
 * (no live broker, no real timers).
 *
 * Behaviours the live Ford tranches showed we needed:
 *   1. PACING — the CommGate SMS per-minute cap (default 5) blocked 4 of 10 sends
 *      with `rate-cap-exceeded`. We now send at most (cap-1) per rolling 60s,
 *      sleeping a fixed interval between sends so we stay under the gate.
 *   2. RETRYABLE LEDGER — a send that ends `blocked` with a RETRYABLE rule
 *      (`rate-cap-exceeded` or `outside-business-hours`), or `failed`, must NOT
 *      leave an `automation_runs` row that makes the recipient look "already
 *      followed up" on the next run. Those rows are deleted here. Terminal blocks
 *      (opt-out/DNC/consent/invalid number/blacklist) keep their row.
 *   3. RETRY — a `failed` send is retried ONCE after a delay before giving up.
 *   4. CLEAN STOP (N6) — before each send, if the per-hour cap is already reached
 *      or the window has closed, STOP the run cleanly ("N remaining, re-run later")
 *      instead of hammering sends the gate will only reject.
 */

/** One recipient the loop will attempt. */
export type CatchupSendItem = {
  phone: string
  firstName?: string | null
  vehicle?: string | null
  leadId?: string | null
}

/** Outcome of one send attempt (the shape `sendAutomationNow` returns). */
export type CatchupSendOutcome = {
  action: 'sent' | 'blocked' | 'failed' | 'skipped'
  reason: string
  gate_rule?: string | null
  /** The ledger row id written for this attempt (deleted when the outcome is retryable). */
  run_id?: string | null
}

export type CatchupSendDeps = {
  /** Perform one gated send for a recipient. */
  send: (item: CatchupSendItem) => Promise<CatchupSendOutcome>
  /** Delete a ledger row (called for retryable outcomes so a retry is not blocked). */
  deleteRun?: (runId: string) => void
  /** Sleep (injected so tests do not wait on real time). */
  sleep?: (ms: number) => Promise<void>
  /** Clock (injected so the window/hour guards are testable). Defaults to Date.now. */
  now?: () => number
  /** Progress line sink (defaults to console.log). */
  log?: (line: string) => void
}

export type CatchupSendSummary = {
  /** Effective sends-per-minute pacing that was applied. */
  perMinute: number
  attempted: number
  sent: number
  /** Blocked counts keyed by gate rule (or reason when the rule is absent). */
  blockedByReason: Record<string, number>
  failed: number
  /** How many recipients were retried after a first failed attempt. */
  retried: number
  skipped: number
  /** Recipients still owed a message (un-attempted + rate/window-capped + finally-failed). */
  remaining: number
  /** Set when the loop stopped early (hourly cap reached / window closed); else null. */
  stoppedReason: string | null
}

/** The gate rule that means "hit the per-minute/per-hour cap" — a RETRYABLE block. */
export const RATE_CAP_RULE = 'rate-cap-exceeded'
/** The gate rule that means "the A2P send window has closed" — a RETRYABLE block (N6). */
export const WINDOW_CLOSED_RULE = 'outside-business-hours'
/** Block gate rules whose ledger row must NOT strand a retry (re-run catches them). */
const RETRYABLE_BLOCK_RULES = new Set<string>([RATE_CAP_RULE, WINDOW_CLOSED_RULE])
/** Retry delay after a `failed` send, before the single retry. */
export const FAILED_RETRY_DELAY_MS = 20_000
/** SMS per-minute cap default when the profile config does not set one (matches comms-rate-limiter). */
export const DEFAULT_SMS_PER_MINUTE_CAP = 5
/** SMS per-hour cap default when the profile config does not set one (matches comms-rate-limiter). */
export const DEFAULT_SMS_PER_HOUR_CAP = 60

/**
 * Effective sends-per-minute: one below the gate cap so we stay UNDER it, then
 * lowered (never raised) by an optional operator override. Floored at 1.
 */
export function effectivePerMinute(cap: number, override?: number | null): number {
  const belowCap = Math.max(1, Math.floor(cap) - 1)
  if (override == null || !Number.isFinite(override)) return belowCap
  return Math.max(1, Math.min(Math.floor(override), belowCap))
}

/** Is this outcome retryable (its ledger row must not block a future send)? */
function isRetryable(o: CatchupSendOutcome): boolean {
  return (
    o.action === 'failed' ||
    (o.action === 'blocked' && !!o.gate_rule && RETRYABLE_BLOCK_RULES.has(o.gate_rule))
  )
}

/**
 * Run the paced send loop over `items`.
 *
 * - Sleeps `60_000 / perMinute` ms between sends (not after the last) to hold the rate.
 * - Deletes the ledger row for any retryable outcome (rate-cap block / failed).
 * - Retries a `failed` send ONCE after `FAILED_RETRY_DELAY_MS`.
 * - Returns the end-of-run tally.
 */
export async function runCatchupSends(input: {
  items: CatchupSendItem[]
  perMinute: number
  /** Per-hour SMS cap (default 60): once this many have been sent in the rolling
   * hour the loop STOPS cleanly rather than firing sends the gate will block. */
  perHour?: number | null
  /** Epoch-ms the A2P send window closes; when `now()` reaches it the loop STOPS
   * cleanly. Null/undefined ⇒ no window guard (caller is already inside it). */
  windowCloseMs?: number | null
  deps: CatchupSendDeps
}): Promise<CatchupSendSummary> {
  const { items, perMinute } = input
  const send = input.deps.send
  const deleteRun = input.deps.deleteRun
  const sleep = input.deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const now = input.deps.now ?? (() => Date.now())
  const log = input.deps.log ?? ((l: string) => console.log(l))
  const perHour = input.perHour ?? null
  const windowCloseMs = input.windowCloseMs ?? null

  const summary: CatchupSendSummary = {
    perMinute,
    attempted: 0,
    sent: 0,
    blockedByReason: {},
    failed: 0,
    retried: 0,
    skipped: 0,
    remaining: 0,
    stoppedReason: null,
  }

  const gapMs = Math.ceil(60_000 / Math.max(1, perMinute))
  log(`pacing: ${perMinute}/min (≈${Math.round(gapMs / 1000)}s between sends)`)

  /** One attempt: send, then drop the ledger row if the outcome is retryable. */
  const attempt = async (item: CatchupSendItem): Promise<CatchupSendOutcome> => {
    const o = await send(item)
    if (isRetryable(o) && o.run_id && deleteRun) deleteRun(o.run_id)
    return o
  }

  /** Timestamps of successful sends, for the rolling-hour cap check. */
  const sentTimes: number[] = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]

    // N6.2 — stop cleanly BEFORE attempting a send the gate would only reject.
    const t = now()
    if (windowCloseMs != null && t >= windowCloseMs) {
      summary.stoppedReason = `window closing — ${items.length - i} remaining, re-run later`
      log(`  STOP: ${summary.stoppedReason}`)
      break
    }
    if (perHour != null && sentTimes.filter((s) => s > t - 3_600_000).length >= perHour) {
      summary.stoppedReason = `hourly cap reached — ${items.length - i} remaining, re-run later`
      log(`  STOP: ${summary.stoppedReason}`)
      break
    }

    summary.attempted++

    let outcome = await attempt(item)

    // A failed send gets ONE retry after a short delay.
    if (outcome.action === 'failed') {
      log(`  RETRY in ${Math.round(FAILED_RETRY_DELAY_MS / 1000)}s: ${item.phone} — ${outcome.reason}`)
      await sleep(FAILED_RETRY_DELAY_MS)
      summary.retried++
      outcome = await attempt(item)
    }

    if (outcome.action === 'sent') {
      summary.sent++
      sentTimes.push(now())
    } else if (outcome.action === 'blocked') {
      const key = outcome.gate_rule ?? outcome.reason
      summary.blockedByReason[key] = (summary.blockedByReason[key] ?? 0) + 1
    } else if (outcome.action === 'failed') {
      summary.failed++
    } else {
      summary.skipped++
    }
    log(`  ${outcome.action.toUpperCase()}: ${item.phone} — ${outcome.reason}`)

    // Pace: hold under the per-minute cap. No sleep after the final send.
    if (i < items.length - 1) await sleep(gapMs)
  }

  // Recipients still owed a message: un-attempted (early stop) + retryable blocks
  // (rate-cap + window-closed) + finally-failed sends.
  summary.remaining =
    (items.length - summary.attempted) +
    (summary.blockedByReason[RATE_CAP_RULE] ?? 0) +
    (summary.blockedByReason[WINDOW_CLOSED_RULE] ?? 0) +
    summary.failed
  return summary
}
