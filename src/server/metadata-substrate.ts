/**
 * Always-on metadata substrate (SRS Tranche A.5 — the sixth wiki invariant).
 *
 * Every interaction with the wiki or the Brain is recorded here, append-only.
 * Shared between KSG and DSG so the audit trail and the policy primitives
 * stay unified across surfaces. A configuration without this substrate is
 * non-conformant per SRS 1.7.
 *
 * The records live in the per-profile Brain database, table `metadata_audit`.
 * Wider tooling reads the same table for:
 *   - drift observability ("what changed since X and on whose authority")
 *   - renewal cadence ("what hasn't been touched since X")
 *   - feedback-loop closure ("which human-relay item resulted in this edit")
 *   - governance audit ("show me every gate decision and its reason")
 */

import { openBrain, now, uuid, jsonOrNull } from './brain-store'

export type AuditSurface = 'wiki' | 'brain'

export type AuditAction =
  | 'read'
  | 'create'
  | 'update'
  | 'deprecate'
  | 'archive'
  | 'gate_decision'
  | 'tool_call'
  | 'self_improvement'

export type AuditOutcome = 'ok' | 'denied' | 'error'

export type AuditEntry = {
  ts: number
  surface: AuditSurface
  actor: string
  actor_role?: string | null
  action: AuditAction
  target_type?: string | null
  target_id?: string | null
  version_before?: string | null
  version_after?: string | null
  reason?: string | null
  gate_event_id?: string | null
  confidence_state?: string | null
  source_refs?: Array<unknown> | string | null
  outcome?: AuditOutcome | null
  rule?: string | null
}

export type AuditRow = AuditEntry & { id: number }

/**
 * Append a record to the always-on metadata substrate.
 * Returns the assigned audit id, which downstream callers stash as
 * `gate_event_id` on the row they just wrote so the two sides can be joined.
 */
export function recordAudit(
  profile: string,
  entry: AuditEntry,
  options: { profileRoot?: string } = {},
): { id: number; gate_event_id: string } {
  const handle = openBrain(profile, { profileRoot: options.profileRoot })
  try {
    const gateEventId = entry.gate_event_id ?? uuid()
    const res = handle.run(
      `INSERT INTO metadata_audit (
        ts, surface, actor, actor_role, action,
        target_type, target_id, version_before, version_after,
        reason, gate_event_id, confidence_state, source_refs,
        outcome, rule
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      entry.ts ?? now(),
      entry.surface,
      entry.actor,
      entry.actor_role ?? null,
      entry.action,
      entry.target_type ?? null,
      entry.target_id ?? null,
      entry.version_before ?? null,
      entry.version_after ?? null,
      entry.reason ?? null,
      gateEventId,
      entry.confidence_state ?? null,
      jsonOrNull(entry.source_refs),
      entry.outcome ?? null,
      entry.rule ?? null,
    )
    return { id: Number(res.lastInsertRowid), gate_event_id: gateEventId }
  } finally {
    handle.close()
  }
}

/**
 * Drift query: list every interaction with the given target since `since`.
 */
export function listAuditByTarget(
  profile: string,
  target: { type: string; id: string; since?: number },
  options: { profileRoot?: string } = {},
): Array<AuditRow> {
  const handle = openBrain(profile, { profileRoot: options.profileRoot })
  try {
    const since = target.since ?? 0
    return handle.all<AuditRow>(
      `SELECT * FROM metadata_audit
       WHERE target_type = ? AND target_id = ? AND ts >= ?
       ORDER BY ts ASC`,
      target.type,
      target.id,
      since,
    )
  } finally {
    handle.close()
  }
}

export function listAuditByActor(
  profile: string,
  actor: string,
  options: { profileRoot?: string; since?: number; limit?: number } = {},
): Array<AuditRow> {
  const handle = openBrain(profile, { profileRoot: options.profileRoot })
  try {
    return handle.all<AuditRow>(
      `SELECT * FROM metadata_audit
       WHERE actor = ? AND ts >= ?
       ORDER BY ts DESC
       LIMIT ?`,
      actor,
      options.since ?? 0,
      options.limit ?? 500,
    )
  } finally {
    handle.close()
  }
}

/**
 * Renewal cadence: surfaces records that have not been touched since a
 * given cutoff timestamp (e.g., older than 90 days). Returns one row per
 * (target_type, target_id) with the latest touch timestamp.
 */
export function listStaleTargets(
  profile: string,
  cutoff: number,
  options: { profileRoot?: string } = {},
): Array<{ target_type: string; target_id: string; last_touched: number }> {
  const handle = openBrain(profile, { profileRoot: options.profileRoot })
  try {
    return handle.all<{
      target_type: string
      target_id: string
      last_touched: number
    }>(
      `SELECT target_type, target_id, MAX(ts) as last_touched
       FROM metadata_audit
       WHERE target_type IS NOT NULL AND target_id IS NOT NULL
       GROUP BY target_type, target_id
       HAVING MAX(ts) < ?
       ORDER BY last_touched ASC`,
      cutoff,
    )
  } finally {
    handle.close()
  }
}

/**
 * Confirm the metadata substrate is present and recording. Used by the
 * deployment readiness probe to enforce the sixth-invariant requirement.
 */
export function metadataSubstratePresent(
  profile: string,
  options: { profileRoot?: string } = {},
): { ok: boolean; reason?: string } {
  try {
    const handle = openBrain(profile, { profileRoot: options.profileRoot })
    try {
      const row = handle.get<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='metadata_audit'",
      )
      if (!row && !handle.inMemory) {
        return { ok: false, reason: 'metadata_audit table missing' }
      }
      return { ok: true }
    } finally {
      handle.close()
    }
  } catch (err) {
    return { ok: false, reason: (err as Error).message }
  }
}
