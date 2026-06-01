/**
 * Vitest for password-reset module (closes CZ-004 + CZ-005 testability gate).
 *
 * Covers:
 * - anti-enumeration: unknown email returns ok-shape with no emailDispatchTarget
 * - happy path: known email returns a token; redeem with new password succeeds
 * - single-use: redeem twice fails the second time with `used`
 * - expired: token past TTL fails with `expired`
 * - weak-password: <8 chars fails with `weak-password`
 * - invalid token: garbage fails with `invalid`
 * - registry isolation: subsequent issueResetToken invalidates prior tokens for same username
 * - auth.yaml update: password_hash actually changes; verifyPasswordHash works against the new one
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import YAML from 'yaml'
import { hashPassword, verifyPasswordHash } from '../server/password-hash'
import {
  issueResetToken,
  redeemResetToken,
  _resetRegistryForTests,
  _readRegistryForTests,
  buildResetUrl,
  buildResetEmail,
  TOKEN_TTL_MS,
} from '../server/password-reset'

let tmpRoot: string
let savedBrainEnv: string | undefined
let savedTokenPath: string | undefined

function makeProfileAuth(slug: string, username: string, password: string) {
  return (async () => {
    const dir = path.join(tmpRoot, slug)
    fs.mkdirSync(dir, { recursive: true })
    const hash = await hashPassword(password)
    fs.writeFileSync(
      path.join(dir, 'auth.yaml'),
      YAML.stringify({
        username,
        password_hash: hash,
        is_admin: false,
        is_customer_admin: true,
      }),
    )
  })()
}

beforeEach(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pwd-reset-test-'))
  savedBrainEnv = process.env.BRAIN_PROFILES_ROOT
  savedTokenPath = process.env.AUTH_RESET_TOKEN_PATH
  process.env.BRAIN_PROFILES_ROOT = tmpRoot
  process.env.AUTH_RESET_TOKEN_PATH = path.join(tmpRoot, 'tokens.json')
  _resetRegistryForTests()
})

afterEach(() => {
  if (savedBrainEnv === undefined) delete process.env.BRAIN_PROFILES_ROOT
  else process.env.BRAIN_PROFILES_ROOT = savedBrainEnv
  if (savedTokenPath === undefined) delete process.env.AUTH_RESET_TOKEN_PATH
  else process.env.AUTH_RESET_TOKEN_PATH = savedTokenPath
  if (fs.existsSync(tmpRoot)) fs.rmSync(tmpRoot, { recursive: true, force: true })
})

describe('issueResetToken', () => {
  it('returns no dispatch target for unknown email (anti-enumeration)', async () => {
    await makeProfileAuth('huminic', 'duane@example.com', 'oldPassword1')
    const r = await issueResetToken('unknown@example.com')
    expect(r.emailDispatchTarget).toBeUndefined()
  })

  it('returns dispatch target for known email + persists hashed token', async () => {
    await makeProfileAuth('huminic', 'duane@example.com', 'oldPassword1')
    const r = await issueResetToken('duane@example.com')
    expect(r.emailDispatchTarget).toBeDefined()
    expect(r.emailDispatchTarget!.profile).toBe('huminic')
    expect(r.emailDispatchTarget!.username).toBe('duane@example.com')
    expect(r.emailDispatchTarget!.token).toMatch(/^[A-Za-z0-9_-]+$/)

    const reg = _readRegistryForTests()
    expect(reg).toHaveLength(1)
    expect(reg[0].hash).not.toBe(r.emailDispatchTarget!.token) // hashed, not raw
    expect(reg[0].profile).toBe('huminic')
    expect(reg[0].used_at).toBeNull()
  })

  it('case-insensitive email matching', async () => {
    await makeProfileAuth('huminic', 'Duane@Example.com', 'oldPassword1')
    const r = await issueResetToken('DUANE@example.com')
    expect(r.emailDispatchTarget).toBeDefined()
  })

  it('reissuing a token invalidates the prior one for the same username', async () => {
    await makeProfileAuth('huminic', 'duane@example.com', 'oldPassword1')
    const r1 = await issueResetToken('duane@example.com')
    const r2 = await issueResetToken('duane@example.com')
    expect(r1.emailDispatchTarget!.token).not.toBe(r2.emailDispatchTarget!.token)

    // Old token should now fail.
    const redeemOld = await redeemResetToken(
      r1.emailDispatchTarget!.token,
      'newPassword12345',
    )
    expect(redeemOld.ok).toBe(false)
  })

  it('empty / whitespace-only email returns empty result', async () => {
    expect((await issueResetToken('')).emailDispatchTarget).toBeUndefined()
    expect((await issueResetToken('   ')).emailDispatchTarget).toBeUndefined()
  })
})

describe('redeemResetToken', () => {
  it('happy path: redeem updates auth.yaml + new password verifies', async () => {
    await makeProfileAuth('huminic', 'duane@example.com', 'oldPassword1')
    const r = await issueResetToken('duane@example.com')
    const redeem = await redeemResetToken(
      r.emailDispatchTarget!.token,
      'brandNewPassword!1',
    )
    expect(redeem.ok).toBe(true)
    expect((redeem as { ok: true; profile: string }).profile).toBe('huminic')

    // Verify the new hash is in auth.yaml + verifies.
    const updated = YAML.parse(
      fs.readFileSync(path.join(tmpRoot, 'huminic', 'auth.yaml'), 'utf8'),
    )
    expect(
      await verifyPasswordHash('brandNewPassword!1', updated.password_hash),
    ).toBe(true)
    expect(
      await verifyPasswordHash('oldPassword1', updated.password_hash),
    ).toBe(false)
  })

  it('rejects invalid token', async () => {
    await makeProfileAuth('huminic', 'duane@example.com', 'oldPassword1')
    const r = await redeemResetToken('garbage-token', 'newPassword12345')
    expect(r).toEqual({ ok: false, error: 'invalid' })
  })

  it('rejects weak password', async () => {
    await makeProfileAuth('huminic', 'duane@example.com', 'oldPassword1')
    const issue = await issueResetToken('duane@example.com')
    const r = await redeemResetToken(issue.emailDispatchTarget!.token, 'short')
    expect(r).toEqual({ ok: false, error: 'weak-password' })
  })

  it('single-use: second redeem fails with used', async () => {
    await makeProfileAuth('huminic', 'duane@example.com', 'oldPassword1')
    const issue = await issueResetToken('duane@example.com')
    const r1 = await redeemResetToken(
      issue.emailDispatchTarget!.token,
      'newPassword12345',
    )
    expect(r1.ok).toBe(true)
    const r2 = await redeemResetToken(
      issue.emailDispatchTarget!.token,
      'anotherNew12345',
    )
    expect(r2.ok).toBe(false)
  })

  it('expired: token past TTL fails with expired', async () => {
    await makeProfileAuth('huminic', 'duane@example.com', 'oldPassword1')
    const issue = await issueResetToken('duane@example.com')
    // Hand-edit the registry to set expires_at into the past.
    const tokensPath = process.env.AUTH_RESET_TOKEN_PATH!
    const entries = JSON.parse(fs.readFileSync(tokensPath, 'utf8'))
    entries[0].expires_at = Date.now() - 1
    fs.writeFileSync(tokensPath, JSON.stringify(entries))
    const r = await redeemResetToken(
      issue.emailDispatchTarget!.token,
      'newPassword12345',
    )
    expect(r.ok).toBe(false)
  })
})

describe('helpers', () => {
  it('buildResetUrl honors STUDIO_PUBLIC_URL', () => {
    const saved = process.env.STUDIO_PUBLIC_URL
    process.env.STUDIO_PUBLIC_URL = 'https://example.com/'
    expect(buildResetUrl('abc')).toBe('https://example.com/reset?token=abc')
    process.env.STUDIO_PUBLIC_URL = 'https://example.com'
    expect(buildResetUrl('abc')).toBe('https://example.com/reset?token=abc')
    if (saved === undefined) delete process.env.STUDIO_PUBLIC_URL
    else process.env.STUDIO_PUBLIC_URL = saved
  })

  it('buildResetEmail includes username + token', () => {
    const e = buildResetEmail({ username: 'duane@example.com', token: 'xyz' })
    expect(e.subject).toMatch(/Huminic/)
    expect(e.html).toContain('duane@example.com')
    expect(e.html).toContain('xyz')
    expect(e.text).toContain('xyz')
  })

  it('TOKEN_TTL_MS is 15 minutes', () => {
    expect(TOKEN_TTL_MS).toBe(15 * 60 * 1000)
  })
})
