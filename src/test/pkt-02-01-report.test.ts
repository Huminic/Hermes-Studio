// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { executePacket } from '@/server/reports/packet/engine'
import {
  CUSTOMER_FORBIDDEN,
  SIP_FORBIDDEN,
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

  it('contains ONLY measured findings — no source-investigation-pending content (Amendment 002 / sales-document boundary)', () => {
    const md = buildCustomerReport(makeRun())
    // No "not included / unavailable" section header of any kind.
    expect(md.toLowerCase()).not.toMatch(
      /not included|not available|unavailable/,
    )
    // Semantic rejection of ANY paraphrase of the two SIP checks + their required
    // fields + future-export language (not just metric ids / internal jargon).
    for (const re of SIP_FORBIDDEN) {
      expect(md).not.toMatch(re)
    }
  })

  it('leaks no control jargon, metric id, or Sales Rep name to the customer', () => {
    const md = buildCustomerReport(makeRun())
    for (const re of CUSTOMER_FORBIDDEN) expect(md).not.toMatch(re)
    expect(md).not.toMatch(/SW-0\d\d/)
    expect(md.toLowerCase()).not.toContain('sales rep ')
  })
})

describe.runIf(HAVE)('PKT-02-01 SIP semantic patterns (self-check)', () => {
  it('SIP_FORBIDDEN rejects paraphrases of the held checks and required fields', () => {
    const paraphrases = [
      'Did after-hours leads get a first reply within 15 minutes of the store opening?',
      'whether the first response came from a real person or a human agent',
      'was the first reply an automated message or auto-reply?',
      'these will be added to a future lead export once captured',
      'the report does not yet capture opening hours',
    ]
    for (const p of paraphrases) {
      expect(SIP_FORBIDDEN.some((re) => re.test(p))).toBe(true)
    }
    // must NOT reject legitimate measured-finding copy
    const measuredCopy =
      'Median first-response time during business hours is 6 min; 19.7% of ' +
      'business-hours leads had no tracked response; 50% of sales reps were slower.'
    expect(SIP_FORBIDDEN.some((re) => re.test(measuredCopy))).toBe(false)
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
    // the SIP checks + their exact missing fields live ONLY in the internal companion
    expect(md).toContain('authoritative_opening_schedule')
    expect(md).toContain('first_response_actor_classification')
    expect(md).toContain('first_human_response_timestamp')
    expect(md).toContain('human_touch_event_timestamps')
  })
})
