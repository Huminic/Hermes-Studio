import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  readAppointments,
  readDealershipPerformance,
  readResponseTimes,
} from '../server/ingest-native-metrics'

/**
 * Integration test against the isolated analytical store on this harness.
 * Requires /srv/ingest-dev/analytics (skips cleanly if absent elsewhere).
 */
const ROOT = '/srv/ingest-dev/analytics'
import fs from 'node:fs'
const HAVE_DATA = fs.existsSync(`${ROOT}/serra-honda/brain/brain.db`)

describe.runIf(HAVE_DATA)('ingest-native-metrics (isolated store)', () => {
  const saved = process.env.BRAIN_PROFILES_ROOT
  beforeAll(() => {
    process.env.BRAIN_PROFILES_ROOT = ROOT
  })
  afterAll(() => {
    if (saved === undefined) delete process.env.BRAIN_PROFILES_ROOT
    else process.env.BRAIN_PROFILES_ROOT = saved
  })

  it('Honda dealership_performance: accepted TOTAL row parsed from embedded summary', () => {
    const r = readDealershipPerformance('serra-honda')
    expect(r.available).toBe(true)
    if (!r.available) return
    expect(r.summary.leads).toBe(96)
    expect(r.summary.apptsSet).toBe(18)
    expect(r.summary.apptsShow).toBe(12)
    expect(r.summary.totalVisits).toBe(31)
    expect(r.summary.visitsSold).toBe(3)
    expect(r.summary.soldInPeriod).toBe(5)
    expect(r.summary.frontGross).toBeCloseTo(3184.5, 2)
    expect(r.summary.backGross).toBeCloseTo(9056.28, 2)
    expect(r.summary.avgTotalGross).toBeCloseTo(2448.156, 2)
    // provenance preserved
    expect(r.provenance.reportKind).toBe('dealership_performance')
    expect(r.provenance.period.start).toBe('2026-08-17')
    expect(r.provenance.period.end).toBe('2026-08-23')
    expect(r.provenance.checksum).toBeTruthy()
    // per-lead-type breakdown present (New/Used/Unknown)
    expect(r.byLeadType.length).toBeGreaterThanOrEqual(3)
  })

  it('Honda appointments: header_json-driven, 18 accepted rows', () => {
    const r = readAppointments('serra-honda')
    expect(r.available).toBe(true)
    if (!r.available) return
    expect(r.total).toBe(18)
    expect(r.provenance.reportKind).toBe('appointments')
    // status buckets sum to total
    const sum = Object.values(r.byStatus).reduce((a, b) => a + b, 0)
    expect(sum).toBe(18)
  })

  it('Honda response-times: standalone accepted+reconciling readback, minutes', () => {
    const r = readResponseTimes('serra-honda')
    expect(r.available).toBe(true)
    if (!r.available) return
    expect(r.units).toBe('minutes')
    expect(r.coverage.reconciles).toBe(true)
    expect(r.period.start).toBe('2026-08-17')
    expect(r.period.end).toBe('2026-08-23')
    expect(r.metrics).toHaveProperty('leads_total')
    expect(r.provenance).toHaveProperty('profile', 'serra-honda')
  })

  it('Nissan dealership_performance: accepted and available', () => {
    const r = readDealershipPerformance('serra-nissan')
    expect(r.available).toBe(true)
    if (!r.available) return
    expect(typeof r.summary.leads === 'number' || r.summary.leads === null).toBe(true)
    expect(r.provenance.period.end).toBe('2026-08-23')
  })

  it('Ford: no accepted native families -> withheld, never zero', () => {
    const dp = readDealershipPerformance('tony-serra-ford')
    expect(dp.available).toBe(false)
    const ap = readAppointments('tony-serra-ford')
    expect(ap.available).toBe(false)
  })
})
