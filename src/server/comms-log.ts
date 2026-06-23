/**
 * comms_log helpers — a thin, shared surface over the per-profile `comms_log`
 * table (defined in brain-schema.ts). Every outbound/inbound send records an
 * `outcome` of 'ok' | 'error' here.
 *
 * - `recordCommsOutcome` is a best-effort writer used by send paths that do not
 *   already log to comms_log (e.g. the ADF/Vapi lead-notification Resend path),
 *   so their failures become observable to the Sentinel. It NEVER throws and
 *   NEVER changes caller behaviour.
 * - `countCommsErrors` is the reader the Sentinel's notifications/delivery check
 *   uses to detect a burst of send failures in a recent window.
 *
 * `comms-mcp-handlers.logComms` writes the same table directly; this module is
 * intentionally additive and does not replace it.
 */

import { openBrain } from './brain-store'

// Monotonic suffix so two sends in the same millisecond (e.g. a multi-recipient
// Promise.all) never collide on the comms_log primary key and lose a row.
let _seq = 0

export type CommsOutcomeRow = {
  direction: 'outbound' | 'inbound'
  channel: 'email' | 'sms' | 'voice'
  actor: string
  recipients: Array<string>
  subject?: string | null
  body_summary?: string | null
  external_id?: string | null
  outcome: 'ok' | 'error'
}

/**
 * Best-effort append to comms_log. Swallows every error (a telemetry write must
 * never break a send). Returns the row id on success, null otherwise.
 */
export function recordCommsOutcome(
  profile: string,
  row: CommsOutcomeRow,
  nowMs: number = Date.now(),
): string | null {
  const id = `cl_${nowMs}_${(_seq = (_seq + 1) % 1e9)}`
  let handle: ReturnType<typeof openBrain> | null = null
  try {
    handle = openBrain(profile)
    handle.run(
      `INSERT INTO comms_log (
        id, ts, direction, channel, actor, recipients,
        subject, body_summary, external_id, outcome, audit_id, tenant
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      nowMs,
      row.direction,
      row.channel,
      row.actor,
      JSON.stringify(row.recipients ?? []),
      row.subject ?? null,
      row.body_summary ?? null,
      row.external_id ?? null,
      row.outcome,
      null,
      profile,
    )
    return id
  } catch {
    return null
  } finally {
    try {
      handle?.close()
    } catch {
      /* ignore */
    }
  }
}

export type CommsErrorSummary = {
  /** Total error-outcome rows in the window. */
  count: number
  /** Per-channel error counts (e.g. { email: 2, sms: 1 }). */
  byChannel: Record<string, number>
}

/**
 * Count failed (outcome='error') outbound sends in the last `sinceMs` window.
 * Read-only, best-effort: any failure (incl. an unavailable Brain) yields a
 * zero summary so the Sentinel never raises a false alarm on a read error.
 */
export function countCommsErrors(
  profile: string,
  sinceMs: number,
  nowMs: number = Date.now(),
): CommsErrorSummary {
  const cutoff = nowMs - sinceMs
  let handle: ReturnType<typeof openBrain> | null = null
  try {
    handle = openBrain(profile)
    const rows = handle.all<{ channel: string; n: number }>(
      `SELECT channel, COUNT(*) AS n
         FROM comms_log
        WHERE outcome='error' AND direction='outbound' AND ts >= ?
        GROUP BY channel`,
      cutoff,
    )
    const byChannel: Record<string, number> = {}
    let count = 0
    for (const r of rows) {
      byChannel[r.channel] = r.n
      count += r.n
    }
    return { count, byChannel }
  } catch {
    return { count: 0, byChannel: {} }
  } finally {
    try {
      handle?.close()
    } catch {
      /* ignore */
    }
  }
}
