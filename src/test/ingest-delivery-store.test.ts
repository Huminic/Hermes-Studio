import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  countActiveRows,
  listActiveRows,
  listDeliveries,
  recordDelivery,
  type DeliveryInput,
} from '@/server/ingest/ingest-delivery-store'

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ingest-delivery-'))
  process.env.BRAIN_PROFILES_ROOT = path.join(tmp, '.hermes', 'profiles')
})
afterEach(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
})

const HEADER = ['Dealer', 'Lead_Source', 'Total_Leads']
const ROWS = [['Serra Honda of Sylacauga', 'Repeat Customer', '79'], ['Serra Honda of Sylacauga', 'Autoweb', '20']]
const ROWS2 = [['Serra Honda of Sylacauga', 'Repeat Customer', '88'], ['Serra Honda of Sylacauga', 'Autoweb', '25']]

const base = (over: Partial<DeliveryInput> = {}): DeliveryInput => ({
  profile: 'serra-honda', dealer: 'Serra Honda', report_kind: 'lead_source_roi',
  period_start: '2026-08-04', period_end: '2026-08-10', source_filename: 'roi.xlsx',
  source_filter_metadata: { dealers: ['Serra Honda'] }, final_filter_metadata: { dealers: ['Serra Honda'] },
  checksum: 'chk-A', parser_version: 'vin-xlsx-1',
  source_row_count: 2, accepted_row_count: 2, header: HEADER,
  validation_evidence: {}, status: 'accepted', quarantine_reason: null, ...over,
})

describe('ingest_delivery + ingest_row store', () => {
  it('accepted delivery persists rows; readback returns exact cells + header', () => {
    const r = recordDelivery(base(), ROWS, 1000)
    expect(r).toMatchObject({ outcome: 'accepted', revision: 1, accepted_rows: 2 })
    const active = listActiveRows('serra-honda')
    expect(active).toHaveLength(2)
    expect(active.map((a) => a.row)).toEqual(ROWS)
    expect(active[0].header).toEqual(HEADER)
  })

  it('duplicate checksum is a no-op AND adds no analytical rows', () => {
    recordDelivery(base(), ROWS, 1000)
    const dup = recordDelivery(base({ source_filename: 'again.xlsx' }), ROWS, 2000)
    expect(dup.outcome).toBe('duplicate')
    expect(dup.accepted_rows).toBe(0)
    expect(countActiveRows('serra-honda')).toBe(2) // unchanged
  })

  it('corrected same-period supersedes; active rows are ONLY the new revision', () => {
    recordDelivery(base({ checksum: 'A' }), ROWS, 1000)
    const second = recordDelivery(base({ checksum: 'B' }), ROWS2, 2000)
    expect(second).toMatchObject({ outcome: 'superseded', revision: 2 })
    const active = listActiveRows('serra-honda')
    expect(active).toHaveLength(2) // NOT 4 — revisions never mix
    expect(active.map((a) => a.row)).toEqual(ROWS2)
  })

  it('different period does NOT supersede; rows accumulate', () => {
    recordDelivery(base({ checksum: 'p1' }), ROWS, 1000)
    recordDelivery(base({ checksum: 'p2', period_start: '2026-08-11', period_end: '2026-08-17' }), ROWS, 2000)
    expect(countActiveRows('serra-honda')).toBe(4)
    expect(listActiveRows('serra-honda', { period_start: '2026-08-11', period_end: '2026-08-17' })).toHaveLength(2)
  })

  it('quarantined delivery adds ZERO analytical rows but preserves source_row_count', () => {
    const r = recordDelivery(
      base({ checksum: 'q', status: 'quarantined', quarantine_reason: 'ambiguous-tenant', accepted_row_count: 0, source_row_count: 3 }),
      [],
      1000,
    )
    expect(r.outcome).toBe('quarantined')
    expect(countActiveRows('serra-honda')).toBe(0)
    const rec = listDeliveries('serra-honda')[0]
    expect(rec.status).toBe('quarantined')
    expect(rec.source_row_count).toBe(3)
    expect(rec.accepted_row_count).toBe(0)
  })
})
