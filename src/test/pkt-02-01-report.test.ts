// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { executePacket } from '@/server/reports/packet/engine'
import {
  CUSTOMER_FORBIDDEN,
  buildCustomerReport,
  buildInternalCompanion,
} from '@/server/reports/packet/report'

const REPO = path.resolve(__dirname, '..', '..')
const LEADS = process.env.HALO_LEADS_DIR ?? '/tmp/halo-295-leads-20260831'
const HAVE = fs.existsSync(
  path.join(LEADS, 'serra-honda-21043_leads_2026-08-24_2026-08-30.xlsx'),
)

const makeRun = () =>
  executePacket({
    repoRoot: REPO,
    leadsDir: LEADS,
    asOf: '2026-09-02T06:51:10Z',
    engineVersion: 'pkt-exec-1',
  })

describe.runIf(HAVE)('PKT-02-01 customer mini-report', () => {
  it('states the dealer, period and the measured Sales response findings plainly', () => {
    const md = buildCustomerReport(makeRun())
    expect(md).toMatch(/Serra Honda/)
    expect(md).toContain('2026-08-24')
    expect(md).toContain('2026-08-30')
    expect(md).toContain('6 min')
    expect(md).toContain('19.7%')
    expect(md).toContain('50%')
  })

  it('explains the unavailable checks plainly WITHOUT internal control jargon', () => {
    const md = buildCustomerReport(makeRun())
    // plain-language explanation of what is not covered
    expect(md.toLowerCase()).toMatch(/not (included|available)/)
    expect(md.toLowerCase()).toContain('opening hours')
    expect(md.toLowerCase()).toMatch(/automat/)
    // no quarantine mechanics / control jargon / raw identifiers leak to the customer
    for (const re of CUSTOMER_FORBIDDEN) {
      expect(md).not.toMatch(re)
    }
  })

  it('never leaks a metric id or a Sales Rep name to the customer', () => {
    const md = buildCustomerReport(makeRun())
    expect(md).not.toMatch(/SW-0\d\d/)
    expect(md.toLowerCase()).not.toContain('sales rep ')
  })
})

describe.runIf(HAVE)('PKT-02-01 internal evidence companion', () => {
  it('carries the full lineage, reconciliation and UNSENT alert simulations', () => {
    const md = buildInternalCompanion(makeRun())
    expect(md).toContain(
      '1c1c98a2e7b3be8d10eea9495861b7a33e65a00020ab7c9e756da363b69f2082',
    )
    expect(md).toContain(
      '39f0577400c912b8e0f0db4a37a35726c1a460c32df88f231aaa39aff9d100ae',
    )
    expect(md.toLowerCase()).toMatch(/reconcil/)
    expect(md).toMatch(/UNSENT|SIMULATED/)
    // pending metrics record their exact missing fields
    expect(md).toContain('authoritative_opening_schedule')
    expect(md).toContain('first_response_actor_classification')
  })
})
