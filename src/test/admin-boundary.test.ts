import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * LC-BLOCKER-006 — Global Huminic Studio routes/APIs require is_admin. A
 * Workspace (customer-admin, non-admin) session must be rejected, not merely
 * authenticated. /api/profiles/list is the confirmed leak; it represents the
 * ~58 global operator APIs flipped from isAuthenticated → isAdmin.
 */
afterEach(() => {
  vi.resetModules()
  vi.doUnmock('@/server/auth-middleware')
})

describe('Global Studio admin boundary', () => {
  it('rejects a non-admin (Workspace) session with 401', async () => {
    vi.doMock('@/server/auth-middleware', () => ({ isAdmin: () => false }))
    const { Route } = await import('@/routes/api/profiles/list')
    const res = await Route.options.server.handlers.GET({
      request: new Request('http://localhost/api/profiles/list'),
    } as never)
    expect(res.status).toBe(401)
  })

  it('lets an admin session through the gate (not 401)', async () => {
    vi.doMock('@/server/auth-middleware', () => ({ isAdmin: () => true }))
    const { Route } = await import('@/routes/api/profiles/list')
    const res = await Route.options.server.handlers.GET({
      request: new Request('http://localhost/api/profiles/list'),
    } as never)
    // Gate passed — handler proceeds (200 with the list, or 500 from fs in CI),
    // but never the 401 auth rejection.
    expect(res.status).not.toBe(401)
  })
})
