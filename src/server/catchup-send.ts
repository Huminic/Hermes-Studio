/**
 * Catch-up send loop (N5) — paced dispatch + honest, retryable ledger.
 *
 * Extracted from `scripts/catchup-followup.ts` so the pacing, retry and
 * ledger-cleanup logic can be unit-tested with an injected sender and clock
 * (no live broker, no real timers).
 *
 * Three behaviours the live Ford tranche-1 run showed we needed:
 *   1. PACING — the CommGate SMS per-minute cap (default 5) blocked 4 of 10 sends
 *      with `rate-cap-exceeded`. We now send at most (cap-1) per rolling 60s,
 *      sleeping a fixed interval between sends so we stay under the gate.
 *   2. RETRYABLE LEDGER — a send that ends `blocked` with `rate-cap-exceeded`, or
 *      `failed`, must NOT leave an `automation_runs` row that makes the recipient
 *      look "already followed up" on the next run. Those rows are deleted here.
 *      Terminal blocks (opt-out/DNC/consent/invalid number) keep their row.
 *   3. RETRY — a `failed` send is retried ONCE after a delay before giving up.
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
  /** Recipients still owed a message (rate-capped + finally-failed) — re-run to catch them. */
  remaining: number
}

/** The gate rule that means "hit the per-minute/per-hour cap" — a RETRYABLE block. */
export const RATE_CAP_RULE = 'rate-cap-exceeded'
/** Retry delay after a `failed` send, before the single retry. */
export const FAILED_RETRY_DELAY_MS = 20_000
/** SMS per-minute cap default when the profile config does not set one (matches comms-rate-limiter). */
export const DEFAULT_SMS_PER_MINUTE_CAP = 5

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
  return o.action === 'failed' || (o.action === 'blocked' && o.gate_rule === RATE_CAP_RULE)
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
  deps: CatchupSendDeps
}): Promise<CatchupSendSummary> {
  const { items, perMinute } = input
  const send = input.deps.send
  const deleteRun = input.deps.deleteRun
  const sleep = input.deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const log = input.deps.log ?? ((l: string) => console.log(l))

  const summary: CatchupSendSummary = {
    perMinute,
    attempted: 0,
    sent: 0,
    blockedByReason: {},
    failed: 0,
    retried: 0,
    skipped: 0,
    remaining: 0,
  }

  const gapMs = Math.ceil(60_000 / Math.max(1, perMinute))
  log(`pacing: ${perMinute}/min (≈${Math.round(gapMs / 1000)}s between sends)`)

  /** One attempt: send, then drop the ledger row if the outcome is retryable. */
  const attempt = async (item: CatchupSendItem): Promise<CatchupSendOutcome> => {
    const o = await send(item)
    if (isRetryable(o) && o.run_id && deleteRun) deleteRun(o.run_id)
    return o
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
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

  // Recipients still owed a message: rate-capped blocks + finally-failed sends.
  summary.remaining =
    (summary.blockedByReason[RATE_CAP_RULE] ?? 0) + summary.failed
  return summary
}
