import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Scoped partner admin profile activation tests.
 * Ensure scoped partners can activate profiles in their scope but not others.
 */
afterEach(() => {
  vi.resetModules()
  vi.doUnmock('@/server/auth-middleware')
  vi.doUnmock('@/server/profile-auth')
  vi.doUnmock('@/server/profiles-browser')
})

describe('Scoped profile activation', () => {
  it('rejects unauthenticated request with 401', async () => {
    vi.doMock('@/server/auth-middleware', () => ({
      isAuthenticated: () => false,
      getSessionTokenFromCookie: () => null,
      getSessionMetadata: () => null,
    }))
    vi.doMock('@/server/profile-auth', () => ({
      hasAnyProfileAuth: () => true,
    }))
    vi.doMock('@/server/profiles-browser', () => ({
      setActiveProfile: vi.fn(),
    }))
    vi.doMock('@/server/rate-limit', () => ({
      requireJsonContentType: () => null,
    }))

    const { Route } = await import('@/routes/api/profiles/activate')
    const req = new Request('http://localhost/api/profiles/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test-profile' }),
    })
    const res = await Route.options.server.handlers.POST({ request: req } as never)
    expect(res.status).toBe(401)
  })

  it('allows super-admin to activate any profile', async () => {
    const setActiveProfileMock = vi.fn()
    vi.doMock('@/server/auth-middleware', () => ({
      isAuthenticated: () => true,
      getSessionTokenFromCookie: () => 'admin-token',
      getSessionMetadata: () => ({ is_admin: true }),
    }))
    vi.doMock('@/server/profile-auth', () => ({
      hasAnyProfileAuth: () => true,
    }))
    vi.doMock('@/server/profiles-browser', () => ({
      setActiveProfile: setActiveProfileMock,
    }))
    vi.doMock('@/server/rate-limit', () => ({
      requireJsonContentType: () => null,
    }))

    const { Route } = await import('@/routes/api/profiles/activate')
    const req = new Request('http://localhost/api/profiles/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'any-profile' }),
    })
    const res = await Route.options.server.handlers.POST({ request: req } as never)
    expect(res.status).toBe(200)
    expect(setActiveProfileMock).toHaveBeenCalledWith('any-profile')
  })

  it('allows scoped partner to activate profile in scope (200)', async () => {
    const setActiveProfileMock = vi.fn()
    vi.doMock('@/server/auth-middleware', () => ({
      isAuthenticated: () => true,
      getSessionTokenFromCookie: () => 'partner-token',
      getSessionMetadata: () => ({
        is_admin: false,
        scope_profiles: ['profile-a', 'profile-b'],
      }),
    }))
    vi.doMock('@/server/profile-auth', () => ({
      hasAnyProfileAuth: () => true,
    }))
    vi.doMock('@/server/profiles-browser', () => ({
      setActiveProfile: setActiveProfileMock,
    }))
    vi.doMock('@/server/rate-limit', () => ({
      requireJsonContentType: () => null,
    }))

    const { Route } = await import('@/routes/api/profiles/activate')
    const req = new Request('http://localhost/api/profiles/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'profile-a' }),
    })
    const res = await Route.options.server.handlers.POST({ request: req } as never)
    expect(res.status).toBe(200)
    expect(setActiveProfileMock).toHaveBeenCalledWith('profile-a')
  })

  it('rejects scoped partner activation of out-of-scope profile (403)', async () => {
    vi.doMock('@/server/auth-middleware', () => ({
      isAuthenticated: () => true,
      getSessionTokenFromCookie: () => 'partner-token',
      getSessionMetadata: () => ({
        is_admin: false,
        scope_profiles: ['profile-a', 'profile-b'],
      }),
    }))
    vi.doMock('@/server/profile-auth', () => ({
      hasAnyProfileAuth: () => true,
    }))
    vi.doMock('@/server/profiles-browser', () => ({
      setActiveProfile: vi.fn(),
    }))
    vi.doMock('@/server/rate-limit', () => ({
      requireJsonContentType: () => null,
    }))

    const { Route } = await import('@/routes/api/profiles/activate')
    const req = new Request('http://localhost/api/profiles/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'profile-c' }),
    })
    const res = await Route.options.server.handlers.POST({ request: req } as never)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toContain('not in your scope')
  })

  it('rejects single-store customer-admin activation (403)', async () => {
    vi.doMock('@/server/auth-middleware', () => ({
      isAuthenticated: () => true,
      getSessionTokenFromCookie: () => 'customer-token',
      getSessionMetadata: () => ({
        is_admin: false,
        is_customer_admin: true,
        profile: 'store-a',
      }),
    }))
    vi.doMock('@/server/profile-auth', () => ({
      hasAnyProfileAuth: () => true,
    }))
    vi.doMock('@/server/profiles-browser', () => ({
      setActiveProfile: vi.fn(),
    }))
    vi.doMock('@/server/rate-limit', () => ({
      requireJsonContentType: () => null,
    }))

    const { Route } = await import('@/routes/api/profiles/activate')
    const req = new Request('http://localhost/api/profiles/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'store-b' }),
    })
    const res = await Route.options.server.handlers.POST({ request: req } as never)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toContain('admin role')
  })
})
