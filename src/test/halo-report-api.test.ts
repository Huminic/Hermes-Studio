import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * /api/customer/halo-report — read-only, auth-gated, Sales-domain fail-closed.
 * Mocks auth + the assembler (the real assembler is covered by halo-report-card.test.ts);
 * isHaloSalesProfile stays real so the Sales-domain gate is genuinely exercised.
 */
function mockDeps(opts: { authorized: boolean }) {
  vi.doMock('@/server/customer-auth', () => ({
    resolveSession: () => ({ authenticated: true, is_admin: true }),
    isAuthorizedForProfile: () => opts.authorized,
  }))
  vi.doMock('@/server/reports/halo-report-card', () => ({
    // echo the window it received so normalization is observable
    buildHaloReportCard: vi.fn((profile: string, windowDays: number) => ({
      profile, sales_only: true, window_days: windowDays, narrative_mode: 'deterministic_grounded',
      cards: [], coverage: { total: 19, current_value: 0, no_current_data: 0, withheld: 0 }, limitations: [], narrative: '',
    })),
    normalizeHaloWindowDays: (raw: unknown) => ([7, 30, 90] as number[]).includes(Number(raw)) ? Number(raw) : 30,
  }))
}

async function call(profile?: string, windowDays?: string) {
  const { Route } = await import('@/routes/api/customer/halo-report')
  const params = new URLSearchParams()
  if (profile !== undefined) params.set('profile', profile)
  if (windowDays !== undefined) params.set('window_days', windowDays)
  const qs = params.toString()
  return Route.options.server.handlers.GET({
    request: new Request(`http://localhost/api/customer/halo-report${qs ? '?' + qs : ''}`, {
      headers: { cookie: 'hermes-auth=tok' },
    }),
  } as never) as Promise<Response>
}

describe('/api/customer/halo-report', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => { vi.restoreAllMocks(); vi.resetModules() })

  it('400 when profile is missing', async () => {
    mockDeps({ authorized: true })
    expect((await call(undefined)).status).toBe(400)
  })

  it('403 when the session is not authorized for the profile', async () => {
    mockDeps({ authorized: false })
    expect((await call('serra-honda')).status).toBe(403)
  })

  it('400 (Sales-domain) for a service / unknown / traversal-like profile even when authorized', async () => {
    mockDeps({ authorized: true })
    for (const bad of ['serra-service', 'unknown-store', 'serra-honda/../serra-service']) {
      const res = await call(bad)
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error?: string }
      expect(body.error).toMatch(/governed Sales profiles/i)
    }
  })

  it('200 for a governed Sales profile; narrative_mode is deterministic_grounded', async () => {
    mockDeps({ authorized: true })
    const res = await call('serra-honda')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; report: { sales_only: boolean; narrative_mode: string } }
    expect(body.ok).toBe(true)
    expect(body.report.sales_only).toBe(true)
    expect(body.report.narrative_mode).toBe('deterministic_grounded')
  })

  it('normalizes window_days (invalid → 30; valid 7/90 preserved)', async () => {
    mockDeps({ authorized: true })
    const win = async (v?: string) => ((await (await call('serra-honda', v)).json()) as { report: { window_days: number } }).report.window_days
    expect(await win('-5')).toBe(30)
    expect(await win('0')).toBe(30)
    expect(await win('99999')).toBe(30)
    expect(await win('abc')).toBe(30)
    expect(await win('7')).toBe(7)
    expect(await win('90')).toBe(90)
  })
})
