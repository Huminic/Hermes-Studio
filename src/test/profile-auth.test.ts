import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { hashPassword } from '@/server/password-hash'

let tmpHome: string

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-auth-test-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

async function seedAuth(
  profile: string,
  username: string,
  password: string,
  isAdmin: boolean,
  isCustomerAdmin = false,
): Promise<string> {
  const dir = path.join(tmpHome, '.hermes', 'profiles', profile)
  fs.mkdirSync(dir, { recursive: true })
  const hash = await hashPassword(password)
  const yaml = [
    `username: ${username}`,
    `password_hash: ${hash}`,
    `is_admin: ${isAdmin ? 'true' : 'false'}`,
    `is_customer_admin: ${isCustomerAdmin ? 'true' : 'false'}`,
    '',
  ].join('\n')
  fs.writeFileSync(path.join(dir, 'auth.yaml'), yaml)
  return hash
}

describe('listProfileAuthEntries', () => {
  it('returns empty when no profile has auth.yaml', async () => {
    fs.mkdirSync(path.join(tmpHome, '.hermes', 'profiles', 'huminic'), {
      recursive: true,
    })
    const { listProfileAuthEntries } = await import('@/server/profile-auth')
    expect(listProfileAuthEntries()).toEqual([])
  })

  it('discovers auth.yaml across multiple profiles', async () => {
    await seedAuth('huminic', 'duane', 'pw1', true)
    await seedAuth('strukture', 'kim', 'pw2', false)
    const { listProfileAuthEntries } = await import('@/server/profile-auth')
    const entries = listProfileAuthEntries()
    expect(entries).toHaveLength(2)
    const usernames = entries.map((e) => e.auth.username).sort()
    expect(usernames).toEqual(['duane', 'kim'])
  })

  it('skips malformed YAML and invalid schemas without crashing', async () => {
    fs.mkdirSync(path.join(tmpHome, '.hermes', 'profiles', 'broken'), {
      recursive: true,
    })
    fs.writeFileSync(
      path.join(tmpHome, '.hermes', 'profiles', 'broken', 'auth.yaml'),
      'username: nope\npassword_hash: not-a-real-hash\n',
    )
    await seedAuth('huminic', 'duane', 'pw1', true)
    const { listProfileAuthEntries } = await import('@/server/profile-auth')
    const entries = listProfileAuthEntries()
    expect(entries.map((e) => e.profile)).toEqual(['huminic'])
  })
})

describe('hasAnyProfileAuth', () => {
  it('returns false when nothing configured', async () => {
    const { hasAnyProfileAuth } = await import('@/server/profile-auth')
    expect(hasAnyProfileAuth()).toBe(false)
  })
  it('returns true once at least one profile has auth.yaml', async () => {
    await seedAuth('huminic', 'duane', 'pw1', true)
    const { hasAnyProfileAuth } = await import('@/server/profile-auth')
    expect(hasAnyProfileAuth()).toBe(true)
  })
})

describe('loginWithProfileCredentials', () => {
  it('reports no_users when no profile has auth.yaml', async () => {
    const { loginWithProfileCredentials } = await import('@/server/profile-auth')
    const result = await loginWithProfileCredentials('duane', 'pw1')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('no_users')
  })

  it('reports not_found when username is unknown', async () => {
    await seedAuth('huminic', 'duane', 'pw1', true)
    const { loginWithProfileCredentials } = await import('@/server/profile-auth')
    const result = await loginWithProfileCredentials('nobody', 'pw1')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('not_found')
  })

  it('reports bad_password when the wrong password is supplied', async () => {
    await seedAuth('huminic', 'duane', 'right', true)
    const { loginWithProfileCredentials } = await import('@/server/profile-auth')
    const result = await loginWithProfileCredentials('duane', 'wrong')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('bad_password')
  })

  it('returns the matched identity on a correct admin login', async () => {
    await seedAuth('huminic', 'duane', 'pw1', true)
    const { loginWithProfileCredentials } = await import('@/server/profile-auth')
    const result = await loginWithProfileCredentials('duane', 'pw1')
    expect(result).toEqual({
      ok: true,
      profile: 'huminic',
      username: 'duane',
      is_admin: true,
      is_customer_admin: false,
    })
  })

  it('returns is_admin=false for non-admin profile users', async () => {
    await seedAuth('strukture', 'kim', 'pw2', false)
    const { loginWithProfileCredentials } = await import('@/server/profile-auth')
    const result = await loginWithProfileCredentials('kim', 'pw2')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.profile).toBe('strukture')
      expect(result.is_admin).toBe(false)
      expect(result.is_customer_admin).toBe(false)
    }
  })

  it('returns is_customer_admin=true when the profile auth.yaml sets it', async () => {
    await seedAuth('huminic', 'carla', 'pw3', false, true)
    const { loginWithProfileCredentials } = await import('@/server/profile-auth')
    const result = await loginWithProfileCredentials('carla', 'pw3')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.profile).toBe('huminic')
      expect(result.is_admin).toBe(false)
      expect(result.is_customer_admin).toBe(true)
    }
  })

  it('returns both is_admin and is_customer_admin true when both set', async () => {
    await seedAuth('huminic', 'duane', 'pw4', true, true)
    const { loginWithProfileCredentials } = await import('@/server/profile-auth')
    const result = await loginWithProfileCredentials('duane', 'pw4')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.is_admin).toBe(true)
      expect(result.is_customer_admin).toBe(true)
    }
  })
})
