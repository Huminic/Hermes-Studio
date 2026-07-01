import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Regression for the model-label fix (Phase 1B): /api/models must surface the
// REAL configured model (gpt-4.1) as the primary entry, not the gateway's
// frozen active-profile-at-boot name (e.g. "serra-honda" from /v1/models).

function mockDeps(opts: {
  configured: { id: string; provider: string } | null
  gatewayModels: Array<Record<string, unknown>>
}) {
  vi.doMock('@/server/auth-middleware', () => ({
    isAdmin: () => true,
  }))
  vi.doMock('@/server/hermes-api', () => ({
    ensureGatewayProbed: async () => {},
    getGatewayCapabilities: () => ({ models: true }),
  }))
  vi.doMock('@/server/gateway-capabilities', () => ({ BEARER_TOKEN: '' }))
  vi.doMock('@/server/profiles-browser', () => ({
    getConfiguredDefaultModel: () => opts.configured,
  }))
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify({ object: 'list', data: opts.gatewayModels }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  )
}

async function getModels() {
  const { Route } = await import('@/routes/api/models')
  const res = await Route.options.server.handlers.GET({
    request: new Request('http://localhost/api/models', {
      headers: { cookie: 'hermes-auth=tok' },
    }),
  } as never)
  return (await res.json()) as {
    ok: boolean
    data: Array<{ id: string; name: string; provider?: string }>
  }
}

describe('/api/models — truthful model label', () => {
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('surfaces the configured model (gpt-4.1) as the primary entry', async () => {
    mockDeps({
      configured: { id: 'gpt-4.1', provider: 'custom' },
      gatewayModels: [{ id: 'serra-honda', object: 'model', owned_by: 'hermes' }],
    })
    const body = await getModels()
    expect(body.ok).toBe(true)
    expect(body.data[0]).toMatchObject({ id: 'gpt-4.1', provider: 'custom' })
    // The gateway's profile-name entry is still present, just not the label.
    expect(body.data.map((m) => m.id)).toContain('serra-honda')
  })

  it('does not duplicate when configured model already in gateway list', async () => {
    mockDeps({
      configured: { id: 'gpt-4.1', provider: 'custom' },
      gatewayModels: [{ id: 'gpt-4.1', object: 'model', owned_by: 'hermes' }],
    })
    const body = await getModels()
    expect(body.data.filter((m) => m.id === 'gpt-4.1')).toHaveLength(1)
    expect(body.data[0].id).toBe('gpt-4.1')
  })

  it('falls back to gateway models when no configured model', async () => {
    mockDeps({
      configured: null,
      gatewayModels: [{ id: 'serra-honda', object: 'model', owned_by: 'hermes' }],
    })
    const body = await getModels()
    expect(body.data[0].id).toBe('serra-honda')
  })
})
