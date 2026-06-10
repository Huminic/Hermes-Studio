import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isAuthorizedForProfile } from '@/server/customer-auth'

/**
 * Scoped-partner Teambox / messaging data visibility (partner sprint 2026-06-10).
 *
 * Every messaging endpoint gates on isAuthorizedForProfile(resolveSession, profile).
 * These tests lock the matrix so a scoped partner can read its in-scope stores'
 * Teambox, is denied out-of-scope, a single-store login can't read another store,
 * and super-admin is unaffected.
 */

// ── Part 1: the shared authorization gate (used by ALL messaging endpoints) ──
describe('isAuthorizedForProfile — scoped partner gate', () => {
  const superAdmin = { username: null, profile: null, is_admin: true, is_customer_admin: false }
  const partner = {
    username: 'durran',
    profile: 'cage-automotive',
    is_admin: false,
    is_customer_admin: false,
    scope_profiles: ['serra-honda', 'serra-nissan'],
  }
  const store = {
    username: 'sh',
    profile: 'serra-honda',
    is_admin: false,
    is_customer_admin: true,
  }

  it('super-admin is authorized for any profile', () => {
    expect(isAuthorizedForProfile(superAdmin, 'serra-honda')).toBe(true)
    expect(isAuthorizedForProfile(superAdmin, 'ford-of-columbia')).toBe(true)
  })
  it('scoped partner is authorized for in-scope profiles only', () => {
    expect(isAuthorizedForProfile(partner, 'serra-honda')).toBe(true)
    expect(isAuthorizedForProfile(partner, 'serra-nissan')).toBe(true)
    expect(isAuthorizedForProfile(partner, 'ford-of-columbia')).toBe(false)
  })
  it('single-store Workspace login is authorized for its own store only', () => {
    expect(isAuthorizedForProfile(store, 'serra-honda')).toBe(true)
    expect(isAuthorizedForProfile(store, 'serra-nissan')).toBe(false)
  })
  it('no session is denied', () => {
    expect(isAuthorizedForProfile(null, 'serra-honda')).toBe(false)
  })
})

// ── Part 2: the real /api/messaging/threads endpoint honors the same matrix ──
let tmpHome: string

function mockSession(meta: Record<string, unknown> | null) {
  vi.doMock('@/server/auth-middleware', () => ({
    isPasswordProtectionEnabled: () => true,
    getSessionTokenFromCookie: () => (meta ? 'tok' : null),
    getSessionMetadata: () => meta,
  }))
}

async function getThreads(profile: string) {
  const { Route } = await import('@/routes/api/messaging/threads')
  const req = new Request(
    `http://localhost/api/messaging/threads?profile=${profile}&domain=sales&limit=100`,
    { headers: { cookie: 'hermes-auth=tok' } },
  )
  return Route.options.server.handlers.GET({ request: req } as never)
}

describe('/api/messaging/threads — scoped partner Teambox visibility', () => {
  beforeEach(async () => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'partner-teambox-'))
    vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
    const store = await import('@/server/messaging-hub-store')
    store._resetForTests()
    // Seed one Sales thread under store-a.
    const t = store.getOrCreateThread({
      profile: 'store-a',
      domain: 'sales',
      channel: 'voice',
      contact_handle: '+15559010337',
      subject: 'Phone call · Launch Cert Voice Proof',
    })
    store.appendMessage({
      thread_id: t.id,
      direction: 'inbound',
      role: 'user',
      channel: 'voice',
      content: 'Launch Cert Voice Proof',
      author: '+15559010337',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    vi.doUnmock('@/server/auth-middleware')
    fs.rmSync(tmpHome, { recursive: true, force: true })
  })

  it('scoped partner READS its in-scope store Teambox', async () => {
    mockSession({ is_admin: false, is_customer_admin: false, scope_profiles: ['store-a', 'store-b'] })
    const res = await getThreads('store-a')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.threads.length).toBe(1)
  })

  it('scoped partner is DENIED an out-of-scope store (403)', async () => {
    mockSession({ is_admin: false, is_customer_admin: false, scope_profiles: ['store-b'] })
    const res = await getThreads('store-a')
    expect(res.status).toBe(403)
  })

  it('single-store Workspace login CANNOT read another store (403)', async () => {
    mockSession({ is_admin: false, is_customer_admin: true, profile: 'store-b' })
    const res = await getThreads('store-a')
    expect(res.status).toBe(403)
  })

  it('super-admin reads any store Teambox', async () => {
    mockSession({ is_admin: true })
    const res = await getThreads('store-a')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.threads.length).toBe(1)
  })
})
