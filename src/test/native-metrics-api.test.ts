import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * /api/customer/native-metrics must: 400 on missing profile, 403 when the
 * session is not authorized for the profile, and otherwise pass the reader's
 * per-family results through verbatim — each labeled by source, absent families
 * kept as { available:false } (never zero), RT never blended into DP.
 */

function mockDeps(opts: { authorized: boolean }) {
  vi.doMock('@/server/customer-auth', () => ({
    resolveSession: () => ({ authenticated: true, is_admin: true }),
    isAuthorizedForProfile: () => opts.authorized,
  }))
  vi.doMock('@/server/ingest-native-metrics', () => ({
    readDealershipPerformance: () => ({
      available: true,
      source: 'dealership_performance',
      provenance: {
        deliveryId: 'd1',
        checksum: 'chk',
        parserVersion: null,
        period: { start: '2026-08-17', end: '2026-08-23' },
        acceptedRows: 40,
        reportKind: 'dealership_performance',
      },
      summary: {
        leads: 96,
        apptsSet: 18,
        apptsShow: 12,
        totalVisits: 31,
        visitsSold: 3,
        soldInPeriod: 5,
        frontGross: 3184.5,
        backGross: 9056.28,
        avgTotalGross: 2448.156,
      },
      byInventoryType: [{ label: 'New', leads: 54, soldInPeriod: 3 }],
    }),
    // withheld — must survive as available:false, not become 0
    readAppointments: () => ({ available: false, reason: 'no accepted appointments delivery' }),
    readResponseTimes: () => ({
      available: true,
      source: 'response_times_readback',
      units: 'minutes',
      period: { start: '2026-08-17', end: '2026-08-23' },
      coverage: { reconciles: true },
      metrics: { response_time_actual_avg_min: 12.3 },
      provenance: {},
    }),
  }))
}

async function call(profile?: string) {
  const { Route } = await import('@/routes/api/customer/native-metrics')
  const qs = profile === undefined ? '' : `?profile=${encodeURIComponent(profile)}`
  return Route.options.server.handlers.GET({
    request: new Request(`http://localhost/api/customer/native-metrics${qs}`, {
      headers: { cookie: 'hermes-auth=tok' },
    }),
  } as never) as Promise<Response>
}

describe('/api/customer/native-metrics', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('400 when profile is missing', async () => {
    mockDeps({ authorized: true })
    const res = await call(undefined)
    expect(res.status).toBe(400)
  })

  it('403 when the session is not authorized for the profile', async () => {
    mockDeps({ authorized: false })
    const res = await call('serra-honda')
    expect(res.status).toBe(403)
  })

  it('200 passes each labeled family through; RT separate from DP', async () => {
    mockDeps({ authorized: true })
    const res = await call('serra-honda')
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.ok).toBe(true)
    expect(body.dealershipPerformance.available).toBe(true)
    expect(body.dealershipPerformance.summary.leads).toBe(96)
    // appointments withheld — not fabricated as 0
    expect(body.appointments.available).toBe(false)
    expect(body.appointments).not.toHaveProperty('total')
    // response times are their own top-level family (never merged into DP)
    expect(body.responseTimes.available).toBe(true)
    expect(body.responseTimes.units).toBe('minutes')
    expect(body.dealershipPerformance.summary).not.toHaveProperty(
      'response_time_actual_avg_min',
    )
  })
})
