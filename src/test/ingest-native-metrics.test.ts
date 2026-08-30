import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import {
  readAppointments,
  readCrmSalesGross,
  readDealershipPerformance,
  readResponseTimes,
} from '../server/ingest-native-metrics'

const _require = createRequire(import.meta.url)
const Database = _require('better-sqlite3')

/* ─────────────────────────────────────────────────────────────────────────
 * Part 1 — Deterministic temp-fixture suite. Runs anywhere (no /srv data).
 * Builds throwaway brain.db files + response-time readbacks under a temp
 * BRAIN_PROFILES_ROOT and exercises selection + fail-closed rejection rules.
 * ──────────────────────────────────────────────────────────────────────── */
describe('ingest-native-metrics (deterministic fixtures)', () => {
  let ROOT = ''
  const savedRoot = process.env.BRAIN_PROFILES_ROOT

  const DP_HEADER = [
    '',
    'Leads',
    'Appts Set',
    'Appts Show',
    'Total Visits',
    'Visits Sold',
    'Sold in Period',
    'Front Gross',
    'Back Gross',
    'Avg Total Gross',
  ]
  const dpRows = (totalLeads: number) => [
    ['Dealership Summary'],
    DP_HEADER,
    ['New', String(totalLeads - 10), '1', '1', '2', '1', '1', '100', '200', '150'],
    ['TOTAL', String(totalLeads), '2', '2', '4', '2', '2', '110', '210', '160'],
  ]

  const APPT_HEADER = [
    'Appointment ID',
    'Appointment Status',
    'Is Completed',
    'Is Confirmed',
    'Is Show',
    'Is No Show',
    'Is Cancelled',
    'Rescheduled Date',
  ]
  const APPT_ROWS = [
    ['a1', 'Show', 'Yes', 'Yes', 'Yes', 'No', 'No', ''],
    ['a2', 'No Show', 'No', 'No', 'No', 'Yes', 'No', '2026-08-20'],
    ['a3', 'Cancelled', 'No', 'No', 'No', 'No', 'Yes', ''],
  ]

  function brainFor(profile: string): any {
    const dbPath = path.join(ROOT, profile, 'brain', 'brain.db')
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    const db = new Database(dbPath)
    db.exec(
      `CREATE TABLE ingest_delivery (id TEXT, profile TEXT, report_kind TEXT, period_start TEXT,
         period_end TEXT, checksum TEXT, parser_version TEXT, accepted_row_count INTEGER,
         header_json TEXT, revision INTEGER, status TEXT, superseded_by TEXT);
       CREATE TABLE ingest_row (id TEXT, delivery_id TEXT, profile TEXT, report_kind TEXT,
         row_index INTEGER, row_json TEXT);`,
    )
    return db
  }

  function addDelivery(
    db: any,
    opts: {
      id: string
      profile: string
      reportKind: string
      periodEnd: string
      revision?: number
      status?: string
      supersededBy?: string | null
      acceptedRowCount?: number
      headerJson?: string
      rows: unknown[][]
    },
  ) {
    db.prepare(
      `INSERT INTO ingest_delivery
         (id, profile, report_kind, period_start, period_end, checksum, parser_version,
          accepted_row_count, header_json, revision, status, superseded_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      opts.id,
      opts.profile,
      opts.reportKind,
      '2026-01-01',
      opts.periodEnd,
      'chk-' + opts.id,
      'v1',
      opts.acceptedRowCount ?? opts.rows.length,
      opts.headerJson ?? '[]',
      opts.revision ?? 1,
      opts.status ?? 'accepted',
      opts.supersededBy ?? null,
    )
    const stmt = db.prepare(
      `INSERT INTO ingest_row (id, delivery_id, profile, report_kind, row_index, row_json)
       VALUES (?,?,?,?,?,?)`,
    )
    opts.rows.forEach((arr, i) =>
      stmt.run(`${opts.id}-r${i}`, opts.id, opts.profile, opts.reportKind, i, JSON.stringify(arr)),
    )
  }

  function writeReadback(profile: string, entry: string, prov: unknown, metrics: unknown = {}) {
    const dir = path.join(ROOT, profile, 'response-times', entry)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'readback.json'), JSON.stringify({ provenance: prov, metrics }))
  }

  beforeAll(() => {
    ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'native-fix-'))
    process.env.BRAIN_PROFILES_ROOT = ROOT

    // — Selection: newest ACCEPTED, non-superseded delivery wins —
    {
      const db = brainFor('fixt-select')
      addDelivery(db, { id: 'old', profile: 'fixt-select', reportKind: 'dealership_performance', periodEnd: '2026-08-10', rows: dpRows(10) })
      addDelivery(db, { id: 'win', profile: 'fixt-select', reportKind: 'dealership_performance', periodEnd: '2026-08-23', rows: dpRows(99) })
      // newer period but superseded — must be excluded
      addDelivery(db, { id: 'sup', profile: 'fixt-select', reportKind: 'dealership_performance', periodEnd: '2026-08-30', supersededBy: 'x', rows: dpRows(555) })
      // newer period but not accepted — must be excluded
      addDelivery(db, { id: 'quar', profile: 'fixt-select', reportKind: 'dealership_performance', periodEnd: '2026-09-06', status: 'quarantined', rows: dpRows(777) })
      db.close()
    }

    // — Malformed dealership_performance variants —
    {
      const db = brainFor('fixt-mismatch')
      addDelivery(db, { id: 'm', profile: 'fixt-mismatch', reportKind: 'dealership_performance', periodEnd: '2026-08-23', acceptedRowCount: 99, rows: dpRows(50) })
      db.close()
    }
    {
      const db = brainFor('fixt-missingcol')
      const noFront = ['', 'Leads', 'Appts Set', 'Appts Show', 'Total Visits', 'Visits Sold', 'Sold in Period', 'Back Gross', 'Avg Total Gross']
      addDelivery(db, { id: 'mc', profile: 'fixt-missingcol', reportKind: 'dealership_performance', periodEnd: '2026-08-23', rows: [['Dealership Summary'], noFront, ['TOTAL', '1', '1', '1', '1', '1', '1', '1', '1']] })
      db.close()
    }
    {
      const db = brainFor('fixt-nosection')
      addDelivery(db, { id: 'ns', profile: 'fixt-nosection', reportKind: 'dealership_performance', periodEnd: '2026-08-23', rows: [['x', 'y'], ['a', 'b']] })
      db.close()
    }
    {
      // TOTAL row with Front Gross numeric but Back Gross blank → totalGross null
      const db = brainFor('fixt-partialgross')
      const rows = [['Dealership Summary'], DP_HEADER, ['TOTAL', '5', '1', '1', '2', '1', '1', '100', '', '150']]
      addDelivery(db, { id: 'pg', profile: 'fixt-partialgross', reportKind: 'dealership_performance', periodEnd: '2026-08-23', rows })
      db.close()
    }

    // — Appointments variants —
    {
      const db = brainFor('fixt-appt')
      addDelivery(db, { id: 'ap', profile: 'fixt-appt', reportKind: 'appointments', periodEnd: '2026-08-23', headerJson: JSON.stringify(APPT_HEADER), rows: APPT_ROWS })
      db.close()
    }
    {
      const db = brainFor('fixt-appt-missinghdr')
      const noShowHdr = APPT_HEADER.filter((h) => h !== 'Is Show')
      addDelivery(db, { id: 'apm', profile: 'fixt-appt-missinghdr', reportKind: 'appointments', periodEnd: '2026-08-23', headerJson: JSON.stringify(noShowHdr), rows: APPT_ROWS.map((r) => r.filter((_, i) => i !== 4)) })
      db.close()
    }
    {
      const db = brainFor('fixt-appt-mismatch')
      addDelivery(db, { id: 'apx', profile: 'fixt-appt-mismatch', reportKind: 'appointments', periodEnd: '2026-08-23', acceptedRowCount: 99, headerJson: JSON.stringify(APPT_HEADER), rows: APPT_ROWS })
      db.close()
    }

    // — brain.db with no ingest tables → query failure must be swallowed —
    {
      const dbPath = path.join(ROOT, 'fixt-notable', 'brain', 'brain.db')
      fs.mkdirSync(path.dirname(dbPath), { recursive: true })
      const db = new Database(dbPath)
      db.exec('CREATE TABLE unrelated (x TEXT)')
      db.close()
    }

    // — Response-time readbacks: gating + newest-period selection —
    const okProv = (profile: string, end: string) => ({
      profile,
      readback_verdict: 'accepted',
      metric_units: { response_time: 'minutes (excel-day * 1440)' },
      coverage: { start: '2026-08-17', end, reconciles: true, timezone: 'America/New_York' },
    })
    writeReadback('fixt-rt', '2026-08-17_2026-08-23', okProv('fixt-rt', '2026-08-23'), { leads_total: 10 })
    writeReadback('fixt-rt', '2026-08-24_2026-08-30', okProv('fixt-rt', '2026-08-30'), { leads_total: 12 }) // newest → wins
    writeReadback('fixt-rt', 'wrong-profile', okProv('someone-else', '2026-09-06'))
    writeReadback('fixt-rt', 'rejected', { ...okProv('fixt-rt', '2026-09-13'), readback_verdict: 'rejected' })
    writeReadback('fixt-rt', 'noreconcile', { ...okProv('fixt-rt', '2026-09-20'), coverage: { start: '2026-08-17', end: '2026-09-20', reconciles: false } })
    writeReadback('fixt-rt', 'baddate', { ...okProv('fixt-rt', '2026-09-27'), coverage: { start: '08/17/2026', end: '09/27/2026', reconciles: true } })
    writeReadback('fixt-rt', 'notminutes', { ...okProv('fixt-rt', '2026-10-04'), metric_units: { response_time: 'seconds' } })

    // profile whose only readbacks fail the gate → withheld
    writeReadback('fixt-rt-none', 'rejected', { ...okProv('fixt-rt-none', '2026-08-23'), readback_verdict: 'rejected' })
  })

  afterAll(() => {
    if (savedRoot === undefined) delete process.env.BRAIN_PROFILES_ROOT
    else process.env.BRAIN_PROFILES_ROOT = savedRoot
    if (ROOT) fs.rmSync(ROOT, { recursive: true, force: true })
  })

  it('selects the newest accepted, non-superseded delivery', () => {
    const r = readDealershipPerformance('fixt-select')
    expect(r.available).toBe(true)
    if (!r.available) return
    expect(r.summary.leads).toBe(99) // not 10 (older), 555 (superseded) or 777 (quarantined)
    expect(r.summary.totalGross).toBe(320) // Front 110 + Back 210
    expect(r.provenance.period.end).toBe('2026-08-23')
    expect(r.byInventoryType.length).toBe(1) // New only (TOTAL excluded)
  })

  it('derives Total Gross only when both front and back gross are numeric', () => {
    const partial = readDealershipPerformance('fixt-partialgross')
    expect(partial.available).toBe(true)
    if (!partial.available) return
    expect(partial.summary.frontGross).toBe(100)
    expect(partial.summary.backGross).toBeNull()
    expect(partial.summary.totalGross).toBeNull() // not a partial total
  })

  it('rejects a delivery whose row count differs from accepted_row_count', () => {
    const r = readDealershipPerformance('fixt-mismatch')
    expect(r.available).toBe(false)
    if (!r.available) expect(r.reason).toMatch(/row count mismatch/i)
  })

  it('rejects a summary missing a required column', () => {
    const r = readDealershipPerformance('fixt-missingcol')
    expect(r.available).toBe(false)
    if (!r.available) expect(r.reason).toMatch(/missing required columns.*Front Gross/i)
  })

  it('rejects a payload with no Dealership Summary section', () => {
    const r = readDealershipPerformance('fixt-nosection')
    expect(r.available).toBe(false)
    if (!r.available) expect(r.reason).toMatch(/section not found/i)
  })

  it('parses appointments and counts rescheduled from Rescheduled Date', () => {
    const r = readAppointments('fixt-appt')
    expect(r.available).toBe(true)
    if (!r.available) return
    expect(r.total).toBe(3)
    expect(r.show).toBe(1)
    expect(r.noShow).toBe(1)
    expect(r.cancelled).toBe(1)
    expect(r.rescheduled).toBe(1)
    expect(Object.values(r.byStatus).reduce((a, b) => a + b, 0)).toBe(3)
  })

  it('rejects appointments missing a required header', () => {
    const r = readAppointments('fixt-appt-missinghdr')
    expect(r.available).toBe(false)
    if (!r.available) expect(r.reason).toMatch(/missing required headers.*Is Show/i)
  })

  it('rejects appointments with a row-count mismatch', () => {
    const r = readAppointments('fixt-appt-mismatch')
    expect(r.available).toBe(false)
    if (!r.available) expect(r.reason).toMatch(/row count mismatch/i)
  })

  it('returns available:false (not throw) when ingest tables are absent', () => {
    const r = readDealershipPerformance('fixt-notable')
    expect(r.available).toBe(false)
    const a = readAppointments('fixt-notable')
    expect(a.available).toBe(false)
  })

  it('returns available:false when brain.db does not exist', () => {
    const r = readDealershipPerformance('fixt-does-not-exist')
    expect(r.available).toBe(false)
  })

  it('accepts only reconciling, minutes, valid-date readbacks and picks newest', () => {
    const r = readResponseTimes('fixt-rt')
    expect(r.available).toBe(true)
    if (!r.available) return
    expect(r.units).toBe('minutes')
    expect(r.period.end).toBe('2026-08-30') // newest valid; gated ones excluded
    expect(r.coverage.reconciles).toBe(true)
  })

  it('withholds response-times when no readback passes the gate', () => {
    const r = readResponseTimes('fixt-rt-none')
    expect(r.available).toBe(false)
  })

  // ── CRM Sales Gross reader — deterministic fixtures (negatives + blank=0) ──
  const GROSS_HEADER = JSON.stringify(['Dealer', 'Dealer ID', 'Front Gross', 'Back Gross', 'Total Gross'])
  const grossRow = (f: string, b: string, t: string) => ['Serra Honda of Sylacauga', '21043', f, b, t]

  it('CRM gross: sums Total, blank Front/Back = 0 (not missing), reconciles clean', () => {
    const db = brainFor('fixt-gross-ok')
    addDelivery(db, {
      id: 'g-ok', profile: 'fixt-gross-ok', reportKind: 'crm_sales_gross', periodEnd: '2026-08-30',
      headerJson: GROSS_HEADER,
      rows: [grossRow('100.5', '50.25', '150.75'), grossRow('', '', '0'), grossRow('1,000', '0', '1000')],
    })
    db.close()
    const g = readCrmSalesGross('fixt-gross-ok')
    expect(g.available).toBe(true)
    if (!g.available) return
    expect(g.rowCount).toBe(3)
    expect(g.totalSum).toBeCloseTo(1150.75, 2) // 150.75 + 0 + 1000 (comma stripped)
    expect(g.reconciliationMismatches).toBe(0)
  })

  it('CRM gross: within-row Front+Back != Total counts as a reconciliation mismatch', () => {
    const db = brainFor('fixt-gross-mism')
    addDelivery(db, {
      id: 'g-mism', profile: 'fixt-gross-mism', reportKind: 'crm_sales_gross', periodEnd: '2026-08-30',
      headerJson: GROSS_HEADER, rows: [grossRow('100', '50', '999')],
    })
    db.close()
    const g = readCrmSalesGross('fixt-gross-mism')
    expect(g.available).toBe(true)
    if (!g.available) return
    expect(g.reconciliationMismatches).toBe(1)
  })

  it('CRM gross: NON-numeric gross value withholds the whole metric (never zero)', () => {
    const db = brainFor('fixt-gross-junk')
    addDelivery(db, {
      id: 'g-junk', profile: 'fixt-gross-junk', reportKind: 'crm_sales_gross', periodEnd: '2026-08-30',
      headerJson: GROSS_HEADER, rows: [grossRow('100', 'N/A', '150')],
    })
    db.close()
    const g = readCrmSalesGross('fixt-gross-junk')
    expect(g.available).toBe(false)
  })

  it('CRM gross: missing Total Gross column -> withheld (schema negative)', () => {
    const db = brainFor('fixt-gross-schema')
    addDelivery(db, {
      id: 'g-schema', profile: 'fixt-gross-schema', reportKind: 'crm_sales_gross', periodEnd: '2026-08-30',
      headerJson: JSON.stringify(['Dealer', 'Dealer ID', 'Front Gross', 'Back Gross']),
      rows: [['Serra Honda of Sylacauga', '21043', '1', '2']],
    })
    db.close()
    const g = readCrmSalesGross('fixt-gross-schema')
    expect(g.available).toBe(false)
  })

  it('CRM gross: parsed row count != accepted_row_count -> withheld (integrity)', () => {
    const db = brainFor('fixt-gross-count')
    addDelivery(db, {
      id: 'g-count', profile: 'fixt-gross-count', reportKind: 'crm_sales_gross', periodEnd: '2026-08-30',
      headerJson: GROSS_HEADER, acceptedRowCount: 99, rows: [grossRow('1', '2', '3')],
    })
    db.close()
    const g = readCrmSalesGross('fixt-gross-count')
    expect(g.available).toBe(false)
  })

  it('CRM gross: no accepted delivery -> withheld, never zero', () => {
    brainFor('fixt-gross-absent').close()
    const g = readCrmSalesGross('fixt-gross-absent')
    expect(g.available).toBe(false)
  })
})

/* ─────────────────────────────────────────────────────────────────────────
 * Part 2 — Real isolated integration checks. Runs only on the harness that
 * has the promoted analytical store at /srv/ingest-dev/analytics.
 * ──────────────────────────────────────────────────────────────────────── */
const REAL_ROOT = '/srv/ingest-dev/analytics'
const HAVE_DATA = fs.existsSync(`${REAL_ROOT}/serra-honda/brain/brain.db`)

describe.runIf(HAVE_DATA)('ingest-native-metrics (isolated store)', () => {
  const saved = process.env.BRAIN_PROFILES_ROOT
  beforeAll(() => {
    process.env.BRAIN_PROFILES_ROOT = REAL_ROOT
  })
  afterAll(() => {
    if (saved === undefined) delete process.env.BRAIN_PROFILES_ROOT
    else process.env.BRAIN_PROFILES_ROOT = saved
  })

  it('Honda dealership_performance: accepted TOTAL row parsed from embedded summary (fresh 2026-08-24/30)', () => {
    const r = readDealershipPerformance('serra-honda')
    expect(r.available).toBe(true)
    if (!r.available) return
    // newest-wins selection returns the fresh 2026-08-24..30 delivery (40 rows).
    expect(r.summary.leads).toBe(86)
    expect(r.summary.apptsSet).toBe(10)
    expect(r.summary.apptsShow).toBe(8)
    expect(r.summary.totalVisits).toBe(26)
    expect(r.summary.visitsSold).toBe(4)
    expect(r.summary.soldInPeriod).toBe(5)
    expect(r.summary.frontGross).toBeCloseTo(11534.31, 2)
    expect(r.summary.backGross).toBeCloseTo(2650.89, 2)
    expect(r.summary.totalGross).toBeCloseTo(14185.2, 2) // 11534.31 + 2650.89
    expect(r.summary.avgTotalGross).toBeCloseTo(2837.04, 2)
    expect(r.provenance.reportKind).toBe('dealership_performance')
    expect(r.provenance.period.start).toBe('2026-08-24')
    expect(r.provenance.period.end).toBe('2026-08-30')
    expect(r.provenance.checksum).toBeTruthy()
    // New / Used / Unknown inventory types (not lead sources)
    expect(r.byInventoryType.length).toBeGreaterThanOrEqual(3)
    expect(r.byInventoryType.map((b) => b.label)).toEqual(
      expect.arrayContaining(['New', 'Used', 'Unknown']),
    )
  })

  it('Honda appointments: header_json-driven, 14 accepted rows (fresh), one shared denominator', () => {
    const r = readAppointments('serra-honda')
    expect(r.available).toBe(true)
    if (!r.available) return
    expect(r.total).toBe(14)
    expect(r.provenance.period.end).toBe('2026-08-30')
    expect(r.provenance.reportKind).toBe('appointments')
    expect(typeof r.rescheduled).toBe('number')
    // Every appt.* rate shares this single denominator (r.total).
    const sum = Object.values(r.byStatus).reduce((a, b) => a + b, 0)
    expect(sum).toBe(14)
    expect(r.show + r.noShow).toBeLessThanOrEqual(r.total)
  })

  it('Honda response-times: standalone accepted+reconciling readback, minutes', () => {
    const r = readResponseTimes('serra-honda')
    expect(r.available).toBe(true)
    if (!r.available) return
    expect(r.units).toBe('minutes')
    expect(r.coverage.reconciles).toBe(true)
    expect(r.period.start).toBe('2026-08-17')
    expect(r.period.end).toBe('2026-08-23')
    expect(r.metrics).toHaveProperty('leads_total')
    expect(r.provenance).toHaveProperty('profile', 'serra-honda')
  })

  it('Nissan dealership_performance: accepted and available (fresh 2026-08-24/30)', () => {
    const r = readDealershipPerformance('serra-nissan')
    expect(r.available).toBe(true)
    if (!r.available) return
    expect(typeof r.summary.leads === 'number' || r.summary.leads === null).toBe(true)
    expect(r.summary.totalGross).toBeCloseTo(13224, 2) // 10063.67 + 3160.33
    expect(r.provenance.period.end).toBe('2026-08-30')
  })

  it('Ford: now has accepted native families (fresh 2026-08-24/30), each available', () => {
    const dp = readDealershipPerformance('tony-serra-ford')
    expect(dp.available).toBe(true)
    if (dp.available) expect(dp.provenance.period.end).toBe('2026-08-30')
    const ap = readAppointments('tony-serra-ford')
    expect(ap.available).toBe(true)
    if (ap.available) expect(ap.total).toBe(7)
    const g = readCrmSalesGross('tony-serra-ford')
    expect(g.available).toBe(true)
  })

  it('CRM Sales Gross real-file goldens: authoritative per-deal gross.total_sum + reconciliation, all three stores', () => {
    const expected: Record<string, { rows: number; total: number }> = {
      'serra-honda': { rows: 5, total: 14185.2 },
      'serra-nissan': { rows: 6, total: 13224.0 },
      'tony-serra-ford': { rows: 7, total: 1600.99 },
    }
    for (const [profile, exp] of Object.entries(expected)) {
      const g = readCrmSalesGross(profile)
      expect(g.available).toBe(true)
      if (!g.available) continue
      expect(g.rowCount).toBe(exp.rows)
      expect(g.totalSum).toBeCloseTo(exp.total, 2)
      // clean deliveries: every row Front+Back == Total (blank gross = 0, not missing)
      expect(g.reconciliationMismatches).toBe(0)
      expect(g.provenance.reportKind).toBe('crm_sales_gross')
      expect(g.provenance.period.end).toBe('2026-08-30')
      expect(g.provenance.checksum).toBeTruthy()
    }
  })
})
