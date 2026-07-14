/**
 * Activity log reader — a customer-facing feed of comms/notification/send events.
 *
 * Reads the per-profile `comms_log` (every outbound/inbound send + lead
 * notification records an outcome row) and returns a normalized, most-recent-first
 * activity list. Pure read; no external calls. Generic per-profile.
 */

import { openBrain } from './brain-store'

export type ActivityItem = {
  ts: number
  direction: 'outbound' | 'inbound'
  channel: string
  actor: string
  recipients: Array<string>
  outcome: 'ok' | 'error'
  summary: string | null
}

type RawRow = {
  ts: number
  direction: string
  channel: string
  actor: string
  recipients: string | null
  subject: string | null
  body_summary: string | null
  outcome: string
}

function parseRecipients(raw: string | null): Array<string> {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/**
 * Recent activity for a profile, newest first. `sinceMs` optionally bounds the
 * window (default: unbounded, capped by `limit`). Never throws — a missing table
 * or DB returns [].
 */
export function listRecentActivity(
  profile: string,
  opts: { limit?: number; sinceMs?: number; now?: number } = {},
): Array<ActivityItem> {
  const limit = Math.min(500, Math.max(1, opts.limit ?? 100))
  let handle: ReturnType<typeof openBrain> | null = null
  try {
    handle = openBrain(profile)
    const where = opts.sinceMs != null ? 'WHERE ts >= ?' : ''
    const params: Array<number> = opts.sinceMs != null ? [opts.sinceMs, limit] : [limit]
    const rows = handle.all<RawRow>(
      `SELECT ts, direction, channel, actor, recipients, subject, body_summary, outcome
         FROM comms_log ${where}
        ORDER BY ts DESC
        LIMIT ?`,
      ...params,
    )
    return rows.map((r) => ({
      ts: r.ts,
      direction: r.direction === 'inbound' ? 'inbound' : 'outbound',
      channel: r.channel,
      actor: r.actor,
      recipients: parseRecipients(r.recipients),
      outcome: r.outcome === 'error' ? 'error' : 'ok',
      summary: r.body_summary ?? r.subject ?? null,
    }))
  } catch {
    return []
  } finally {
    handle?.close()
  }
}

/** Rolling counts for the feed header (last 24h): totals + failures by channel. */
export function activitySummary(
  profile: string,
  opts: { now?: number } = {},
): { total: number; failures: number; byChannel: Record<string, number> } {
  const now = opts.now ?? Date.now()
  const items = listRecentActivity(profile, { limit: 500, sinceMs: now - 24 * 60 * 60_000 })
  const byChannel: Record<string, number> = {}
  let failures = 0
  for (const i of items) {
    byChannel[i.channel] = (byChannel[i.channel] ?? 0) + 1
    if (i.outcome === 'error') failures++
  }
  return { total: items.length, failures, byChannel }
}
