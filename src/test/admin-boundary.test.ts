import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * LC-BLOCKER-006 — Global Huminic Studio routes/APIs require is_admin or
 * scoped partner access. A Workspace (customer-admin, non-admin) session must
 * be rejected. /api/profiles/list is the confirmed leak; it represents the
 * ~58 global operator APIs flipped from isAuthenticated → isAdmin + scoped.
 */
afterEach(() => {
  vi.resetModules()
  vi.doUnmock('@/server/auth-middleware')
  vi.doUnmock('@/server/profiles-browser')
})

describe('Global Studio admin boundary', () => {
  it('rejects unauthenticated request with 401', async () => {
    vi.doMock('@/server/auth-middleware', () => ({
      isAuthenticated: () => false,
      isAdmin: () => false,
      getSessionTokenFromCookie: () => null,
      getSessionMetadata: () => null,
    }))
    const { Route } = await import('@/routes/api/profiles/list')
    const res = await Route.options.server.handlers.GET({
      request: new Request('http://localhost/api/profiles/list'),
    } as never)
    expect(res.status).toBe(401)
  })

  it('rejects a non-admin single-store Workspace session with 403', async () => {
    vi.doMock('@/server/auth-middleware', () => ({
      isAuthenticated: () => true,
      isAdmin: () => false,
      getSessionTokenFromCookie: () => 'workspace-token',
      getSessionMetadata: () => ({
        is_admin: false,
        is_customer_admin: true,
        profile: 'test-store',
      }),
    }))
    const { Route } = await import('@/routes/api/profiles/list')
    const res = await Route.options.server.handlers.GET({
      request: new Request('http://localhost/api/profiles/list'),
    } as never)
    expect(res.status).toBe(403)
  })

  it('allows super-admin and returns all profiles', async () => {
    vi.doMock('@/server/auth-middleware', () => ({
      isAuthenticated: () => true,
      isAdmin: () => true,
      getSessionTokenFromCookie: () => 'admin-token',
      getSessionMetadata: () => ({ is_admin: true }),
    }))
    vi.doMock('@/server/profiles-browser', () => ({
      listProfiles: () => [
        { name: 'profile-a' },
        { name: 'profile-b' },
        { name: 'profile-c' },
      ],
      getActiveProfileName: () => 'profile-a',
    }))
    const { Route } = await import('@/routes/api/profiles/list')
    const res = await Route.options.server.handlers.GET({
      request: new Request('http://localhost/api/profiles/list'),
    } as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.profiles).toHaveLength(3)
    expect(body.profiles.map((p: { name: string }) => p.name)).toEqual([
      'profile-a',
      'profile-b',
      'profile-c',
    ])
  })

  it('allows scoped partner admin and filters profiles to scope', async () => {
    vi.doMock('@/server/auth-middleware', () => ({
      isAuthenticated: () => true,
      isAdmin: () => false,
      getSessionTokenFromCookie: () => 'partner-token',
      getSessionMetadata: () => ({
        is_admin: false,
        is_customer_admin: false,
        scope_profiles: ['profile-a', 'profile-c'],
      }),
    }))
    vi.doMock('@/server/profiles-browser', () => ({
      listProfiles: () => [
        { name: 'profile-a' },
        { name: 'profile-b' },
        { name: 'profile-c' },
        { name: 'profile-d' },
      ],
      getActiveProfileName: () => 'profile-b',
    }))
    const { Route } = await import('@/routes/api/profiles/list')
    const res = await Route.options.server.handlers.GET({
      request: new Request('http://localhost/api/profiles/list'),
    } as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    // Should only see the 2 profiles in scope, not all 4
    expect(body.profiles).toHaveLength(2)
    expect(body.profiles.map((p: { name: string }) => p.name)).toEqual([
      'profile-a',
      'profile-c',
    ])
    // activeProfile is profile-b which is NOT in scope, so should be undefined
    expect(body.activeProfile).toBeUndefined()
  })

  it('scoped partner admin with active profile in scope returns that activeProfile', async () => {
    vi.doMock('@/server/auth-middleware', () => ({
      isAuthenticated: () => true,
      isAdmin: () => false,
      getSessionTokenFromCookie: () => 'partner-token',
      getSessionMetadata: () => ({
        is_admin: false,
        is_customer_admin: false,
        scope_profiles: ['profile-a', 'profile-c'],
      }),
    }))
    vi.doMock('@/server/profiles-browser', () => ({
      listProfiles: () => [
        { name: 'profile-a' },
        { name: 'profile-b' },
        { name: 'profile-c' },
      ],
      getActiveProfileName: () => 'profile-a',
    }))
    const { Route } = await import('@/routes/api/profiles/list')
    const res = await Route.options.server.handlers.GET({
      request: new Request('http://localhost/api/profiles/list'),
    } as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.profiles).toHaveLength(2)
    expect(body.activeProfile).toBe('profile-a')
  })
})
