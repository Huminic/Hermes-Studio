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

export type CommsOutcomeCounts = { ok: number; error: number; total: number }

/**
 * Count outbound sends by outcome over the last `sinceMs` window (optionally
 * scoped to a `channel`). Used by the Sentinel's rolling-window delivery-RATE
 * check to catch a SUSTAINED failure (e.g. a 60% lead-notify email failure that
 * runs for weeks) which the short 1h burst check misses because leads arrive in
 * bursts hours apart. Read-only, best-effort: a read error yields zeroes so the
 * Sentinel never false-alarms on a read failure.
 */
export function countCommsByOutcome(
  profile: string,
  sinceMs: number,
  nowMs: number = Date.now(),
  channel?: string,
): CommsOutcomeCounts {
  const cutoff = nowMs - sinceMs
  let handle: ReturnType<typeof openBrain> | null = null
  try {
    handle = openBrain(profile)
    const rows = handle.all<{ outcome: string; n: number }>(
      `SELECT outcome, COUNT(*) AS n
         FROM comms_log
        WHERE direction='outbound' AND ts >= ?${channel ? ' AND channel = ?' : ''}
        GROUP BY outcome`,
      ...(channel ? [cutoff, channel] : [cutoff]),
    )
    let ok = 0
    let error = 0
    for (const r of rows) {
      if (r.outcome === 'ok') ok += r.n
      else if (r.outcome === 'error') error += r.n
    }
    return { ok, error, total: ok + error }
  } catch {
    return { ok: 0, error: 0, total: 0 }
  } finally {
    try {
      handle?.close()
    } catch {
      /* ignore */
    }
  }
}

export type CommsRecipientCounts = {
  recipient: string
  ok: number
  error: number
  total: number
}

/**
 * Count outbound sends by INDIVIDUAL RECIPIENT over the last `sinceMs` window
 * (optionally scoped to a `channel`). Unnests the `recipients` JSON array so a
 * fan-out row that names one address per send is attributed to that address.
 *
 * Powers the Sentinel's per-recipient health check: a single dead/wrong entry in
 * a dealer's notification list (e.g. a mistyped `.net` domain, or an external
 * mailbox that bounces every time) shows up as one recipient at ~0% delivery
 * while the aggregate rate still looks fine. This surfaces the exact address so
 * the operator can fix that one list entry.
 *
 * Read-only, best-effort: a read error yields an empty array so the Sentinel
 * never false-alarms on a read failure.
 */
export function countCommsByRecipient(
  profile: string,
  sinceMs: number,
  nowMs: number = Date.now(),
  channel?: string,
): Array<CommsRecipientCounts> {
  const cutoff = nowMs - sinceMs
  let handle: ReturnType<typeof openBrain> | null = null
  try {
    handle = openBrain(profile)
    const rows = handle.all<{ recipient: string; outcome: string; n: number }>(
      `SELECT je.value AS recipient, outcome, COUNT(*) AS n
         FROM comms_log, json_each(comms_log.recipients) je
        WHERE direction='outbound' AND ts >= ?${channel ? ' AND channel = ?' : ''}
        GROUP BY je.value, outcome`,
      ...(channel ? [cutoff, channel] : [cutoff]),
    )
    const byRecipient = new Map<string, CommsRecipientCounts>()
    for (const r of rows) {
      if (!r.recipient) continue
      const cur =
        byRecipient.get(r.recipient) ??
        { recipient: r.recipient, ok: 0, error: 0, total: 0 }
      if (r.outcome === 'ok') cur.ok += r.n
      else if (r.outcome === 'error') cur.error += r.n
      cur.total = cur.ok + cur.error
      byRecipient.set(r.recipient, cur)
    }
    return [...byRecipient.values()]
  } catch {
    return []
  } finally {
    try {
      handle?.close()
    } catch {
      /* ignore */
    }
  }
}
