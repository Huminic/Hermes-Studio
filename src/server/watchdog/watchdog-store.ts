/**
 * Watchdog finding store — persistence + dedup + status lifecycle in the
 * per-profile brain.db (mirrors hunches-store). One row per stable `key`
 * (rule + entity), so re-detecting the same issue updates rather than duplicates
 * (24h dedup is inherent). Alerting fires on new / escalated only.
 *
 * Status: open (shown) · ignored (muted, in the modal) · dismissed (cleared by
 * user) · resolved (auto-cleared: no longer detected).
 */
import { openBrain } from '../brain-store'
import type {
  FindingStatus,
  Priority,
  WatchdogCategory,
  WatchdogFinding,
} from './watchdog-types'

export type StoredFinding = {
  key: string
  profile: string
  rule_id: string
  category: WatchdogCategory
  priority: Priority
  issue: string
  name: string
  details: string
  evidence: Record<string, unknown>
  status: FindingStatus
  first_seen: number
  last_seen: number
  alerted_at: number | null
}

const PRIORITY_RANK: Record<Priority, number> = { low: 0, medium: 1, high: 2 }

type Handle = ReturnType<typeof openBrain>

function ensure(profile: string, profileRoot?: string): Handle {
  const h = openBrain(profile, { profileRoot })
  h.exec(
    `CREATE TABLE IF NOT EXISTS watchdog_finding (
       key         TEXT PRIMARY KEY,
       profile     TEXT NOT NULL,
       rule_id     TEXT NOT NULL,
       category    TEXT NOT NULL,
       priority    TEXT NOT NULL,
       issue       TEXT NOT NULL,
       name        TEXT NOT NULL,
       details     TEXT NOT NULL,
       evidence    TEXT,
       status      TEXT NOT NULL DEFAULT 'open',
       first_seen  INTEGER NOT NULL,
       last_seen   INTEGER NOT NULL,
       alerted_at  INTEGER
     )`,
  )
  h.exec(
    `CREATE INDEX IF NOT EXISTS watchdog_finding_status ON watchdog_finding(profile, status, priority)`,
  )
  return h
}

export type UpsertResult = { isNew: boolean; escalated: boolean }

/** Insert or update a finding by key. Returns whether it's newly-seen or has
 *  escalated in priority (both are alert-worthy). Dismissed/ignored stay muted. */
export function upsertFinding(
  finding: WatchdogFinding,
  now: number,
  opts: { profileRoot?: string } = {},
): UpsertResult {
  const h = ensure(finding.profile, opts.profileRoot)
  const prev = h.get<{ priority: Priority; status: FindingStatus }>(
    `SELECT priority, status FROM watchdog_finding WHERE key = ?`,
    finding.key,
  )
  const evidence = JSON.stringify(finding.evidence ?? {})
  if (!prev) {
    h.run(
      `INSERT INTO watchdog_finding
         (key, profile, rule_id, category, priority, issue, name, details, evidence, status, first_seen, last_seen, alerted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, NULL)`,
      finding.key, finding.profile, finding.rule_id, finding.category,
      finding.priority, finding.issue, finding.name, finding.details, evidence, now, now,
    )
    return { isNew: true, escalated: false }
  }
  // A user-muted/dismissed finding stays suppressed; only bump last_seen so it
  // isn't auto-resolved out from under the user.
  if (prev.status === 'dismissed' || prev.status === 'ignored') {
    h.run(`UPDATE watchdog_finding SET last_seen = ? WHERE key = ?`, now, finding.key)
    return { isNew: false, escalated: false }
  }
  const escalated = PRIORITY_RANK[finding.priority] > PRIORITY_RANK[prev.priority]
  h.run(
    `UPDATE watchdog_finding
        SET priority = ?, issue = ?, name = ?, details = ?, evidence = ?, last_seen = ?, status = 'open'
      WHERE key = ?`,
    finding.priority, finding.issue, finding.name, finding.details, evidence, now, finding.key,
  )
  return { isNew: false, escalated }
}

function rowToFinding(r: StoredFinding & { evidence: string | null }): StoredFinding {
  let ev: Record<string, unknown> = {}
  try {
    ev = r.evidence ? (JSON.parse(r.evidence) as Record<string, unknown>) : {}
  } catch {
    ev = {}
  }
  return { ...r, evidence: ev }
}

export function listFindings(
  profile: string,
  opts: { status?: FindingStatus; limit?: number; profileRoot?: string } = {},
): Array<StoredFinding> {
  const h = ensure(profile, opts.profileRoot)
  const limit = opts.limit ?? 200
  const rows = opts.status
    ? h.all<StoredFinding & { evidence: string | null }>(
        `SELECT * FROM watchdog_finding WHERE profile = ? AND status = ?
         ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, last_seen DESC
         LIMIT ?`,
        profile, opts.status, limit,
      )
    : h.all<StoredFinding & { evidence: string | null }>(
        `SELECT * FROM watchdog_finding WHERE profile = ?
         ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, last_seen DESC
         LIMIT ?`,
        profile, limit,
      )
  return rows.map(rowToFinding)
}

/** Set a finding's status (dismiss / ignore / reopen). Returns true if changed. */
export function setFindingStatus(
  profile: string,
  key: string,
  status: FindingStatus,
  opts: { profileRoot?: string } = {},
): boolean {
  const h = ensure(profile, opts.profileRoot)
  const res = h.run(
    `UPDATE watchdog_finding SET status = ? WHERE profile = ? AND key = ?`,
    status, profile, key,
  )
  return res.changes > 0
}

export function markAlerted(
  profile: string,
  key: string,
  now: number,
  opts: { profileRoot?: string } = {},
): void {
  const h = ensure(profile, opts.profileRoot)
  h.run(`UPDATE watchdog_finding SET alerted_at = ? WHERE profile = ? AND key = ?`, now, profile, key)
}

/** Auto-resolve OPEN findings not seen in this pass (they cleared). Never
 *  touches dismissed/ignored. Returns the count resolved. */
export function resolveStale(
  profile: string,
  seenKeys: Array<string>,
  now: number,
  opts: { profileRoot?: string } = {},
): number {
  const h = ensure(profile, opts.profileRoot)
  const open = h.all<{ key: string }>(
    `SELECT key FROM watchdog_finding WHERE profile = ? AND status = 'open'`,
    profile,
  )
  const seen = new Set(seenKeys)
  let n = 0
  for (const row of open) {
    if (!seen.has(row.key)) {
      h.run(`UPDATE watchdog_finding SET status = 'resolved', last_seen = ? WHERE key = ?`, now, row.key)
      n++
    }
  }
  return n
}
