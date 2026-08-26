import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { makeXlsx, type Cell } from './helpers/make-xlsx'
import { landDelivery, holdRoot, type HoldMetadata } from '@/server/ingest/hold-store'

// Disposition is authoritative from the CURRENT classification. An authoritative HELD replay is
// eligible ONLY when the current classification is itself held at the same family/period/dealer/
// hash. When the current classification is QUARANTINE under the newer Sales-only contract, the
// delivery is withheld and NEVER replays a stale held copy of the same SHA (preserved as evidence).

let tmp: string
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hold-idem-')); process.env.INGEST_HOLD_ROOT = path.join(tmp, 'hold') })
afterEach(() => { try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }; delete process.env.INGEST_HOLD_ROOT })

const OPTS = { profileDealer: 'Serra Honda', capturedAt: '2026-08-24T00:00:00.000Z' }
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex')
const SALES_EIGHT = 'Import, Internet, Phone, PreviousCustomer, Referral, Walk-in, WebsiteChat, Wholesale'

// A real Lead Source ROI workbook. leadTypes drives Sales-only: the eight Sales types → held;
// a set containing Parts/Service → quarantine (non-sales-lead-type) under the current contract.
const roiWb = (leadTypes: string, period: [string, string] = ['2026-08-03', '2026-08-09']) => makeXlsx([
  { name: 'Report', rows: [['Lead Source', 'Total Leads', 'Good Leads', 'Sold from Leads'], ['Repeat', 79, 79, 24]] as Array<Array<Cell>> },
  { name: 'Filters', rows: [
    ['Filter Name', 'Number Selected', 'Selected Values'],
    ['Base Report Name', '1', 'Lead Source ROI'],
    ['Dealers', '1', 'Serra Honda of Sylacauga'],
    ['Lead Types', String(leadTypes.split(',').length), leadTypes],
    ['Date Range Begin', '1', period[0]],
    ['Date Range End', '1', period[1]],
  ] },
])
const meta = (over: Partial<HoldMetadata> = {}): HoldMetadata => ({
  profile: 'serra-honda', sender: 'reports@vinsolutions.com', subject: 'Lead Source ROI',
  gmail_message_id: 'gmail-abc', filename: 'roi.xlsx', received_at: '2026-08-24T00:00:00Z', ...over,
})

// Seed a HELD disposition for `sha` at the deterministic held path (simulates a prior, more
// lenient classifier having held these exact bytes).
function seedStaleHeld(sha: string, orig: Buffer, kind = 'lead_source_roi', period = { start: '2026-08-03', end: '2026-08-09' }) {
  const dir = path.join(holdRoot(), 'serra-honda', 'held', kind, `${period.start}_${period.end}`, sha)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
    receipt_id: `hold_${sha.slice(0, 16)}`, profile: 'serra-honda', file_extension: 'xlsx', sha256: sha,
    captured_at: '2026-08-25T08:39:16Z', transform_version: 'hold-only-2', report_kind: kind, period,
    validation_state: 'held', quarantine_reason: null,
  }, null, 2))
  fs.writeFileSync(path.join(dir, 'original.xlsx'), orig)
  return dir
}

describe('hold idempotency — current-classification-authoritative replay', () => {
  it('current-HELD: re-sending the same held bytes replays HELD (idempotency)', () => {
    const buf = roiWb(SALES_EIGHT)
    const first = landDelivery(buf, meta(), OPTS)
    expect(first.outcome).toBe('held')
    const second = landDelivery(buf, meta(), OPTS)
    expect(second.outcome).toBe('replay')
    expect(second.manifest.validation_state).toBe('held')
    expect(second.manifest.report_kind).toBe('lead_source_roi')
  })

  it('current-QUARANTINE never replays a stale held of the same SHA — returns quarantine, withholds', () => {
    // These exact bytes were held under an older classifier, but positively select Service/Parts
    // and QUARANTINE under the current Sales-only contract.
    const buf = roiWb('Import, Internet, Phone, Parts, Service, Referral, Walk-in, Wholesale')
    const sha = sha256(buf)
    const heldDir = seedStaleHeld(sha, buf)                     // stale held copy exists for this SHA
    const r = landDelivery(buf, meta(), OPTS)
    expect(r.outcome).toBe('quarantined')                       // NOT 'replay'/'held'
    expect(r.manifest.validation_state).toBe('quarantined')
    expect(r.manifest.quarantine_reason).toBeTruthy() // current Sales-only contract quarantines (real held originals: 'non-sales-lead-type')
    expect(r.hold_path).toContain(`${path.sep}quarantine${path.sep}`)
    expect(r.hold_path).not.toContain(`${path.sep}held${path.sep}`)
    expect(fs.existsSync(heldDir)).toBe(true)                   // historical held artifact preserved as evidence
  })

  it('quarantine-only SHA replays quarantine (unchanged)', () => {
    const buf = roiWb('Import, Internet, Phone, Parts, Service, Referral, Walk-in, Wholesale')
    const first = landDelivery(buf, meta(), OPTS)
    expect(first.outcome).toBe('quarantined')
    const second = landDelivery(buf, meta(), OPTS)
    expect(second.outcome).toBe('replay')
    expect(second.manifest.validation_state).toBe('quarantined')
  })
})
