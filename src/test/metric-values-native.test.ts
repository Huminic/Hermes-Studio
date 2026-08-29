// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Gap #1 — accepted native families → contract-supported catalog slugs.
 *
 * SUPPORTED (derived here):
 *   - gross.total_sum        ← dealership_performance TOTAL (provenance-backed)
 *   - appt.show_rate         ← appointments show / total
 *   - appt.no_show_rate      ← appointments noShow / total
 *   - appt.confirmed_rate    ← appointments confirmed / total
 *   - appt.cancel_rate       ← appointments cancelled / total
 *   All four appt.* rates share the SAME appointments family + denominator (total>0),
 *   0..1 convention; withheld when the denominator is 0 or the family is unavailable.
 *
 * WITHHELD BY CONTRACT (must NOT appear):
 *   - roi.total_leads / roi.sold_from_leads — Dashboard vs Lead Source ROI definitions
 *     diverge (semantic defect to map from dealership_performance).
 *   - gross.reconciliation_mismatches, cage.*, comm.* — no governed native source.
 *
 * Derivation is tested against a MOCKED accepted reader (deterministic, no /srv).
 */
vi.mock('@/server/ingest-native-metrics', () => ({
  readDealershipPerformance: vi.fn(),
  readAppointments: vi.fn(),
}))

import { readAppointments, readDealershipPerformance } from '@/server/ingest-native-metrics'
import { resolveNativeMetricValues } from '@/server/watchdog/metric-values'

const dp = vi.mocked(readDealershipPerformance)
const ap = vi.mocked(readAppointments)

const DP = (summary: Record<string, number | null>) =>
  ({
    available: true, source: 'dealership_performance', provenance: { reportKind: 'dealership_performance' },
    byInventoryType: [],
    summary: {
      leads: null, apptsSet: null, apptsShow: null, totalVisits: null, visitsSold: null,
      soldInPeriod: null, frontGross: null, backGross: null, totalGross: null, avgTotalGross: null,
      ...summary,
    },
  }) as never
const DP_NA = { available: false, reason: 'withheld' } as never
const AP = (o: { total: number; show?: number; noShow?: number; confirmed?: number; cancelled?: number }) =>
  ({
    available: true, source: 'appointments', provenance: { reportKind: 'appointments' },
    total: o.total, completed: 0, confirmed: o.confirmed ?? 0, show: o.show ?? 0,
    noShow: o.noShow ?? 0, cancelled: o.cancelled ?? 0, rescheduled: 0, byStatus: {},
  }) as never
const AP_NA = { available: false, reason: 'withheld' } as never

const ROI_SLUGS = ['roi.total_leads', 'roi.sold_from_leads']

describe('resolveNativeMetricValues — corrected metric contract (missing-not-zero)', () => {
  beforeEach(() => {
    dp.mockReset()
    ap.mockReset()
  })

  it('Honda-like: gross from DP + all four appt.* rates from the appointments family', () => {
    dp.mockReturnValue(DP({ leads: 96, soldInPeriod: 5, totalGross: 12240.78, apptsSet: 18, apptsShow: 12 }))
    ap.mockReturnValue(AP({ total: 18, show: 12, noShow: 4, confirmed: 6, cancelled: 2 }))
    const v = resolveNativeMetricValues('serra-honda')

    expect(v.get('gross.total_sum')).toBeCloseTo(12240.78, 2)
    expect(v.get('appt.show_rate')).toBeCloseTo(12 / 18, 6)
    expect(v.get('appt.no_show_rate')).toBeCloseTo(4 / 18, 6)
    expect(v.get('appt.confirmed_rate')).toBeCloseTo(6 / 18, 6)
    expect(v.get('appt.cancel_rate')).toBeCloseTo(2 / 18, 6)

    // ROI slugs are WITHHELD by contract even with full dealership_performance.
    for (const s of ROI_SLUGS) expect(v.has(s)).toBe(false)
  })

  it('never maps ROI lead/sold slugs from dealership_performance (definition divergence)', () => {
    dp.mockReturnValue(DP({ leads: 89, soldInPeriod: 8, totalGross: 1000 }))
    ap.mockReturnValue(AP_NA)
    const v = resolveNativeMetricValues('serra-honda')
    for (const s of ROI_SLUGS) {
      expect(v.has(s)).toBe(false)
      expect(v.get(s)).toBeUndefined()
    }
    expect(v.get('gross.total_sum')).toBe(1000) // gross still supported
  })

  it('Nissan-like: dealership_performance present, appointments withheld → gross only, all appt.* absent', () => {
    dp.mockReturnValue(DP({ leads: 55, soldInPeriod: 9, totalGross: 5263.6 }))
    ap.mockReturnValue(AP_NA)
    const v = resolveNativeMetricValues('serra-nissan')
    expect(v.get('gross.total_sum')).toBeCloseTo(5263.6, 2)
    for (const s of ['appt.show_rate', 'appt.no_show_rate', 'appt.confirmed_rate', 'appt.cancel_rate']) {
      expect(v.has(s)).toBe(false)
    }
  })

  it('Ford-like: both families unavailable → map empty (all withheld, never 0)', () => {
    dp.mockReturnValue(DP_NA)
    ap.mockReturnValue(AP_NA)
    const v = resolveNativeMetricValues('tony-serra-ford')
    expect(v.size).toBe(0)
  })

  it('withholds gross.total_sum when totalGross is null (partial gross)', () => {
    dp.mockReturnValue(DP({ leads: 5, totalGross: null }))
    ap.mockReturnValue(AP({ total: 4, show: 1 }))
    const v = resolveNativeMetricValues('x')
    expect(v.has('gross.total_sum')).toBe(false)
    expect(v.get('appt.show_rate')).toBeCloseTo(1 / 4, 6) // appt still resolves independently
  })

  it('withholds all four appt.* rates when appointments total is 0 (no denominator)', () => {
    dp.mockReturnValue(DP({ totalGross: 100 }))
    ap.mockReturnValue(AP({ total: 0 }))
    const v = resolveNativeMetricValues('x')
    for (const s of ['appt.show_rate', 'appt.no_show_rate', 'appt.confirmed_rate', 'appt.cancel_rate']) {
      expect(v.has(s)).toBe(false)
    }
    expect(v.get('gross.total_sum')).toBe(100)
  })
})
