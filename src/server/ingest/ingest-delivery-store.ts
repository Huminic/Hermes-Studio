/**
 * ingest_delivery provenance store (HUM-VIN-006), per-profile brain.db.
 *
 * One row per delivery (accepted OR quarantined) with full provenance. Enforces:
 *  - duplicate checksum → NO-OP (unique on profile+checksum).
 *  - corrected data for the same (profile, report_kind, period) → TRANSACTIONAL
 *    supersession (prior active rows marked superseded_by, revision bumped).
 */
import { openBrain, uuid } from '../brain-store'
import type { QuarantineReason, ReportKind } from './vin-contracts'

export type DeliveryInput = {
  profile: string
  dealer: string
  report_kind: ReportKind
  period_start: string | null
  period_end: string | null
  source_filename: string
  source_filter_metadata: Record<string, unknown> | null
  final_filter_metadata: Record<string, unknown> | null
  checksum: string
  parser_version: string
  row_count: number
  validation_evidence: Record<string, unknown>
  status: 'accepted' | 'quarantined'
  quarantine_reason: QuarantineReason | null
}

export type DeliveryRecord = Omit<
  DeliveryInput,
  'source_filter_metadata' | 'final_filter_metadata' | 'validation_evidence'
> & {
  id: string
  revision: number
  superseded_by: string | null
  created_at: number
  source_filter_metadata: Record<string, unknown> | null
  final_filter_metadata: Record<string, unknown> | null
  validation_evidence: Record<string, unknown>
}

export type RecordOutcome = {
  outcome: 'accepted' | 'superseded' | 'quarantined' | 'duplicate'
  id: string
  revision: number
  superseded: Array<string>
}

type Handle = ReturnType<typeof openBrain>

function ensure(profile: string, profileRoot?: string): Handle {
  const h = openBrain(profile, { profileRoot })
  h.exec(
    `CREATE TABLE IF NOT EXISTS ingest_delivery (
       id TEXT PRIMARY KEY, profile TEXT NOT NULL, dealer TEXT, report_kind TEXT NOT NULL,
       period_start TEXT, period_end TEXT, source_filename TEXT,
       source_filter_metadata TEXT, final_filter_metadata TEXT,
       checksum TEXT NOT NULL, parser_version TEXT, row_count INTEGER,
       revision INTEGER NOT NULL DEFAULT 1, validation_evidence TEXT,
       status TEXT NOT NULL, quarantine_reason TEXT,
       superseded_by TEXT, created_at INTEGER NOT NULL
     )`,
  )
  h.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ingest_delivery_checksum ON ingest_delivery(profile, checksum)`)
  h.exec(`CREATE INDEX IF NOT EXISTS ingest_delivery_period ON ingest_delivery(profile, report_kind, period_start, period_end, superseded_by)`)
  return h
}

const j = (v: unknown) => (v == null ? null : JSON.stringify(v))

export function recordDelivery(
  input: DeliveryInput,
  now: number,
  opts: { profileRoot?: string } = {},
): RecordOutcome {
  const h = ensure(input.profile, opts.profileRoot)

  // 1. duplicate checksum → no-op
  const dup = h.get<{ id: string; revision: number }>(
    `SELECT id, revision FROM ingest_delivery WHERE profile = ? AND checksum = ?`,
    input.profile, input.checksum,
  )
  if (dup) return { outcome: 'duplicate', id: dup.id, revision: dup.revision, superseded: [] }

  const id = uuid()

  // 2. quarantined → just record (no supersession, no metric rows elsewhere)
  if (input.status === 'quarantined') {
    insert(h, id, input, 1, now)
    return { outcome: 'quarantined', id, revision: 1, superseded: [] }
  }

  // 3. accepted → transactional same-(profile,kind,period) supersession
  const priors = h.all<{ id: string; revision: number }>(
    `SELECT id, revision FROM ingest_delivery
      WHERE profile = ? AND report_kind = ? AND status = 'accepted'
        AND superseded_by IS NULL
        AND IFNULL(period_start,'') = IFNULL(?, '') AND IFNULL(period_end,'') = IFNULL(?, '')`,
    input.profile, input.report_kind, input.period_start, input.period_end,
  )
  if (priors.length === 0) {
    insert(h, id, input, 1, now)
    return { outcome: 'accepted', id, revision: 1, superseded: [] }
  }
  const revision = Math.max(...priors.map((p) => p.revision)) + 1
  try {
    h.exec('BEGIN')
    for (const p of priors) {
      h.run(`UPDATE ingest_delivery SET superseded_by = ? WHERE id = ?`, id, p.id)
      // metric rows for the prior import (if any) are keyed by import_id elsewhere;
      // provenance-only families have none. Metric deletion is done by the caller
      // that populated them, inside the same logical supersession.
    }
    insert(h, id, input, revision, now)
    h.exec('COMMIT')
  } catch (err) {
    try { h.exec('ROLLBACK') } catch { /* ignore */ }
    throw err
  }
  return { outcome: 'superseded', id, revision, superseded: priors.map((p) => p.id) }
}

function insert(h: Handle, id: string, d: DeliveryInput, revision: number, now: number): void {
  h.run(
    `INSERT INTO ingest_delivery
       (id, profile, dealer, report_kind, period_start, period_end, source_filename,
        source_filter_metadata, final_filter_metadata, checksum, parser_version, row_count,
        revision, validation_evidence, status, quarantine_reason, superseded_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    id, d.profile, d.dealer, d.report_kind, d.period_start, d.period_end, d.source_filename,
    j(d.source_filter_metadata), j(d.final_filter_metadata), d.checksum, d.parser_version, d.row_count,
    revision, j(d.validation_evidence), d.status, d.quarantine_reason, now,
  )
}

export function listDeliveries(
  profile: string,
  opts: { limit?: number; profileRoot?: string } = {},
): Array<DeliveryRecord> {
  const h = ensure(profile, opts.profileRoot)
  const rows = h.all<Record<string, unknown>>(
    `SELECT * FROM ingest_delivery WHERE profile = ? ORDER BY created_at DESC LIMIT ?`,
    profile, opts.limit ?? 200,
  )
  const parse = (v: unknown) => {
    try { return v ? JSON.parse(v as string) : null } catch { return null }
  }
  return rows.map((r) => ({
    ...(r as unknown as DeliveryRecord),
    source_filter_metadata: parse(r.source_filter_metadata),
    final_filter_metadata: parse(r.final_filter_metadata),
    validation_evidence: parse(r.validation_evidence) ?? {},
  }))
}
