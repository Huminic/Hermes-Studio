/**
 * Nightly lead-status snapshot (P4b — Serra comms recovery).
 *
 * WHY: VinSolutions exposes only a lead's CURRENT status (`leadStatus` /
 * `leadStatusType`) with NO status-transition dates. So "sold today", "lost
 * today", "went cold", and status-aging on non-new statuses are not computable
 * from a single read. This module snapshots every (sales) lead's status once a
 * day into the profile's brain.db, so day-over-day diffs become truthful. It
 * accrues from go-live — no retroactive history.
 *
 * The core is handle-based + pure over injected leads (the caller fetches via
 * `vin_query_leads`), so it unit-tests without MCP.
 */
import { openBrain, type BrainHandle } from './brain-store'

/** Minimal lead shape the snapshot records (from vin_query_leads, sales-only). */
export type SnapshotLead = {
  leadId: string
  leadStatus?: string | null
  leadStatusType?: string | null
  leadType?: string | null
  leadSource?: string | null
  createdUtc?: string | null
}

const SOLD_TYPE = 'SOLD'
const LOST_TYPES = new Set(['LOST', 'BAD'])

export function ensureSnapshotTable(h: BrainHandle): void {
  h.exec(`CREATE TABLE IF NOT EXISTS lead_status_snapshot (
    snapshot_date TEXT NOT NULL,
    lead_id       TEXT NOT NULL,
    status        TEXT,
    status_type   TEXT,
    lead_type     TEXT,
    lead_source   TEXT,
    created_utc   TEXT,
    recorded_at   INTEGER NOT NULL,
    PRIMARY KEY (snapshot_date, lead_id)
  )`)
}

/** Local calendar date (YYYY-MM-DD) for the snapshot key. Central by default. */
export function snapshotDate(now: number, tz = 'America/Chicago'): string {
  // en-CA formats as YYYY-MM-DD; timeZone pins the store's local day boundary.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now))
}

/** Upsert one row per lead for `date` (idempotent — re-running updates in place). */
export function recordSnapshot(
  h: BrainHandle,
  date: string,
  leads: ReadonlyArray<SnapshotLead>,
  now: number,
): number {
  ensureSnapshotTable(h)
  let n = 0
  for (const l of leads) {
    if (!l.leadId) continue
    h.run(
      `INSERT INTO lead_status_snapshot
         (snapshot_date, lead_id, status, status_type, lead_type, lead_source, created_utc, recorded_at)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(snapshot_date, lead_id) DO UPDATE SET
         status=excluded.status, status_type=excluded.status_type,
         lead_type=excluded.lead_type, lead_source=excluded.lead_source,
         created_utc=excluded.created_utc, recorded_at=excluded.recorded_at`,
      date,
      l.leadId,
      l.leadStatus ?? null,
      l.leadStatusType ?? null,
      l.leadType ?? null,
      l.leadSource ?? null,
      l.createdUtc ?? null,
      now,
    )
    n++
  }
  return n
}

export type StatusRow = { status: string | null; statusType: string | null }

/** Map of lead_id → status recorded on `date` (empty if that day wasn't snapshotted). */
export function getStatusesOn(h: BrainHandle, date: string): Map<string, StatusRow> {
  ensureSnapshotTable(h)
  const rows = h.all<{ lead_id: string; status: string | null; status_type: string | null }>(
    `SELECT lead_id, status, status_type FROM lead_status_snapshot WHERE snapshot_date=?`,
    date,
  )
  const m = new Map<string, StatusRow>()
  for (const r of rows) m.set(r.lead_id, { status: r.status, statusType: r.status_type })
  return m
}

export type DayDiff = {
  /** Leads that became SOLD today (were not SOLD yesterday). */
  soldToday: string[]
  /** Leads that became LOST/BAD today (were not yesterday). */
  lostToday: string[]
  /** Leads present today with no snapshot yesterday. */
  newToday: string[]
}

/**
 * Day-over-day transitions between two snapshotted dates. A lead only counts as
 * "sold/lost today" if its status TYPE crossed into SOLD / LOST today — so a
 * lead already SOLD yesterday is not re-counted.
 */
export function diffDay(h: BrainHandle, today: string, yesterday: string): DayDiff {
  const t = getStatusesOn(h, today)
  const y = getStatusesOn(h, yesterday)
  const soldToday: string[] = []
  const lostToday: string[] = []
  const newToday: string[] = []
  for (const [id, cur] of t) {
    const prev = y.get(id)
    if (!prev) newToday.push(id)
    const wasSold = prev?.statusType === SOLD_TYPE
    if (cur.statusType === SOLD_TYPE && !wasSold) soldToday.push(id)
    const wasLost = prev ? LOST_TYPES.has(prev.statusType ?? '') : false
    if (LOST_TYPES.has(cur.statusType ?? '') && !wasLost) lostToday.push(id)
  }
  return { soldToday, lostToday, newToday }
}

/**
 * Leads whose status TYPE is unchanged across ALL the given snapshot dates —
 * i.e. "stuck in the same status" for the span the dates cover. Pass the daily
 * dates spanning the threshold (e.g. 8 consecutive days for the >1-week alert).
 * A lead must be present in every snapshot with the same status_type to count
 * (a gap or a change disqualifies it). Accrues from go-live — needs the history.
 */
export function findStaleStatus(h: BrainHandle, dates: ReadonlyArray<string>): string[] {
  if (dates.length < 2) return []
  const maps = dates.map((d) => getStatusesOn(h, d))
  const newest = maps[maps.length - 1]
  const stale: string[] = []
  for (const [id, cur] of newest) {
    let unchanged = true
    for (const m of maps) {
      const s = m.get(id)
      if (!s || s.statusType !== cur.statusType) {
        unchanged = false
        break
      }
    }
    if (unchanged) stale.push(id)
  }
  return stale
}

/**
 * Production runner: snapshot the given (already sales-filtered) leads for the
 * store's local day. Caller supplies leads from `vin_query_leads`. Opens the
 * profile brain, records, returns the date + count.
 */
export function runLeadStatusSnapshot(input: {
  profile: string
  now: number
  leads: ReadonlyArray<SnapshotLead>
  profileRoot?: string
  tz?: string
}): { date: string; count: number } {
  const h = openBrain(input.profile, { profileRoot: input.profileRoot })
  try {
    const date = snapshotDate(input.now, input.tz)
    const count = recordSnapshot(h, date, input.leads, input.now)
    return { date, count }
  } finally {
    h.close()
  }
}
