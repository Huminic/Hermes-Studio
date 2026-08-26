/**
 * Native-family metrics reader — surfaces ACCEPTED, governed native ingest data
 * (dealership_performance, appointments) and standalone Response-Time readbacks
 * from the isolated analytical store.
 *
 * Hard rules (per source audit):
 *  - Delivery selection: profile match + status='accepted' + superseded_by IS NULL,
 *    newest governed period (period_end DESC, then revision DESC).
 *  - Native rows are JSON arrays.
 *      • appointments   → column names come from ingest_delivery.header_json (32).
 *      • dealership_performance → header_json is empty; the "Dealership Summary"
 *        section/header rows are embedded inside the payload rows.
 *  - Response-times: read readback.json files under <brainRoot>/../response-times;
 *    accept only provenance.profile===profile, provenance.readback_verdict==='accepted',
 *    provenance.coverage.reconciles===true. Units are MINUTES. Standalone labeled
 *    source — NEVER blended with dealership_performance response-time aggregates.
 *  - Missing, not zero: absent/withheld families return { available:false, reason }.
 *  - Provenance is preserved on every available result.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { resolveBrainPaths } from './brain-store'

const _require = createRequire(import.meta.url)

export type Unavailable = { available: false; reason: string }
type Provenance = {
  deliveryId: string
  checksum: string
  parserVersion: string | null
  period: { start: string | null; end: string | null }
  acceptedRows: number
  reportKind: string
}

export type DealershipPerformance = {
  available: true
  source: 'dealership_performance'
  provenance: Provenance
  summary: {
    leads: number | null
    apptsSet: number | null
    apptsShow: number | null
    totalVisits: number | null
    visitsSold: number | null
    soldInPeriod: number | null
    frontGross: number | null
    backGross: number | null
    avgTotalGross: number | null
  }
  byLeadType: Array<{ label: string; leads: number | null; soldInPeriod: number | null }>
}

export type AppointmentsMetrics = {
  available: true
  source: 'appointments'
  provenance: Provenance
  total: number
  completed: number
  confirmed: number
  show: number
  noShow: number
  cancelled: number
  byStatus: Record<string, number>
}

export type ResponseTimeReadback = {
  available: true
  source: 'response_times_readback'
  units: 'minutes'
  period: { start: string | null; end: string | null; timezone?: string }
  coverage: { total_rows?: number; accepted_rows?: number; reconciles: boolean }
  metrics: Record<string, unknown>
  provenance: Record<string, unknown>
}

type SqliteStmt = { get: (...a: unknown[]) => any; all: (...a: unknown[]) => any[] }
type SqliteDb = { prepare: (sql: string) => SqliteStmt; close: () => void }

function openBrainReadonly(profile: string): SqliteDb | null {
  const { dbPath } = resolveBrainPaths(profile)
  if (!fs.existsSync(dbPath)) return null
  try {
    const Database = _require('better-sqlite3')
    return new Database(dbPath, { readonly: true, fileMustExist: true }) as SqliteDb
  } catch {
    return null
  }
}

function num(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

type DeliveryRow = {
  id: string
  checksum: string
  parser_version: string | null
  period_start: string | null
  period_end: string | null
  accepted_row_count: number
  header_json: string | null
}

/** Newest ACCEPTED, non-superseded delivery for a profile + report_kind. */
function selectDelivery(db: SqliteDb, profile: string, reportKind: string): DeliveryRow | null {
  const row = db
    .prepare(
      `SELECT id, checksum, parser_version, period_start, period_end, accepted_row_count, header_json
         FROM ingest_delivery
        WHERE profile = ? AND report_kind = ? AND status = 'accepted' AND superseded_by IS NULL
        ORDER BY period_end DESC, revision DESC
        LIMIT 1`,
    )
    .get(profile, reportKind) as DeliveryRow | undefined
  return row ?? null
}

function deliveryRows(db: SqliteDb, deliveryId: string): string[][] {
  const rows = db
    .prepare(`SELECT row_json FROM ingest_row WHERE delivery_id = ? ORDER BY row_index`)
    .all(deliveryId) as Array<{ row_json: string }>
  return rows.map((r) => {
    try {
      const parsed = JSON.parse(r.row_json)
      return Array.isArray(parsed) ? parsed.map((c) => (c == null ? '' : String(c))) : []
    } catch {
      return []
    }
  })
}

function provenanceOf(d: DeliveryRow, reportKind: string): Provenance {
  return {
    deliveryId: d.id,
    checksum: d.checksum,
    parserVersion: d.parser_version,
    period: { start: d.period_start, end: d.period_end },
    acceptedRows: d.accepted_row_count,
    reportKind,
  }
}

export function readDealershipPerformance(profile: string): DealershipPerformance | Unavailable {
  const db = openBrainReadonly(profile)
  if (!db) return { available: false, reason: 'no brain.db for profile' }
  try {
    const delivery = selectDelivery(db, profile, 'dealership_performance')
    if (!delivery) return { available: false, reason: 'no accepted dealership_performance delivery' }
    const rows = deliveryRows(db, delivery.id)

    // Locate the "Dealership Summary" section: section headers are single-cell rows.
    const secIdx = rows.findIndex((r) => r.length === 1 && r[0] === 'Dealership Summary')
    if (secIdx < 0 || !rows[secIdx + 1]) {
      return { available: false, reason: 'Dealership Summary section not found in payload' }
    }
    const header = rows[secIdx + 1]
    const col = (name: string) => header.indexOf(name)
    const idxLeads = col('Leads')
    const idxApptsSet = col('Appts Set')
    const idxApptsShow = col('Appts Show')
    const idxTotalVisits = col('Total Visits')
    const idxVisitsSold = col('Visits Sold')
    const idxSold = col('Sold in Period')
    const idxFront = col('Front Gross')
    const idxBack = col('Back Gross')
    const idxAvg = col('Avg Total Gross')

    // Data rows until the next single-cell section header (or end).
    const data: string[][] = []
    for (let i = secIdx + 2; i < rows.length; i++) {
      if (rows[i].length <= 1) break
      data.push(rows[i])
    }
    const totalRow = data.find((r) => (r[0] || '').toUpperCase() === 'TOTAL')
    if (!totalRow) return { available: false, reason: 'Dealership Summary TOTAL row not found' }

    const byLeadType = data
      .filter((r) => (r[0] || '').toUpperCase() !== 'TOTAL')
      .map((r) => ({ label: r[0], leads: num(r[idxLeads]), soldInPeriod: num(r[idxSold]) }))

    return {
      available: true,
      source: 'dealership_performance',
      provenance: provenanceOf(delivery, 'dealership_performance'),
      summary: {
        leads: num(totalRow[idxLeads]),
        apptsSet: num(totalRow[idxApptsSet]),
        apptsShow: num(totalRow[idxApptsShow]),
        totalVisits: num(totalRow[idxTotalVisits]),
        visitsSold: num(totalRow[idxVisitsSold]),
        soldInPeriod: num(totalRow[idxSold]),
        frontGross: num(totalRow[idxFront]),
        backGross: num(totalRow[idxBack]),
        avgTotalGross: num(totalRow[idxAvg]),
      },
      byLeadType,
    }
  } finally {
    db.close()
  }
}

export function readAppointments(profile: string): AppointmentsMetrics | Unavailable {
  const db = openBrainReadonly(profile)
  if (!db) return { available: false, reason: 'no brain.db for profile' }
  try {
    const delivery = selectDelivery(db, profile, 'appointments')
    if (!delivery) return { available: false, reason: 'no accepted appointments delivery' }
    let headers: string[] = []
    try {
      headers = JSON.parse(delivery.header_json || '[]')
    } catch {
      headers = []
    }
    if (!headers.length) return { available: false, reason: 'appointments header_json missing' }
    const h = (name: string) => headers.indexOf(name)
    const iStatus = h('Appointment Status')
    const iShow = h('Is Show')
    const iNoShow = h('Is No Show')
    const iCancelled = h('Is Cancelled')
    const iCompleted = h('Is Completed')
    const iConfirmed = h('Is Confirmed')

    const rows = deliveryRows(db, delivery.id)
    const yes = (v: string | undefined) => (v || '').trim().toLowerCase() === 'yes'
    const byStatus: Record<string, number> = {}
    let show = 0,
      noShow = 0,
      cancelled = 0,
      completed = 0,
      confirmed = 0
    for (const r of rows) {
      const status = iStatus >= 0 ? r[iStatus] || 'Unknown' : 'Unknown'
      byStatus[status] = (byStatus[status] || 0) + 1
      if (iShow >= 0 && yes(r[iShow])) show++
      if (iNoShow >= 0 && yes(r[iNoShow])) noShow++
      if (iCancelled >= 0 && yes(r[iCancelled])) cancelled++
      if (iCompleted >= 0 && yes(r[iCompleted])) completed++
      if (iConfirmed >= 0 && yes(r[iConfirmed])) confirmed++
    }

    return {
      available: true,
      source: 'appointments',
      provenance: provenanceOf(delivery, 'appointments'),
      total: rows.length,
      completed,
      confirmed,
      show,
      noShow,
      cancelled,
      byStatus,
    }
  } finally {
    db.close()
  }
}

/**
 * Standalone Response-Time readback metrics (units: minutes). Validated + labeled
 * as its own source. NEVER blended with dealership_performance aggregates.
 */
export function readResponseTimes(profile: string): ResponseTimeReadback | Unavailable {
  const { brainRoot } = resolveBrainPaths(profile)
  const rtDir = path.join(path.dirname(brainRoot), 'response-times')
  if (!fs.existsSync(rtDir)) return { available: false, reason: 'no response-times dir' }

  let best: ResponseTimeReadback | null = null
  for (const entry of fs.readdirSync(rtDir)) {
    const file = path.join(rtDir, entry, 'readback.json')
    if (!fs.existsSync(file)) continue
    let doc: any
    try {
      doc = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      continue
    }
    const prov = doc?.provenance ?? {}
    const cov = prov?.coverage ?? {}
    // Fail-closed acceptance gate.
    if (prov.profile !== profile) continue
    if (prov.readback_verdict !== 'accepted') continue
    if (cov.reconciles !== true) continue
    const candidate: ResponseTimeReadback = {
      available: true,
      source: 'response_times_readback',
      units: 'minutes',
      period: { start: cov.start ?? null, end: cov.end ?? null, timezone: cov.timezone },
      coverage: {
        total_rows: cov.total_rows,
        accepted_rows: cov.accepted_rows,
        reconciles: cov.reconciles === true,
      },
      metrics: doc.metrics ?? {},
      provenance: prov,
    }
    // Newest governed period wins.
    if (!best || String(candidate.period.end) > String(best.period.end)) best = candidate
  }
  return best ?? { available: false, reason: 'no accepted, reconciling response-time readback' }
}
