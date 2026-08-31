import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import {
  metricSourceFamily,
  resolveMetricSourceFreshness,
} from '../server/reports/data-freshness'

const _require = createRequire(import.meta.url)
const Database = _require('better-sqlite3')
const NOW = new Date('2026-08-31T12:00:00Z')

describe('metricSourceFamily (pure mapping)', () => {
  it('maps each metric to its actual source family; unknown/quarantined → null', () => {
    expect(metricSourceFamily('appt.show_rate')).toBe('appointments')
    expect(metricSourceFamily('appt.no_show_rate')).toBe('appointments')
    expect(metricSourceFamily('gross.reconciliation_mismatches')).toBe('crm_sales_gross')
    expect(metricSourceFamily('gross.total_sum')).toBe('gross_total')
    expect(metricSourceFamily('dashboard.response_time_actual_avg_min')).toBe('dealership_performance')
    expect(metricSourceFamily('comm.escalation_keyword_screen')).toBeNull()
    expect(metricSourceFamily('roi.total_leads')).toBeNull()
    expect(metricSourceFamily(null)).toBeNull()
  })
})

describe('resolveMetricSourceFreshness — NO cross-family max-date bleed', () => {
  let ROOT = ''
  const saved = process.env.BRAIN_PROFILES_ROOT
  const P = 'fixt-fresh'

  function add(db: any, kind: string, periodEnd: string, headerJson: string, rows: unknown[][]) {
    db.prepare(
      `INSERT INTO ingest_delivery (id, profile, report_kind, period_start, period_end, checksum,
         parser_version, accepted_row_count, header_json, revision, status, superseded_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(`${kind}-d`, P, kind, '2026-01-01', periodEnd, `chk-${kind}`, 'v1', rows.length, headerJson, 1, 'accepted', null)
    const st = db.prepare(`INSERT INTO ingest_row (id, delivery_id, profile, report_kind, row_index, row_json) VALUES (?,?,?,?,?,?)`)
    rows.forEach((r, i) => st.run(`${kind}-r${i}`, `${kind}-d`, P, kind, i, JSON.stringify(r)))
  }

  beforeAll(() => {
    ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'src-fresh-'))
    process.env.BRAIN_PROFILES_ROOT = ROOT
    const dbPath = path.join(ROOT, P, 'brain', 'brain.db')
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    const db = new Database(dbPath)
    db.exec(
      `CREATE TABLE ingest_delivery (id TEXT, profile TEXT, report_kind TEXT, period_start TEXT,
         period_end TEXT, checksum TEXT, parser_version TEXT, accepted_row_count INTEGER,
         header_json TEXT, revision INTEGER, status TEXT, superseded_by TEXT);
       CREATE TABLE ingest_row (id TEXT, delivery_id TEXT, profile TEXT, report_kind TEXT,
         row_index INTEGER, row_json TEXT);`,
    )
    // DELIBERATELY DIFFERENT period ends per family.
    add(db, 'appointments', '2026-08-16',
      JSON.stringify(['Appointment ID', 'Appointment Status', 'Is Completed', 'Is Confirmed', 'Is Show', 'Is No Show', 'Is Cancelled', 'Rescheduled Date']),
      [['a1', 'Show', 'Yes', 'Yes', 'Yes', 'No', 'No', '']])
    add(db, 'dealership_performance', '2026-08-30', '[]',
      [['Dealership Summary'],
       ['', 'Leads', 'Appts Set', 'Appts Show', 'Total Visits', 'Visits Sold', 'Sold in Period', 'Front Gross', 'Back Gross', 'Avg Total Gross'],
       ['TOTAL', '10', '2', '2', '4', '2', '2', '100', '200', '150']])
    add(db, 'crm_sales_gross', '2026-08-23',
      JSON.stringify(['Dealer', 'Dealer ID', 'Front Gross', 'Back Gross', 'Total Gross']),
      [['Serra Honda of Sylacauga', '21043', '100', '50', '150']])
    db.close()
  })
  afterAll(() => {
    if (saved === undefined) delete process.env.BRAIN_PROFILES_ROOT; else process.env.BRAIN_PROFILES_ROOT = saved
    try { fs.rmSync(ROOT, { recursive: true, force: true }) } catch { /* noop */ }
  })

  it('each metric borrows ONLY its own family period end (no bleed to the newest 08-30)', () => {
    // appointments = 08-16 (NOT the dashboard 08-30)
    const appt = resolveMetricSourceFreshness(P, 'appt.show_rate', NOW)
    expect(appt.dataThrough).toBe('2026-08-16')
    // dashboard = 08-30
    const dash = resolveMetricSourceFreshness(P, 'dashboard.response_time_actual_avg_min', NOW)
    expect(dash.dataThrough).toBe('2026-08-30')
    // gross reconciliation = CRM 08-23
    const recon = resolveMetricSourceFreshness(P, 'gross.reconciliation_mismatches', NOW)
    expect(recon.dataThrough).toBe('2026-08-23')
    // gross.total_sum prefers CRM (present) = 08-23, NOT dashboard 08-30
    const total = resolveMetricSourceFreshness(P, 'gross.total_sum', NOW)
    expect(total.dataThrough).toBe('2026-08-23')
    // three DISTINCT dates prove no cross-family max-date bleed
    expect(new Set([appt.dataThrough, dash.dataThrough, recon.dataThrough]).size).toBe(3)
  })

  it('unknown/quarantined source fails closed to missing (no borrowed date)', () => {
    for (const m of ['comm.escalation_keyword_screen', 'roi.total_leads', null]) {
      const f = resolveMetricSourceFreshness(P, m, NOW)
      expect(f.state).toBe('missing')
      expect(f.dataThrough).toBeNull()
    }
  })

  it('gross.total_sum falls back to Dashboard provenance when CRM is absent', () => {
    // A profile with ONLY a dashboard delivery: gross.total_sum should borrow the Dashboard date.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'src-fresh2-'))
    const prev = process.env.BRAIN_PROFILES_ROOT
    try {
      process.env.BRAIN_PROFILES_ROOT = root
      const dbPath = path.join(root, 'p2', 'brain', 'brain.db')
      fs.mkdirSync(path.dirname(dbPath), { recursive: true })
      const db = new Database(dbPath)
      db.exec(`CREATE TABLE ingest_delivery (id TEXT, profile TEXT, report_kind TEXT, period_start TEXT, period_end TEXT, checksum TEXT, parser_version TEXT, accepted_row_count INTEGER, header_json TEXT, revision INTEGER, status TEXT, superseded_by TEXT); CREATE TABLE ingest_row (id TEXT, delivery_id TEXT, profile TEXT, report_kind TEXT, row_index INTEGER, row_json TEXT);`)
      // ONLY a dashboard delivery (no CRM Sales Gross) → gross.total_sum must fall back to it.
      db.prepare(`INSERT INTO ingest_delivery (id, profile, report_kind, period_start, period_end, checksum, parser_version, accepted_row_count, header_json, revision, status, superseded_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run('dp', 'p2', 'dealership_performance', '2026-01-01', '2026-08-30', 'c', 'v1', 3, '[]', 1, 'accepted', null)
      const rows = [['Dealership Summary'], ['', 'Leads', 'Appts Set', 'Appts Show', 'Total Visits', 'Visits Sold', 'Sold in Period', 'Front Gross', 'Back Gross', 'Avg Total Gross'], ['TOTAL', '10', '2', '2', '4', '2', '2', '100', '200', '150']]
      const st = db.prepare(`INSERT INTO ingest_row (id, delivery_id, profile, report_kind, row_index, row_json) VALUES (?,?,?,?,?,?)`)
      rows.forEach((r, i) => st.run(`dp-r${i}`, 'dp', 'p2', 'dealership_performance', i, JSON.stringify(r)))
      db.close()
      const total = resolveMetricSourceFreshness('p2', 'gross.total_sum', NOW)
      expect(total.dataThrough).toBe('2026-08-30') // Dashboard fallback
    } finally {
      if (prev === undefined) delete process.env.BRAIN_PROFILES_ROOT; else process.env.BRAIN_PROFILES_ROOT = prev
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe.runIf(fs.existsSync('/srv/ingest-dev/analytics/serra-honda/brain/brain.db'))(
  'resolveMetricSourceFreshness — current real store (all families 2026-08-30)',
  () => {
    const saved = process.env.BRAIN_PROFILES_ROOT
    beforeAll(() => { process.env.BRAIN_PROFILES_ROOT = '/srv/ingest-dev/analytics' })
    afterAll(() => { if (saved === undefined) delete process.env.BRAIN_PROFILES_ROOT; else process.env.BRAIN_PROFILES_ROOT = saved })
    it('Honda/Nissan/Ford: appt/gross/dashboard metrics all data-through Aug 30, 2026', () => {
      for (const p of ['serra-honda', 'serra-nissan', 'tony-serra-ford']) {
        for (const m of ['appt.show_rate', 'gross.reconciliation_mismatches', 'gross.total_sum', 'dashboard.response_time_actual_avg_min']) {
          const f = resolveMetricSourceFreshness(p, m, NOW)
          expect(f.dataThroughLabel).toBe('Aug 30, 2026')
          expect(['current', 'aging']).toContain(f.state)
        }
      }
    })
  },
)

describe.runIf(fs.existsSync('/srv/ingest-dev/analytics/serra-honda/brain/brain.db'))(
  'resolveMetricSourceFreshness — timezone boundary on the REAL store (Serra = America/Chicago)',
  () => {
    const saved = process.env.BRAIN_PROFILES_ROOT
    beforeAll(() => { process.env.BRAIN_PROFILES_ROOT = '/srv/ingest-dev/analytics' })
    afterAll(() => { if (saved === undefined) delete process.env.BRAIN_PROFILES_ROOT; else process.env.BRAIN_PROFILES_ROOT = saved })
    it('2026-08-31T01:10Z (still Aug 30 CDT) → Aug-30 data renders "updated today" for all three', () => {
      const boundary = new Date('2026-08-31T01:10:00Z')
      for (const p of ['serra-honda', 'serra-nissan', 'tony-serra-ford']) {
        const f = resolveMetricSourceFreshness(p, 'appt.show_rate', boundary)
        expect(f.dataThroughLabel).toBe('Aug 30, 2026')
        expect(f.ageLabel).toBe('Data through Aug 30, 2026 · updated today')
        expect(f.state).toBe('current')
      }
    })
    it('2026-08-31T18:00Z (Aug 31 CDT) → Aug-30 data renders "updated yesterday"', () => {
      const f = resolveMetricSourceFreshness('serra-honda', 'gross.reconciliation_mismatches', new Date('2026-08-31T18:00:00Z'))
      expect(f.ageLabel).toBe('Data through Aug 30, 2026 · updated yesterday')
    })
  },
)
