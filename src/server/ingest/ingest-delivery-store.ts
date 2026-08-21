/**
 * ingest_delivery provenance + ingest_row analytical store (HUM-VIN-006),
 * per-profile brain.db.
 *
 *  - ingest_delivery: one row per delivery (accepted OR quarantined) with full
 *    provenance, incl. separated source_row_count vs accepted_row_count.
 *  - ingest_row: the accepted, IMMUTABLE analytical rows (generic row JSON =
 *    every source cell with ISO-resolved dates), linked to their delivery. Only
 *    ACCEPTED deliveries write rows; quarantines write ZERO analytical rows.
 *
 * Atomicity (single transaction per accepted delivery):
 *  - duplicate checksum → NO-OP (no delivery, no rows).
 *  - corrected same (profile, report_kind, period) → supersede prior active
 *    delivery + insert the new delivery + all new rows atomically, so active-row
 *    queries (superseded_by IS NULL) never mix revisions.
 */
import { openBrain, uuid } from '../brain-store'
import type { QuarantineReason, ReportKind } from './vin-contracts'

export type DeliveryInput = {
  profile: string
  dealer: string
  /** 'unknown' for malformed/unrecognized workbooks (recorded, quarantined). */
  report_kind: ReportKind | 'unknown'
  period_start: string | null
  period_end: string | null
  source_filename: string
  source_filter_metadata: Record<string, unknown> | null
  final_filter_metadata: Record<string, unknown> | null
  checksum: string
  parser_version: string
  /** observed rows in the source (preserved even when quarantined). */
  source_row_count: number
  /** rows accepted into ingest_row (0 for quarantines). */
  accepted_row_count: number
  /** header (column names) for the accepted rows. */
  header: Array<string>
  validation_evidence: Record<string, unknown>
  status: 'accepted' | 'quarantined'
  quarantine_reason: QuarantineReason | null
}

export type RecordOutcome = {
  outcome: 'accepted' | 'superseded' | 'quarantined' | 'duplicate'
  id: string
  revision: number
  superseded: Array<string>
  accepted_rows: number
}

export type ActiveRow = {
  delivery_id: string
  report_kind: string
  period_start: string | null
  period_end: string | null
  header: Array<string>
  row_index: number
  row: Array<string>
}

type Handle = ReturnType<typeof openBrain>

function ensure(profile: string, profileRoot?: string): Handle {
  const h = openBrain(profile, { profileRoot })
  h.exec(
    `CREATE TABLE IF NOT EXISTS ingest_delivery (
       id TEXT PRIMARY KEY, profile TEXT NOT NULL, dealer TEXT, report_kind TEXT NOT NULL,
       period_start TEXT, period_end TEXT, source_filename TEXT,
       source_filter_metadata TEXT, final_filter_metadata TEXT,
       checksum TEXT NOT NULL, parser_version TEXT,
       source_row_count INTEGER NOT NULL DEFAULT 0, accepted_row_count INTEGER NOT NULL DEFAULT 0,
       header_json TEXT, revision INTEGER NOT NULL DEFAULT 1, validation_evidence TEXT,
       status TEXT NOT NULL, quarantine_reason TEXT,
       superseded_by TEXT, created_at INTEGER NOT NULL
     )`,
  )
  h.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ingest_delivery_checksum ON ingest_delivery(profile, checksum)`)
  h.exec(`CREATE INDEX IF NOT EXISTS ingest_delivery_period ON ingest_delivery(profile, report_kind, period_start, period_end, superseded_by)`)
  h.exec(
    `CREATE TABLE IF NOT EXISTS ingest_row (
       id TEXT PRIMARY KEY, delivery_id TEXT NOT NULL, profile TEXT NOT NULL,
       report_kind TEXT NOT NULL, row_index INTEGER NOT NULL, row_json TEXT NOT NULL,
       created_at INTEGER NOT NULL
     )`,
  )
  h.exec(`CREATE INDEX IF NOT EXISTS ingest_row_delivery ON ingest_row(profile, delivery_id, row_index)`)
  return h
}

const j = (v: unknown) => (v == null ? null : JSON.stringify(v))

export function recordDelivery(
  input: DeliveryInput,
  rows: Array<Array<string>>,
  now: number,
  opts: { profileRoot?: string } = {},
): RecordOutcome {
  const h = ensure(input.profile, opts.profileRoot)

  // 1. duplicate checksum → no-op (no delivery, no analytical rows)
  const dup = h.get<{ id: string; revision: number }>(
    `SELECT id, revision FROM ingest_delivery WHERE profile = ? AND checksum = ?`,
    input.profile, input.checksum,
  )
  if (dup) return { outcome: 'duplicate', id: dup.id, revision: dup.revision, superseded: [], accepted_rows: 0 }

  const id = uuid()

  // 2. quarantined → record the delivery only; ZERO analytical rows.
  if (input.status === 'quarantined') {
    insertDelivery(h, id, input, 1, now)
    return { outcome: 'quarantined', id, revision: 1, superseded: [], accepted_rows: 0 }
  }

  // 3. accepted → supersede prior active + insert delivery + all rows, atomically.
  const priors = h.all<{ id: string; revision: number }>(
    `SELECT id, revision FROM ingest_delivery
      WHERE profile = ? AND report_kind = ? AND status = 'accepted' AND superseded_by IS NULL
        AND IFNULL(period_start,'') = IFNULL(?, '') AND IFNULL(period_end,'') = IFNULL(?, '')`,
    input.profile, input.report_kind, input.period_start, input.period_end,
  )
  const revision = priors.length ? Math.max(...priors.map((p) => p.revision)) + 1 : 1

  try {
    h.exec('BEGIN')
    for (const p of priors) h.run(`UPDATE ingest_delivery SET superseded_by = ? WHERE id = ?`, id, p.id)
    insertDelivery(h, id, input, revision, now)
    rows.forEach((row, idx) => {
      h.run(
        `INSERT INTO ingest_row (id, delivery_id, profile, report_kind, row_index, row_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        uuid(), id, input.profile, input.report_kind, idx, JSON.stringify(row), now,
      )
    })
    h.exec('COMMIT')
  } catch (err) {
    try { h.exec('ROLLBACK') } catch { /* ignore */ }
    throw err
  }
  return {
    outcome: priors.length ? 'superseded' : 'accepted',
    id, revision, superseded: priors.map((p) => p.id), accepted_rows: rows.length,
  }
}

function insertDelivery(h: Handle, id: string, d: DeliveryInput, revision: number, now: number): void {
  h.run(
    `INSERT INTO ingest_delivery
       (id, profile, dealer, report_kind, period_start, period_end, source_filename,
        source_filter_metadata, final_filter_metadata, checksum, parser_version,
        source_row_count, accepted_row_count, header_json, revision, validation_evidence,
        status, quarantine_reason, superseded_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    id, d.profile, d.dealer, d.report_kind, d.period_start, d.period_end, d.source_filename,
    j(d.source_filter_metadata), j(d.final_filter_metadata), d.checksum, d.parser_version,
    d.source_row_count, d.accepted_row_count, j(d.header), revision, j(d.validation_evidence),
    d.status, d.quarantine_reason, now,
  )
}

function parse<T>(v: unknown, fallback: T): T {
  try { return v ? (JSON.parse(v as string) as T) : fallback } catch { return fallback }
}

export function listDeliveries(
  profile: string,
  opts: { limit?: number; profileRoot?: string } = {},
): Array<Record<string, unknown>> {
  const h = ensure(profile, opts.profileRoot)
  return h.all<Record<string, unknown>>(
    `SELECT * FROM ingest_delivery WHERE profile = ? ORDER BY created_at DESC LIMIT ?`,
    profile, opts.limit ?? 200,
  )
}

/** Active (current-revision) accepted rows — never mixes revisions. */
export function listActiveRows(
  profile: string,
  opts: { report_kind?: string; period_start?: string; period_end?: string; profileRoot?: string } = {},
): Array<ActiveRow> {
  const h = ensure(profile, opts.profileRoot)
  const clauses = [`ir.profile = ?`, `d.status = 'accepted'`, `d.superseded_by IS NULL`]
  const params: Array<unknown> = [profile]
  if (opts.report_kind) { clauses.push(`d.report_kind = ?`); params.push(opts.report_kind) }
  if (opts.period_start) { clauses.push(`IFNULL(d.period_start,'') = ?`); params.push(opts.period_start) }
  if (opts.period_end) { clauses.push(`IFNULL(d.period_end,'') = ?`); params.push(opts.period_end) }
  const rows = h.all<{
    delivery_id: string; report_kind: string; period_start: string | null; period_end: string | null
    header_json: string | null; row_index: number; row_json: string
  }>(
    `SELECT ir.delivery_id, d.report_kind, d.period_start, d.period_end, d.header_json, ir.row_index, ir.row_json
       FROM ingest_row ir JOIN ingest_delivery d ON d.id = ir.delivery_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY ir.delivery_id, ir.row_index`,
    ...params,
  )
  return rows.map((r) => ({
    delivery_id: r.delivery_id,
    report_kind: r.report_kind,
    period_start: r.period_start,
    period_end: r.period_end,
    header: parse<Array<string>>(r.header_json, []),
    row_index: r.row_index,
    row: parse<Array<string>>(r.row_json, []),
  }))
}

/** Count of active analytical rows (for readback assertions). */
export function countActiveRows(profile: string, opts: { report_kind?: string; profileRoot?: string } = {}): number {
  return listActiveRows(profile, opts).length
}
