// @vitest-environment node
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  IDENTITY,
  leadsProvenance,
  leadsRows,
  leadsWorkbook,
} from './helpers/leads-fixture'
import { makeXlsx, makeXlsxSheets } from './helpers/make-xlsx'
import { classifyLeadsDelivery } from '@/server/reports/leads/leads-classifier'

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex')
const D = IDENTITY['serra-honda']
const defaults = { dealer: D.dealer, dealerId: D.dealerId }
const twoLeads = [
  { id: 'A1', actual: '10' },
  { id: 'A2', actual: '' },
]

function held(buf: Buffer, rows: number, overrides = {}) {
  return classifyLeadsDelivery(
    buf,
    leadsProvenance('serra-honda', buf, rows, overrides),
  )
}

describe('Leads classifier — positive hold', () => {
  it('a clean single-Export workbook with full provenance holds with ZERO gaps', () => {
    const buf = leadsWorkbook(twoLeads, defaults)
    const cls = held(buf, 2)
    expect(cls.status).toBe('held')
    if (cls.status !== 'held') return
    expect(cls.dealer_id).toBe('21043')
    expect(cls.rows).toBe(2)
    expect(cls.provenance_gaps).toEqual([])
    expect(cls.checks_passed).toContain('sales_only_scan')
    expect(cls.checks_passed).toContain('captured_at_timezone')
  })
})

describe('Leads classifier — fail-closed negatives (all quarantine)', () => {
  const expectQ = (
    cls: ReturnType<typeof classifyLeadsDelivery>,
    check: string,
  ) => {
    expect(cls.status).toBe('quarantined')
    if (cls.status !== 'quarantined') return
    expect(cls.failures.map((f) => f.check)).toContain(check)
  }

  it('bad magic bytes', () => {
    const buf = Buffer.from('this is not a zip at all, definitely')
    expectQ(
      classifyLeadsDelivery(buf, leadsProvenance('serra-honda', buf, 0)),
      'magic_bytes',
    )
  })

  it('bad declared hash', () => {
    const buf = leadsWorkbook(twoLeads, defaults)
    expectQ(
      classifyLeadsDelivery(
        buf,
        leadsProvenance('serra-honda', buf, 2, { declared_sha256: 'deadbeef' }),
      ),
      'declared_sha256',
    )
  })

  it('bad source host (dashboard host substituted)', () => {
    const buf = leadsWorkbook(twoLeads, defaults)
    expectQ(
      held(buf, 2, {
        source_url: 'https://vinsolutions.app.coxautoinc.com/InfoGo/x',
      }),
      'source_url_host',
    )
  })

  it('subdomain host attack', () => {
    const buf = leadsWorkbook(twoLeads, defaults)
    expectQ(
      held(buf, 2, {
        source_url:
          'https://evil.reporting-vinsolutions.app.coxautoinc.com/InfoGo/x',
      }),
      'source_url_host',
    )
  })

  it('wrong declared dealer id for profile', () => {
    const buf = leadsWorkbook(twoLeads, defaults)
    expectQ(held(buf, 2, { dealer_id: '21044' }), 'dealer_identity')
  })

  it('wrong dealer name on a data row', () => {
    const buf = leadsWorkbook(
      [{ id: 'A1' }, { id: 'A2', dealer: 'Serra Nissan of Sylacauga' }],
      defaults,
    )
    expectQ(held(buf, 2), 'dealer_name')
  })

  it('wrong dealer id on a data row (multi-rooftop leak)', () => {
    const buf = leadsWorkbook(
      [{ id: 'A1' }, { id: 'A2', dealerId: '21044' }],
      defaults,
    )
    expectQ(held(buf, 2), 'one_rooftop')
  })

  it('out-of-period origination row', () => {
    const buf = leadsWorkbook(
      [{ id: 'A1' }, { id: 'A2', orig: '2026-09-01' }],
      defaults,
    )
    expectQ(held(buf, 2), 'period_rows')
  })

  it('duplicate Lead ID', () => {
    const buf = leadsWorkbook([{ id: 'DUP' }, { id: 'DUP' }], defaults)
    expectQ(held(buf, 2), 'lead_id')
  })

  it('blank Lead ID', () => {
    const buf = leadsWorkbook([{ id: '' }, { id: 'A2' }], defaults)
    expectQ(held(buf, 2), 'lead_id')
  })

  it('disallowed Lead Type', () => {
    const buf = leadsWorkbook([{ id: 'A1', type: 'BulkImportBatch' }], defaults)
    expectQ(held(buf, 1), 'sales_only_lead_type')
  })

  it('Service source (declared exclusion list) — rejected Honda Service Dept analog', () => {
    const buf = leadsWorkbook(
      [{ id: 'A1' }, { id: 'A2', source: 'Service Dept' }],
      defaults,
    )
    const cls = held(buf, 2)
    expectQ(cls, 'sales_only_source')
    expectQ(cls, 'sales_only_scan') // also caught by the token scan
  })

  it('Service/Parts token hidden in a non-source categorical column', () => {
    const buf = leadsWorkbook(
      [{ id: 'A1', sourceGroup: 'Parts Special' }],
      defaults,
    )
    expectQ(held(buf, 1), 'sales_only_scan')
  })

  it('schema drift (renamed header)', () => {
    const rows = leadsRows(twoLeads, defaults)
    rows[0][4] = 'Lead Typ' // corrupt "Lead Type"
    const buf = makeXlsx(rows)
    expectQ(held(buf, 2), 'schema')
  })

  it('missing a column (56 columns)', () => {
    const rows = leadsRows(twoLeads, defaults).map((r) => r.slice(0, 56))
    const buf = makeXlsx(rows)
    expectQ(held(buf, 2), 'schema')
  })

  it('non-blank extra column beyond the 57-grid', () => {
    const buf = leadsWorkbook([{ id: 'A1', extra: 'JUNK' }], defaults)
    expectQ(held(buf, 1), 'extra_columns')
  })

  it('extra non-blank data row (row-count mismatch)', () => {
    const buf = leadsWorkbook(
      [{ id: 'A1' }, { id: 'A2' }, { id: 'A3' }],
      defaults,
    )
    expectQ(held(buf, 2), 'row_count') // declared 2, parsed 3
  })

  it('a second sheet', () => {
    const rows = leadsRows(twoLeads, defaults)
    const buf = makeXlsxSheets([
      { name: 'Export', rows },
      { name: 'Extra', rows: [['x']] },
    ])
    expectQ(held(buf, 2), 'single_sheet')
  })

  it('wrong sheet name', () => {
    const buf = makeXlsx(leadsRows(twoLeads, defaults), 'Sheet1')
    expectQ(held(buf, 2), 'sheet_name')
  })

  it('a formula cell', () => {
    const rows = leadsRows(twoLeads, defaults)
    const buf = makeXlsxSheets([{ name: 'Export', rows, formulaAt: [[1, 9]] }])
    expectQ(held(buf, 2), 'no_formulas')
  })

  it('present-but-wrong declared_report_kind', () => {
    const buf = leadsWorkbook(twoLeads, defaults)
    expectQ(
      held(buf, 2, { declared_report_kind: 'response_times' }),
      'declared_report_kind',
    )
  })

  it('captured_at without a timezone offset', () => {
    const buf = leadsWorkbook(twoLeads, defaults)
    expectQ(
      held(buf, 2, { captured_at: '2026-08-31T23:37:47' }),
      'captured_at_timezone',
    )
  })

  it('bad capture id shape', () => {
    const buf = leadsWorkbook(twoLeads, defaults)
    expectQ(held(buf, 2, { capture_id: 'nope' }), 'capture_id')
  })

  it('filename period mismatch', () => {
    const buf = leadsWorkbook(twoLeads, defaults)
    expectQ(
      held(buf, 2, {
        filename: 'serra-honda-21043_leads_2026-01-01_2026-01-07.xlsx',
      }),
      'filename_period',
    )
  })
})
