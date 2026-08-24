import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { makeXlsx, type Cell } from './helpers/make-xlsx'
import {
  landDelivery, readHeldReceipt, listHeldDeliveries, isHoldEligible,
  HOLD_ELIGIBLE, HOLD_CONTRACT, holdRoot, type HoldMetadata,
} from '@/server/ingest/hold-store'

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hold-'))
  process.env.INGEST_HOLD_ROOT = path.join(tmp, 'hold')
})
afterEach(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
  delete process.env.INGEST_HOLD_ROOT
})

const DEALER = 'Serra Honda' // studio config dealer name
const CAPTURED = '2026-08-24T00:00:00.000Z'
const OPTS = { profileDealer: DEALER, capturedAt: CAPTURED }

const roiWb = (o: { dealer?: string; total?: number; dealers?: string; dateRange?: string; source?: string } = {}) => {
  const dealer = o.dealer ?? 'Serra Honda of Sylacauga'
  const total = o.total ?? 79
  const rows: Array<Array<Cell>> = [
    ['Dealer', 'Lead_Source', 'Total_Leads', 'Good_Leads', 'Sold_from_Leads'],
    [dealer, o.source ?? 'Repeat', total, total, 24],
  ]
  return makeXlsx([
    { name: 'Report', rows },
    { name: 'Filters', rows: [['Base Report Name', 'Lead Source ROI'], ['Dealers', o.dealers ?? 'Serra Honda'], ['Date Range', o.dateRange ?? '2026-08-03 - 2026-08-09']] },
  ])
}

const meta = (over: Partial<HoldMetadata> = {}): HoldMetadata => ({
  profile: 'serra-honda', sender: 'reports@vinsolutions.com', subject: 'Lead Source ROI',
  gmail_message_id: 'gmail-abc', filename: 'roi_2026-08-03.xlsx', received_at: '2026-08-24T00:00:00Z', ...over,
})

describe('HOLD_ONLY landing — held happy path', () => {
  it('preserves bytes immutably, writes a full manifest receipt, no action', () => {
    const buf = roiWb()
    const r = landDelivery(buf, meta(), OPTS)
    expect(r.outcome).toBe('held')
    const m = r.manifest
    expect(m.validation_state).toBe('held')
    expect(m.report_kind).toBe('lead_source_roi')
    expect(m.period).toEqual({ start: '2026-08-03', end: '2026-08-09' })
    expect(m.sha256).toHaveLength(64)
    expect(m.size_bytes).toBe(buf.length)
    expect(m.gmail_message_id).toBe('gmail-abc')
    expect(m.sender).toBe('reports@vinsolutions.com')
    expect(m.subject).toBe('Lead Source ROI')
    expect(m.parser_version).toBe('vin-xlsx-1')
    expect(m.transform_version).toBe('hold-only-1')
    expect(m.captured_at).toBe(CAPTURED)
    expect(m.hold_only).toBe(true)
    expect(m.no_action).toBe(true)
    // bytes on disk are byte-identical to the source
    expect(fs.existsSync(r.original_path)).toBe(true)
    expect(fs.readFileSync(r.original_path).equals(buf)).toBe(true)
    expect(fs.existsSync(r.manifest_path)).toBe(true)
    // deterministic layout: profile/held/kind/period/sha
    expect(r.hold_path).toContain(path.join('serra-honda', 'held', 'lead_source_roi', '2026-08-03_2026-08-09'))
  })

  it('idempotent replay is a no-op with the same receipt id', () => {
    const buf = roiWb()
    const first = landDelivery(buf, meta(), OPTS)
    const bytesBefore = fs.readFileSync(first.original_path)
    const second = landDelivery(buf, meta(), OPTS)
    expect(second.outcome).toBe('replay')
    expect(second.manifest.receipt_id).toBe(first.manifest.receipt_id)
    expect(fs.readFileSync(first.original_path).equals(bytesBefore)).toBe(true)
  })

  it('a corrected checksum is stored separately and attributably', () => {
    const r1 = landDelivery(roiWb({ total: 79 }), meta(), OPTS)
    const r2 = landDelivery(roiWb({ total: 88 }), meta({ filename: 'roi_corrected.xlsx' }), OPTS)
    expect(r2.outcome).toBe('held')
    expect(r2.manifest.sha256).not.toBe(r1.manifest.sha256)
    expect(r2.manifest.prior_sha256_in_period).toContain(r1.manifest.sha256)
    expect(fs.existsSync(r1.original_path)).toBe(true) // prior retained, not overwritten
    expect(fs.existsSync(r2.original_path)).toBe(true)
  })
})

describe('HOLD_ONLY landing — whole-delivery quarantine triggers', () => {
  const q = (buf: Buffer, m = meta(), opts = OPTS) => landDelivery(buf, m, opts)

  it('wrong dealer', () => {
    const r = q(roiWb({ dealer: 'Serra Nissan of Sylacauga' }))
    expect(r.outcome).toBe('quarantined')
    expect(r.manifest.quarantine_reason).toBe('wrong-dealer')
    expect(r.hold_path).toContain(path.join('serra-honda', 'quarantine'))
    expect(fs.existsSync(r.original_path)).toBe(true) // bytes still preserved
  })

  it('Service/Parts intent', () => {
    const r = q(roiWb({ source: 'Service Special' }))
    expect(r.manifest.quarantine_reason).toBe('non-sales-lead-type')
  })

  it('ambiguity (multi-rooftop)', () => {
    const r = q(roiWb({ dealers: 'Serra Honda; Serra Nissan' }))
    expect(r.manifest.quarantine_reason).toBe('ambiguous-tenant')
  })

  it('malformed bytes', () => {
    const r = q(Buffer.from('PK-not-a-real-xlsx'))
    expect(r.manifest.quarantine_reason).toBe('malformed-workbook')
    expect(fs.existsSync(r.original_path)).toBe(true) // raw bytes retained
  })

  it('missing required metadata', () => {
    const r = q(roiWb(), meta({ gmail_message_id: '' }))
    expect(r.manifest.quarantine_reason).toBe('missing-required-metadata')
    expect(r.manifest.detail).toMatch(/gmail_message_id/)
  })

  it('unexpected period (hint disagrees with workbook)', () => {
    const r = q(roiWb(), meta({ period_hint: '2026-01-01' }))
    expect(r.manifest.quarantine_reason).toBe('unexpected-period')
  })
})

describe('HOLD_ONLY — optional transport payload (structural, no metrics)', () => {
  it('stores a structural passthrough with header/rows and NO business metric', () => {
    const buf = roiWb()
    const r = landDelivery(buf, meta(), { ...OPTS, includeTransport: true })
    expect(r.manifest.transport_stored).toBe(true)
    expect(r.transport_path).toBeTruthy()
    const t = JSON.parse(fs.readFileSync(r.transport_path!, 'utf8')) as Record<string, unknown>
    expect(t.shape).toBe('transport-only')
    expect(t.header).toContain('Total_Leads')
    expect(Array.isArray(t.rows)).toBe(true)
    // no computed business metric leaked into the transport payload
    const blob = JSON.stringify(t)
    expect(blob).not.toContain('metric_id')
    expect(blob).not.toContain('aggregate_basis')
    expect(blob).not.toContain('autonomous_action')
  })

  it('omits transport by default', () => {
    const r = landDelivery(roiWb(), meta(), OPTS)
    expect(r.manifest.transport_stored).toBe(false)
    expect(r.transport_path).toBeNull()
  })
})

describe('HOLD_ONLY — readback + eligibility', () => {
  it('durable readback by checksum and by profile', () => {
    const r = landDelivery(roiWb(), meta(), OPTS)
    const back = readHeldReceipt('serra-honda', r.manifest.sha256)
    expect(back?.receipt_id).toBe(r.manifest.receipt_id)
    const list = listHeldDeliveries('serra-honda', { state: 'held' })
    expect(list.map((m) => m.sha256)).toContain(r.manifest.sha256)
  })

  it('supports only the three exact Serra profiles', () => {
    expect([...HOLD_ELIGIBLE].sort()).toEqual(['serra-honda', 'serra-nissan', 'tony-serra-ford'])
    expect(isHoldEligible('serra-honda')).toBe(true)
    expect(isHoldEligible('serra-nissan')).toBe(true)
    expect(isHoldEligible('tony-serra-ford')).toBe(true)
    expect(isHoldEligible('serra-automotive')).toBe(false)
    expect(isHoldEligible('ford-of-columbia')).toBe(false)
  })
})

describe('HOLD_ONLY — HARD GUARD (no downstream use)', () => {
  const read = (rel: string) => fs.readFileSync(path.resolve(rel), 'utf8')
  const importLines = (src: string) => src.split('\n').filter((l) => /^\s*import\b/.test(l)).join('\n')

  // Guard on IMPORTS + CALL SITES (a `foo(` invocation), not documentation mentions.
  const noBannedImports = (src: string) => expect(importLines(src)).not.toMatch(/vin-metrics|ingest-delivery-store|watchdog|notif|workflow/i)
  const noBannedCalls = (src: string) => {
    expect(src).not.toMatch(/\brecordDelivery\s*\(/)
    expect(src).not.toMatch(/\brunVinWatchdog\s*\(/)
    expect(src).not.toMatch(/\blistActiveRows\s*\(/)
  }

  it('the holding store never imports OR invokes metrics/analytical-store/watchdog', () => {
    const src = read('src/server/ingest/hold-store.ts')
    noBannedImports(src)
    noBannedCalls(src)
  })

  it('the holding route never imports OR invokes metrics/analytical-store/watchdog', () => {
    const src = read('src/routes/api/ingest/hold.ts')
    noBannedImports(src)
    noBannedCalls(src)
  })

  it('advertises the inert contract', () => {
    expect(HOLD_CONTRACT.hold_only).toBe(true)
    expect(HOLD_CONTRACT.no_action).toBe(true)
    expect(HOLD_CONTRACT.forbids).toContain('watchdog_execution')
    expect(HOLD_CONTRACT.forbids).toContain('metric_calculation')
    expect(HOLD_CONTRACT.forbids).toContain('notification')
  })

  it('holdRoot honours INGEST_HOLD_ROOT (isolated from brain profiles)', () => {
    expect(holdRoot()).toBe(path.join(tmp, 'hold'))
    expect(holdRoot()).not.toContain('profiles')
  })
})
