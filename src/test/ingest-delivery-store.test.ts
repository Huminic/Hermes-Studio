import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
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

const base = (over: Partial<DeliveryInput> = {}): DeliveryInput => ({
  profile: 'serra-honda',
  dealer: 'Serra Honda',
  report_kind: 'lead_source_roi',
  period_start: '2026-08-04',
  period_end: '2026-08-10',
  source_filename: 'roi.xlsx',
  source_filter_metadata: { dealers: ['Serra Honda'] },
  final_filter_metadata: { dealers: ['Serra Honda'] },
  checksum: 'chk-A',
  parser_version: 'vin-xlsx-1',
  row_count: 12,
  validation_evidence: { rows_validated: 12 },
  status: 'accepted',
  quarantine_reason: null,
  ...over,
})

describe('ingest_delivery provenance store', () => {
  it('records an accepted delivery at revision 1', () => {
    const r = recordDelivery(base(), 1000)
    expect(r.outcome).toBe('accepted')
    expect(r.revision).toBe(1)
    expect(listDeliveries('serra-honda')).toHaveLength(1)
  })

  it('duplicate checksum is a NO-OP', () => {
    recordDelivery(base(), 1000)
    const dup = recordDelivery(base({ source_filename: 'roi-again.xlsx' }), 2000)
    expect(dup.outcome).toBe('duplicate')
    expect(listDeliveries('serra-honda')).toHaveLength(1) // still one row
  })

  it('corrected same-period data supersedes transactionally (revision bump)', () => {
    const first = recordDelivery(base({ checksum: 'chk-A' }), 1000)
    const second = recordDelivery(base({ checksum: 'chk-B', row_count: 15 }), 2000)
    expect(second.outcome).toBe('superseded')
    expect(second.revision).toBe(2)
    expect(second.superseded).toEqual([first.id])
    const all = listDeliveries('serra-honda')
    const prior = all.find((d) => d.id === first.id)!
    const now = all.find((d) => d.id === second.id)!
    expect(prior.superseded_by).toBe(second.id)
    expect(now.superseded_by).toBeNull()
    expect(now.revision).toBe(2)
    // active (non-superseded) accepted delivery for the period is exactly one
    expect(all.filter((d) => d.status === 'accepted' && d.superseded_by == null)).toHaveLength(1)
  })

  it('different period does NOT supersede', () => {
    recordDelivery(base({ checksum: 'p1' }), 1000)
    const other = recordDelivery(base({ checksum: 'p2', period_start: '2026-08-11', period_end: '2026-08-17' }), 2000)
    expect(other.outcome).toBe('accepted')
    expect(other.revision).toBe(1)
    expect(listDeliveries('serra-honda')).toHaveLength(2)
  })

  it('quarantined deliveries are recorded (no supersession, reason kept)', () => {
    const r = recordDelivery(base({ checksum: 'q1', status: 'quarantined', quarantine_reason: 'ambiguous-tenant', row_count: 0 }), 1000)
    expect(r.outcome).toBe('quarantined')
    const rec = listDeliveries('serra-honda')[0]
    expect(rec.status).toBe('quarantined')
    expect(rec.quarantine_reason).toBe('ambiguous-tenant')
  })
})
