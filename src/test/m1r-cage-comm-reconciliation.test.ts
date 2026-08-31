/**
 * Numerical reconciliation of the extended provisional CAGE + Sales-Communication metrics against
 * INDEPENDENT expected totals. Gated on the local-only real fixtures — SKIPS cleanly when the raw
 * workbooks are absent (so the committed suite stays PII-free and green in CI). All values are
 * aggregate; no customer/message content is read.
 *
 * These provisional figures remain NON-PROMOTING / directional (hidden Lead Intent); this test only
 * verifies the arithmetic matches the operator-supplied independent totals and the component
 * reconciliations hold.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { readProvisionalFamilyFile, computeProvisional, WEEKLY_PERIOD } from '../server/reports/provisional/provisional-adapter'

const FIXTURES = path.resolve(process.env.PROVISIONAL_FIXTURES_DIR ?? '.local-fixtures/vin18-20260830')
const present = fs.existsSync(FIXTURES)

const CAGE = {
  'serra-honda': { file: '09_VIN_Serra_Honda_21043_CAGE_KPI_Weekly_Report-4371.xlsx', total: 1473, calls: 509, emails: 232, texts: 732, facebook: 0, in: 188, out: 1285 },
  'serra-nissan': { file: '16_VIN_Serra_Nissan_21044_CAGE_KPI_Weekly_Report-7529.xlsx', total: 726, calls: 319, emails: 144, texts: 263, facebook: 0, in: 57, out: 669 },
  'tony-serra-ford': { file: '04_VIN_Tony_Serra_Ford_21047_CAGE_KPI_Weekly_Report-5643.xlsx', total: 510, calls: 219, emails: 89, texts: 202, facebook: 0, in: 57, out: 453 },
}
const COMM = {
  'serra-honda': { file: '10_VIN_Serra_Honda_21043_Sales_Communication_Log_Daily_Report-8860.xlsx', email: 8, loggedCall: 33, text: 28, facebook: 0 },
  'serra-nissan': { file: '15_VIN_Serra_Nissan_21044_Sales_Communication_Log_Daily_Report-5886.xlsx', email: 51, loggedCall: 95, text: 100, facebook: 0 },
  'tony-serra-ford': { file: '03_VIN_Tony_Serra_Ford_21047_Sales_Communication_Log_Daily_Report-3112.xlsx', email: 3, loggedCall: 16, text: 15, facebook: 0 },
}

const val = (r: any, id: string) => r.metrics.find((m: any) => m.id === id)?.value
const recon = (r: any, name: string) => r.componentReconciliations?.find((c: any) => c.name === name)

describe.skipIf(!present)('CAGE numerical reconciliation (real fixtures)', () => {
  for (const [profile, exp] of Object.entries(CAGE)) {
    it(`${profile}: total_comms=${exp.total} with exact component + direction + grand-total identities`, () => {
      const r = readProvisionalFamilyFile(path.join(FIXTURES, exp.file), 'cage_kpi', profile)
      expect(r.available, r.available ? '' : (r as any).reason).toBe(true)
      if (!r.available) return
      expect(val(r, 'cage.total_comms')).toBe(exp.total)
      expect(val(r, 'cage.total_calls')).toBe(exp.calls)
      expect(val(r, 'cage.total_emails')).toBe(exp.emails)
      expect(val(r, 'cage.total_texts')).toBe(exp.texts)
      expect(val(r, 'cage.total_facebook')).toBe(exp.facebook)
      expect(val(r, 'cage.total_comms_in')).toBe(exp.in)
      expect(val(r, 'cage.total_comms_out')).toBe(exp.out)
      // component identities
      expect(recon(r, 'cage.comms_components')?.reconciles).toBe(true) // calls+emails+texts+fb == total
      expect(recon(r, 'cage.comms_direction')?.reconciles).toBe(true) // in+out == total
      expect(recon(r, 'cage.comms_grand_total')?.reconciles).toBe(true) // leaf == grand TOTAL row
      // arithmetic sanity
      expect(exp.calls + exp.emails + exp.texts + exp.facebook).toBe(exp.total)
      expect(exp.in + exp.out).toBe(exp.total)
    })
  }
})

describe.skipIf(!present)('Sales Communication channel reconciliation (real fixtures)', () => {
  for (const [profile, exp] of Object.entries(COMM)) {
    it(`${profile}: Email/LoggedCall/Text/Facebook = ${exp.email}/${exp.loggedCall}/${exp.text}/${exp.facebook} sum to included sales rows`, () => {
      const r = readProvisionalFamilyFile(path.join(FIXTURES, exp.file), 'sales_comm_log', profile)
      expect(r.available, r.available ? '' : (r as any).reason).toBe(true)
      if (!r.available) return
      expect(val(r, 'comm.email')).toBe(exp.email)
      expect(val(r, 'comm.logged_call')).toBe(exp.loggedCall)
      expect(val(r, 'comm.text')).toBe(exp.text)
      expect(val(r, 'comm.facebook')).toBe(exp.facebook)
      const included = val(r, 'comm.sales_communications')
      expect(exp.email + exp.loggedCall + exp.text + exp.facebook).toBe(included)
      expect(recon(r, 'comm.channel_sum')?.reconciles).toBe(true)
    })
  }
})

describe('CAGE published metrics exclude a Service leaf; full-source reconciliation stays explicit', () => {
  // Hand-built CAGE workbook with ONE Service Lead Type leaf (100 comms) + two Sales leaves (10 + 20).
  const sheets = [
    { name: 'Report', rows: [
      ['Dealer', 'Lead Type', 'User', 'Total Leads', 'Total Calls', 'Total Emails', 'Total Texts', 'Total Facebook', 'Total Comms In', 'Total Comms Out', 'Total Comms'],
      ['Serra Honda', 'Internet', 'A', '5', '4', '3', '3', '0', '2', '8', '10'],
      ['Serra Honda', 'Phone', 'B', '7', '8', '6', '6', '0', '5', '15', '20'],
      ['Serra Honda', 'Service', 'C', '50', '40', '30', '30', '0', '20', '80', '100'], // Service leaf
      ['TOTAL', '', '', '62', '52', '39', '39', '0', '27', '103', '130'], // grand TOTAL (full source)
    ] },
    { name: 'Filters', rows: [
      ['Filter Name', 'Number Selected', 'Selected Values'],
      ['Dealers', '1', 'Serra Honda'],
      ['Date Range Begin', '1', 'Aug 24 2026'],
      ['Date Range End', '1', 'Aug 30 2026'],
    ] },
  ]
  const r = computeProvisional('cage_kpi', sheets as any, { profile: 'serra-honda', sourceFilename: 'x.xlsx', checksumSha256: 'z', expectedPeriod: WEEKLY_PERIOD })
  const get = (id: string) => (r.available ? r.metrics.find((m) => m.id === id)?.value : undefined)
  const comp = (name: string) => (r.available ? r.componentReconciliations?.find((c) => c.name === name) : undefined)

  it('published Total Comms/Calls exclude the Service leaf (30 & 12, not 130 & 52)', () => {
    expect(r.available).toBe(true)
    expect(get('cage.total_comms')).toBe(30) // 10 + 20 sales only (Service 100 excluded)
    expect(get('cage.total_calls')).toBe(12) // 4 + 8 sales only (Service 40 excluded)
    expect(r.available && r.serviceRowsExcluded).toBe(1)
  })
  it('sales-leaf component + direction identities reconcile on the PUBLISHED basis', () => {
    expect(comp('cage.comms_components')?.reconciles).toBe(true) // 12+9+9+0 == 30
    expect(comp('cage.comms_direction')?.reconciles).toBe(true) // 7+23 == 30
  })
  it('full-source grand-TOTAL reconciliation stays explicit and includes the Service leaf', () => {
    const g = comp('cage.comms_grand_total')
    expect(g?.reconciles).toBe(true) // FULL leaf 130 == grand TOTAL row 130
    expect(g?.detail).toMatch(/FULL-leaf Total Comms=130 vs grand TOTAL row=130/)
  })
})

describe('fixture presence', () => {
  it(present ? 'real fixtures present — numerical reconciliation ran' : 'fixtures absent — numerical reconciliation SKIPPED (expected in CI)', () => {
    expect(true).toBe(true)
  })
})
