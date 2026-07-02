import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Regression suite for the P0 cross-tenant file read in /api/files (GET).
//
// Before the fix, the GET handler gated only on isAuthenticated and then served
// ?profile=<any> workspace files (and, with no profile, the global ~/.hermes
// root including profiles/<x>/auth.yaml password hashes) to ANY authenticated
// session. These tests prove a scoped session is denied cross-tenant access and
// that legitimately-authorized sessions still succeed.

let tmpHome: string
let prevHome: string | undefined
let prevWorkspaceDir: string | undefined

function mockSession(meta: Record<string, unknown> | null) {
  // files.ts imports isAuthenticated/isAdmin/requireLocalOrAuth from
  // auth-middleware; customer-auth (resolveSession/isAuthorizedForProfile)
  // imports isPasswordProtectionEnabled/getSessionTokenFromCookie/
  // getSessionMetadata from the same module. Mock all of them coherently.
  vi.doMock('@/server/auth-middleware', () => ({
    isPasswordProtectionEnabled: () => true,
    getSessionTokenFromCookie: () => (meta ? 'tok' : null),
    getSessionMetadata: () => meta,
    isAuthenticated: () => Boolean(meta),
    isAdmin: () => meta?.is_admin === true,
    requireLocalOrAuth: () => Boolean(meta),
  }))
}

async function handlers() {
  const { Route } = await import('@/routes/api/files')
  return Route.options.server.handlers
}

function getReq(query: string) {
  return {
    request: new Request(`http://localhost/api/files?${query}`, {
      headers: { cookie: 'hermes-auth=tok' },
    }),
  } as never
}

describe('/api/files GET — tenant isolation', () => {
  beforeEach(() => {
    vi.resetModules()
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'files-iso-'))
    prevHome = process.env.HOME
    prevWorkspaceDir = process.env.HERMES_WORKSPACE_DIR
    // getProfileWorkspaceRoot + files.ts WORKSPACE_ROOT both derive from
    // os.homedir() (HOME on POSIX) when HERMES_WORKSPACE_DIR is unset.
    process.env.HOME = tmpHome
    delete process.env.HERMES_WORKSPACE_DIR

    // Two tenants, each with a workspace file; plus a secret auth.yaml in the
    // victim profile to exercise the global-root exposure path.
    const profiles = path.join(tmpHome, '.hermes', 'profiles')
    fs.mkdirSync(path.join(profiles, 'serra-honda'), { recursive: true })
    fs.mkdirSync(path.join(profiles, 'serra-service'), { recursive: true })
    fs.writeFileSync(
      path.join(profiles, 'serra-honda', 'secret.txt'),
      'HONDA TENANT SECRET',
    )
    fs.writeFileSync(
      path.join(profiles, 'serra-honda', 'auth.yaml'),
      'password_hash: SCRYPT_SECRET_HASH\n',
    )
    fs.writeFileSync(
      path.join(profiles, 'serra-service', 'own.txt'),
      'service own file',
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('@/server/auth-middleware')
    vi.resetModules()
    if (prevHome === undefined) delete process.env.HOME
    else process.env.HOME = prevHome
    if (prevWorkspaceDir === undefined) delete process.env.HERMES_WORKSPACE_DIR
    else process.env.HERMES_WORKSPACE_DIR = prevWorkspaceDir
    fs.rmSync(tmpHome, { recursive: true, force: true })
  })

  it('denies a scoped partner reading another tenant profile file (403)', async () => {
    mockSession({
      username: 'durran@example.com',
      profile: 'serra-service',
      is_admin: false,
      is_customer_admin: false,
      scope_profiles: ['serra-service'],
    })
    const h = await handlers()
    const res = await h.GET(
      getReq('action=read&path=secret.txt&profile=serra-honda'),
    )
    expect(res.status).toBe(403)
    const text = await res.text()
    expect(text).not.toContain('HONDA TENANT SECRET')
  })

  it('denies a single-store customer-admin reading another store (403)', async () => {
    mockSession({
      username: 'admin@serra-service.com',
      profile: 'serra-service',
      is_admin: false,
      is_customer_admin: true,
    })
    const h = await handlers()
    const res = await h.GET(
      getReq('action=read&path=secret.txt&profile=serra-honda'),
    )
    expect(res.status).toBe(403)
  })

  it('denies a non-admin reading the global root (auth.yaml hashes) (403)', async () => {
    mockSession({
      username: 'durran@example.com',
      profile: 'serra-service',
      is_admin: false,
      is_customer_admin: false,
      scope_profiles: ['serra-service'],
    })
    const h = await handlers()
    // No profile param → global ~/.hermes root; crafted path reaches another
    // profile's auth.yaml.
    const res = await h.GET(
      getReq('action=read&path=profiles%2Fserra-honda%2Fauth.yaml'),
    )
    expect(res.status).toBe(403)
    const text = await res.text()
    expect(text).not.toContain('SCRYPT_SECRET_HASH')
  })

  it('scopes the glob (action=list) branch to the authorized profile, not the global root', async () => {
    mockSession({
      username: 'durran@example.com',
      profile: 'serra-service',
      is_admin: false,
      is_customer_admin: false,
      scope_profiles: ['serra-service'],
    })
    const h = await handlers()
    // Glob '*' must list the partner's OWN profile root, never the global
    // ~/.hermes (which contains `profiles/` and other tenants).
    const res = await h.GET(getReq('action=list&path=*&profile=serra-service'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { entries: Array<{ name: string }> }
    const names = body.entries.map((e) => e.name)
    expect(names).toContain('own.txt')
    expect(names).not.toContain('profiles')
  })

  it('blocks a scoped glob from escaping into another tenant directory', async () => {
    mockSession({
      username: 'durran@example.com',
      profile: 'serra-service',
      is_admin: false,
      is_customer_admin: false,
      scope_profiles: ['serra-service'],
    })
    const h = await handlers()
    // Path traversal toward another tenant resolves inside the partner's own
    // root (nonexistent) → never returns serra-honda's contents.
    const res = await h.GET(
      getReq('action=list&path=..%2Fserra-honda%2F*&profile=serra-service'),
    )
    const text = await res.text()
    expect(text).not.toContain('secret.txt')
    expect(text).not.toContain('HONDA TENANT SECRET')
  })

  it('allows a scoped partner to read their in-scope profile (200)', async () => {
    mockSession({
      username: 'durran@example.com',
      profile: 'serra-service',
      is_admin: false,
      is_customer_admin: false,
      scope_profiles: ['serra-service'],
    })
    const h = await handlers()
    const res = await h.GET(
      getReq('action=read&path=own.txt&profile=serra-service'),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { content: string }
    expect(body.content).toContain('service own file')
  })

  it('allows a super-admin to read any profile and the global root (200)', async () => {
    mockSession({
      username: 'duane.wells@huminic.ai',
      profile: 'huminic',
      is_admin: true,
      is_customer_admin: false,
    })
    const h = await handlers()
    const crossProfile = await h.GET(
      getReq('action=read&path=secret.txt&profile=serra-honda'),
    )
    expect(crossProfile.status).toBe(200)
    const body = (await crossProfile.json()) as { content: string }
    expect(body.content).toContain('HONDA TENANT SECRET')

    const globalRoot = await h.GET(getReq('action=list'))
    expect(globalRoot.status).toBe(200)
  })
})
