// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  EXPECTED_BYTES,
  EXPECTED_SOURCE_SHA256,
  HONDA_DEALER_ID,
  LeadsInputError,
  loadHondaLeadsInput,
} from '@/server/reports/packet/leads-input'

const REPO = path.resolve(__dirname, '..', '..')
const LEADS = process.env.HALO_LEADS_DIR ?? '/tmp/halo-295-leads-20260831'
const HONDA_FILE = path.join(
  LEADS,
  'serra-honda-21043_leads_2026-08-24_2026-08-30.xlsx',
)
const HAVE =
  fs.existsSync(HONDA_FILE) &&
  fs.existsSync(path.join(LEADS, 'capture-manifest.json'))

describe.runIf(HAVE)('PKT-02-01 Honda-21043 leads input (sha-verified)', () => {
  it('reuses the accepted Honda evidence and reproduces the ratified aggregates', () => {
    const input = loadHondaLeadsInput({ repoRoot: REPO, leadsDir: LEADS })
    expect(input.sourceSha256).toBe(EXPECTED_SOURCE_SHA256)
    expect(input.bytes).toBe(EXPECTED_BYTES)
    expect(input.dealerId).toBe(HONDA_DEALER_ID)
    const m = input.metrics
    expect(m.dealer_ids).toEqual([HONDA_DEALER_ID])
    expect(m.total_rows).toBe(119)
    expect(m.business_hours_population).toBe(76)
    expect(m.response_numeric).toBe(27)
    expect(m.response_missing).toBe(49)
    // missing is never zero: numeric + missing == business-hours population
    expect(m.response_numeric + m.response_missing).toBe(
      m.business_hours_population,
    )
    expect(m.median_response_min).toBe(6)
    expect(m.untouched_strict).toBe(15)
    expect(m.reps_with_numeric).toBe(4)
    expect(m.triggered_reps).toBe(2)
  })

  it('carries lineage bound to the frozen source + period + sales-only proof', () => {
    const input = loadHondaLeadsInput({ repoRoot: REPO, leadsDir: LEADS })
    expect(input.lineage.filename).toBe(
      'serra-honda-21043_leads_2026-08-24_2026-08-30.xlsx',
    )
    expect(input.lineage.period).toEqual({
      start: '2026-08-24',
      end: '2026-08-30',
    })
    expect(input.lineage.sales_only_proof).toMatch(/Dealer ID=21043/)
    expect(input.lineage.sales_only_proof).toMatch(/zero Service\/Parts/i)
  })

  it('rejects a source whose bytes do not hash to the frozen sha (tamper)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pkt0201-tamper-'))
    // Copy the real capture-manifest (claims the golden sha) but corrupt the xlsx.
    fs.copyFileSync(
      path.join(LEADS, 'capture-manifest.json'),
      path.join(tmp, 'capture-manifest.json'),
    )
    const good = fs.readFileSync(HONDA_FILE)
    const bad = Buffer.from(good)
    bad[bad.length - 1] = bad[bad.length - 1] ^ 0xff // flip a byte
    fs.writeFileSync(
      path.join(tmp, 'serra-honda-21043_leads_2026-08-24_2026-08-30.xlsx'),
      bad,
    )
    expect(() =>
      loadHondaLeadsInput({ repoRoot: REPO, leadsDir: tmp }),
    ).toThrow(LeadsInputError)
  })

  it('rejects a missing leads directory (no silent zero)', () => {
    expect(() =>
      loadHondaLeadsInput({ repoRoot: REPO, leadsDir: '/no/such/dir' }),
    ).toThrow(LeadsInputError)
  })
})
