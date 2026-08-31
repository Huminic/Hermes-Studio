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
    totalGross: number | null
    avgTotalGross: number | null
    // Embedded "Response Time" section (label-bound; minutes). Same accepted delivery /
    // provenance / period as the rest of the Dashboard — NOT the standalone readback.
    responseTimeAdjustedAvgMin: number | null
    responseTimeActualAvgMin: number | null
  }
  // New / Used / Unknown are INVENTORY types (from the "Lead Type & Inventory
  // Type Summary" section), not lead sources — do not conflate the two.
  byInventoryType: Array<{ label: string; leads: number | null; soldInPeriod: number | null }>
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
  rescheduled: number
  byStatus: Record<string, number>
}

export type CrmSalesGross = {
  available: true
  source: 'crm_sales_gross'
  provenance: Provenance
  rowCount: number
  frontSum: number | null
  backSum: number | null
  totalSum: number | null
  reconciliationMismatches: number | null
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
  try {
    const { dbPath } = resolveBrainPaths(profile)
    if (!fs.existsSync(dbPath)) return null
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

    // Integrity: parsed native rows must match the governed accepted count.
    if (rows.length !== delivery.accepted_row_count) {
      return {
        available: false,
        reason: `row count mismatch: parsed ${rows.length} != accepted_row_count ${delivery.accepted_row_count}`,
      }
    }

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

    // Fail closed if any required summary column is absent.
    const requiredCols: Record<string, number> = {
      Leads: idxLeads,
      'Appts Set': idxApptsSet,
      'Appts Show': idxApptsShow,
      'Total Visits': idxTotalVisits,
      'Visits Sold': idxVisitsSold,
      'Sold in Period': idxSold,
      'Front Gross': idxFront,
      'Back Gross': idxBack,
      'Avg Total Gross': idxAvg,
    }
    const missingCols = Object.entries(requiredCols)
      .filter(([, i]) => i < 0)
      .map(([name]) => name)
    if (missingCols.length) {
      return {
        available: false,
        reason: `Dealership Summary missing required columns: ${missingCols.join(', ')}`,
      }
    }

    // Data rows until the next single-cell section header (or end).
    const data: string[][] = []
    for (let i = secIdx + 2; i < rows.length; i++) {
      if (rows[i].length <= 1) break
      data.push(rows[i])
    }
    const totalRow = data.find((r) => (r[0] || '').toUpperCase() === 'TOTAL')
    if (!totalRow) return { available: false, reason: 'Dealership Summary TOTAL row not found' }

    // New / Used / Unknown are inventory types, not lead sources.
    const byInventoryType = data
      .filter((r) => (r[0] || '').toUpperCase() !== 'TOTAL')
      .map((r) => ({ label: r[0], leads: num(r[idxLeads]), soldInPeriod: num(r[idxSold]) }))

    // Total Gross = Front + Back, but ONLY when both are numeric (else null —
    // never a partial/fabricated total). Not read from the source; derived.
    const frontGross = num(totalRow[idxFront])
    const backGross = num(totalRow[idxBack])
    const totalGross =
      frontGross !== null && backGross !== null ? frontGross + backGross : null

    // Embedded "Response Time" section: a single-cell header row `["Response Time"]`
    // followed by a row whose cells are label-bound, e.g. "88Avg Adjusted (Min)" and
    // "210Avg Actual (Min)". Parse the LEADING integer bound to each label. Absent →
    // null (missing is not zero). Same delivery/provenance/period as the Dashboard.
    const rtLeading = (label: RegExp): number | null => {
      const rtIdx = rows.findIndex((r) => r.length === 1 && (r[0] || '').trim() === 'Response Time')
      if (rtIdx < 0) return null
      for (let i = rtIdx + 1; i < rows.length && i <= rtIdx + 3; i++) {
        for (const cell of rows[i]) {
          const m = (cell || '').match(label)
          if (m) {
            const n = Number(m[1])
            return Number.isFinite(n) ? n : null
          }
        }
      }
      return null
    }
    const responseTimeAdjustedAvgMin = rtLeading(/^(\d+(?:\.\d+)?)\s*Avg Adjusted \(Min\)/i)
    const responseTimeActualAvgMin = rtLeading(/^(\d+(?:\.\d+)?)\s*Avg Actual \(Min\)/i)

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
        frontGross,
        backGross,
        totalGross,
        avgTotalGross: num(totalRow[idxAvg]),
        responseTimeAdjustedAvgMin,
        responseTimeActualAvgMin,
      },
      byInventoryType,
    }
  } catch (e) {
    return { available: false, reason: `dealership_performance query failed: ${(e as Error).message}` }
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
    const iRescheduled = h('Rescheduled Date')

    // Fail closed if any required appointment header is absent.
    const requiredHeaders: Record<string, number> = {
      'Appointment Status': iStatus,
      'Is Show': iShow,
      'Is No Show': iNoShow,
      'Is Cancelled': iCancelled,
      'Is Completed': iCompleted,
      'Is Confirmed': iConfirmed,
      'Rescheduled Date': iRescheduled,
    }
    const missingHeaders = Object.entries(requiredHeaders)
      .filter(([, i]) => i < 0)
      .map(([name]) => name)
    if (missingHeaders.length) {
      return { available: false, reason: `appointments missing required headers: ${missingHeaders.join(', ')}` }
    }

    const rows = deliveryRows(db, delivery.id)

    // Integrity: parsed native rows must match the governed accepted count.
    if (rows.length !== delivery.accepted_row_count) {
      return {
        available: false,
        reason: `row count mismatch: parsed ${rows.length} != accepted_row_count ${delivery.accepted_row_count}`,
      }
    }

    const yes = (v: string | undefined) => (v || '').trim().toLowerCase() === 'yes'
    const byStatus: Record<string, number> = {}
    let show = 0,
      noShow = 0,
      cancelled = 0,
      completed = 0,
      confirmed = 0,
      rescheduled = 0
    for (const r of rows) {
      const status = iStatus >= 0 ? r[iStatus] || 'Unknown' : 'Unknown'
      byStatus[status] = (byStatus[status] || 0) + 1
      if (iShow >= 0 && yes(r[iShow])) show++
      if (iNoShow >= 0 && yes(r[iNoShow])) noShow++
      if (iCancelled >= 0 && yes(r[iCancelled])) cancelled++
      if (iCompleted >= 0 && yes(r[iCompleted])) completed++
      if (iConfirmed >= 0 && yes(r[iConfirmed])) confirmed++
      // Rescheduled Date is a date string when the appointment was moved.
      if (iRescheduled >= 0 && (r[iRescheduled] || '').trim() !== '') rescheduled++
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
      rescheduled,
      byStatus,
    }
  } catch (e) {
    return { available: false, reason: `appointments query failed: ${(e as Error).message}` }
  } finally {
    db.close()
  }
}

/**
 * CRM Sales Gross — per-deal reader. AUTHORITATIVE source of `gross.total_sum` and the
 * ONLY source of `gross.reconciliation_mismatches` (within-row Front+Back vs Total).
 * Dealer / governed Dealer ID / coverage period / schema are already enforced fail-closed
 * at land + promotion time; this reader adds row-count integrity and missing-not-zero:
 * any absent required column or unparseable gross value WITHHOLDS the whole metric (never 0).
 */
export function readCrmSalesGross(profile: string): CrmSalesGross | Unavailable {
  const db = openBrainReadonly(profile)
  if (!db) return { available: false, reason: 'no brain.db for profile' }
  try {
    const delivery = selectDelivery(db, profile, 'crm_sales_gross')
    if (!delivery) return { available: false, reason: 'no accepted crm_sales_gross delivery' }
    let headers: string[] = []
    try {
      headers = JSON.parse(delivery.header_json || '[]')
    } catch {
      headers = []
    }
    if (!headers.length) return { available: false, reason: 'crm_sales_gross header_json missing' }
    const h = (name: string) => headers.indexOf(name)
    const iFront = h('Front Gross')
    const iBack = h('Back Gross')
    const iTotal = h('Total Gross')
    const missing = Object.entries({ 'Front Gross': iFront, 'Back Gross': iBack, 'Total Gross': iTotal })
      .filter(([, i]) => i < 0)
      .map(([name]) => name)
    if (missing.length) {
      return { available: false, reason: `crm_sales_gross missing required columns: ${missing.join(', ')}` }
    }

    const rows = deliveryRows(db, delivery.id)
    if (rows.length !== delivery.accepted_row_count) {
      return {
        available: false,
        reason: `row count mismatch: parsed ${rows.length} != accepted_row_count ${delivery.accepted_row_count}`,
      }
    }

    // Parse a gross cell the way the governed gross contract does (parity with the
    // reference grossMetrics): a BLANK cell is an explicit zero (a deal with no gross),
    // NOT missing; currency/percent/thousands formatting is stripped; only genuine
    // non-numeric junk withholds the whole metric (never a fabricated zero).
    const grossNum = (v: string | undefined): number | null => {
      const s = (v ?? '').trim()
      if (s === '') return 0
      const n = Number(s.replace(/[$,%\s]/g, ''))
      return Number.isFinite(n) ? n : null
    }
    let frontSum = 0
    let backSum = 0
    let totalSum = 0
    let reconciliationMismatches = 0
    for (const r of rows) {
      const f = grossNum(r[iFront])
      const b = grossNum(r[iBack])
      const t = grossNum(r[iTotal])
      if (f === null || b === null || t === null) {
        return {
          available: false,
          reason: 'crm_sales_gross: non-numeric Front/Back/Total gross value (withheld, never zero)',
        }
      }
      frontSum += f
      backSum += b
      totalSum += t
      // Within-row reconciliation, dollar tolerance (parity with reference grossMetrics).
      if (Math.abs(f + b - t) > 0.5) reconciliationMismatches++
    }

    const round2 = (n: number) => Math.round(n * 100) / 100
    return {
      available: true,
      source: 'crm_sales_gross',
      provenance: provenanceOf(delivery, 'crm_sales_gross'),
      rowCount: rows.length,
      frontSum: round2(frontSum),
      backSum: round2(backSum),
      totalSum: round2(totalSum),
      reconciliationMismatches,
    }
  } catch (e) {
    return { available: false, reason: `crm_sales_gross query failed: ${(e as Error).message}` }
  } finally {
    db.close()
  }
}

/**
 * Standalone Response-Time readback metrics (units: minutes). Validated + labeled
 * as its own source. NEVER blended with dealership_performance aggregates.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function readResponseTimes(profile: string): ResponseTimeReadback | Unavailable {
  let brainRoot: string
  try {
    brainRoot = resolveBrainPaths(profile).brainRoot
  } catch (e) {
    return { available: false, reason: `path resolution failed: ${(e as Error).message}` }
  }
  const rtDir = path.join(path.dirname(brainRoot), 'response-times')
  if (!fs.existsSync(rtDir)) return { available: false, reason: 'no response-times dir' }

  let best: ResponseTimeReadback | null = null
  let entries: string[] = []
  try {
    entries = fs.readdirSync(rtDir)
  } catch (e) {
    return { available: false, reason: `response-times unreadable: ${(e as Error).message}` }
  }
  for (const entry of entries) {
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
    const units = prov?.metric_units ?? {}
    // Fail-closed acceptance gate.
    if (prov.profile !== profile) continue
    if (prov.readback_verdict !== 'accepted') continue
    if (cov.reconciles !== true) continue
    // Coverage window must be valid ISO dates before it can be compared/selected.
    if (!ISO_DATE.test(String(cov.start)) || !ISO_DATE.test(String(cov.end))) continue
    // Response-time metric must be expressed in minutes.
    if (!String(units.response_time ?? '').startsWith('minutes')) continue
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
