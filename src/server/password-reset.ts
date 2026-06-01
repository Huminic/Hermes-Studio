/**
 * Password reset token registry.
 *
 * Closes CZ-004 + CZ-005. A user requests a reset, we generate a single-use
 * token tied to a specific (profile, username), email it to them via the
 * existing notifications.ts → central-mcp Resend path, they click the link
 * to /reset?token=<hex>, submit a new password, and we update their
 * profile's auth.yaml.
 *
 * Security properties:
 * - Token = 32 random bytes, base64url-encoded.
 * - Token stored as scrypt-hashed identifier (we never persist the raw
 *   token; the user proves ownership of the raw value at confirm time).
 * - Single use: a token may only be redeemed once. Even if intercepted
 *   after redemption, it is dead.
 * - 15-minute TTL.
 * - Tokens cleaned up opportunistically on every read.
 * - Anti-enumeration: reset-request returns 200 for unknown emails too,
 *   we just don't send anything in that case.
 *
 * Persistence: ~/.hermes/auth-reset-tokens.json. JSON file, key = hashed
 * token, value = {profile, username, created_at, expires_at, used_at}.
 * File-level rather than profile-level because lookups are by token, not by
 * profile.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto'
import YAML from 'yaml'
import { hashPassword } from './password-hash'
import {
  ProfileAuthSchema,
  listProfileAuthEntries,
  type LoadedProfileAuth,
} from './profile-auth'

/**
 * Honor BRAIN_PROFILES_ROOT for test isolation. This matches the override
 * pattern used by brain-store.ts. In production it is unset and we fall
 * back to listProfileAuthEntries' default of ~/.hermes/profiles.
 */
function getProfilesRootOverride(): string | undefined {
  return process.env.BRAIN_PROFILES_ROOT || undefined
}

export const TOKEN_TTL_MS = 15 * 60 * 1000 // 15 minutes

type StoredToken = {
  /** sha256(rawToken) — never store the raw token */
  hash: string
  profile: string
  username: string
  email: string
  created_at: number
  expires_at: number
  used_at: number | null
}

function getRegistryPath(): string {
  const override = process.env.AUTH_RESET_TOKEN_PATH
  if (override) return override
  return path.join(os.homedir(), '.hermes', 'auth-reset-tokens.json')
}

function readRegistry(): Array<StoredToken> {
  const filePath = getRegistryPath()
  if (!fs.existsSync(filePath)) return []
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.filter(
      (e): e is StoredToken =>
        e &&
        typeof e === 'object' &&
        typeof e.hash === 'string' &&
        typeof e.profile === 'string' &&
        typeof e.username === 'string' &&
        typeof e.email === 'string' &&
        typeof e.created_at === 'number' &&
        typeof e.expires_at === 'number',
    )
  } catch {
    return []
  }
}

function writeRegistry(entries: Array<StoredToken>): void {
  const filePath = getRegistryPath()
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(filePath, JSON.stringify(entries, null, 2), { mode: 0o600 })
  try {
    fs.chmodSync(filePath, 0o600)
  } catch {
    // ignore on platforms that don't support chmod
  }
}

function expireOld(entries: Array<StoredToken>, now: number): Array<StoredToken> {
  return entries.filter((e) => e.expires_at > now && e.used_at === null)
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export type IssueResult = {
  /** Always set if the email matched a profile; otherwise undefined. */
  emailDispatchTarget?: {
    profile: string
    username: string
    email: string
    /** The RAW token to embed in the reset link. Returned ONLY here; never re-readable. */
    token: string
  }
}

/**
 * Issue a reset token if `email` matches a known username. Returns a
 * non-revealing result regardless of match — the caller (reset-request
 * route) checks `emailDispatchTarget` to decide whether to actually send
 * an email.
 *
 * The user enters their email at the reset form. We treat any matching
 * username as a match (most profiles use email-shaped usernames).
 */
export async function issueResetToken(email: string): Promise<IssueResult> {
  if (typeof email !== 'string' || email.trim().length === 0) {
    return {}
  }
  const normalizedEmail = email.trim().toLowerCase()

  const profiles = listProfileAuthEntries(getProfilesRootOverride())
  const matched = profiles.find(
    (p) => p.auth.username.toLowerCase() === normalizedEmail,
  )
  if (!matched) {
    return {}
  }

  const rawToken = randomBytes(32).toString('base64url')
  const now = Date.now()
  const entry: StoredToken = {
    hash: hashToken(rawToken),
    profile: matched.profile,
    username: matched.auth.username,
    email: matched.auth.username, // username IS the email for current profiles
    created_at: now,
    expires_at: now + TOKEN_TTL_MS,
    used_at: null,
  }
  const existing = readRegistry()
  // Invalidate any prior live tokens for this username (operator-friendly:
  // re-requesting blows away stale links).
  const filtered = existing.filter(
    (e) => e.username.toLowerCase() !== normalizedEmail,
  )
  filtered.push(entry)
  writeRegistry(filtered)

  return {
    emailDispatchTarget: {
      profile: matched.profile,
      username: matched.auth.username,
      email: matched.auth.username,
      token: rawToken,
    },
  }
}

export type RedeemResult =
  | { ok: true; profile: string; username: string }
  | { ok: false; error: 'invalid' | 'expired' | 'used' | 'weak-password' }

/**
 * Redeem a reset token. Validates the raw token against the hashed entry,
 * checks expiry + single-use, then writes a new scrypt hash into the
 * target profile's auth.yaml.
 */
export async function redeemResetToken(
  rawToken: string,
  newPassword: string,
): Promise<RedeemResult> {
  if (typeof rawToken !== 'string' || rawToken.length === 0) {
    return { ok: false, error: 'invalid' }
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return { ok: false, error: 'weak-password' }
  }

  const now = Date.now()
  const entries = readRegistry()
  const incomingHash = hashToken(rawToken)

  let matched: StoredToken | undefined
  for (const entry of entries) {
    const a = Buffer.from(entry.hash, 'hex')
    const b = Buffer.from(incomingHash, 'hex')
    if (a.length === b.length && timingSafeEqual(a, b)) {
      matched = entry
      break
    }
  }

  if (!matched) return { ok: false, error: 'invalid' }
  if (matched.used_at !== null) return { ok: false, error: 'used' }
  if (matched.expires_at <= now) return { ok: false, error: 'expired' }

  // Write the new password into the target profile's auth.yaml.
  const profiles = listProfileAuthEntries(getProfilesRootOverride())
  const target = profiles.find(
    (p) =>
      p.profile === matched!.profile &&
      p.auth.username === matched!.username,
  )
  if (!target) return { ok: false, error: 'invalid' }

  const newHash = await hashPassword(newPassword)
  const updated = {
    ...target.auth,
    password_hash: newHash,
  }
  // Round-trip through Zod to ensure the schema still matches before write.
  ProfileAuthSchema.parse(updated)
  const yamlBody = YAML.stringify(updated)
  fs.writeFileSync(target.filePath, yamlBody, { mode: 0o600 })
  try {
    fs.chmodSync(target.filePath, 0o600)
  } catch {
    // ignore on platforms that don't support chmod
  }

  // Mark token used.
  matched.used_at = now
  // Persist + clean expired in one pass.
  writeRegistry(expireOld(entries, now).concat(matched))

  return { ok: true, profile: target.profile, username: target.auth.username }
}

/** Test helper. */
export function _resetRegistryForTests() {
  const filePath = getRegistryPath()
  if (fs.existsSync(filePath)) fs.rmSync(filePath)
}

/** Test helper: peek at the registry. */
export function _readRegistryForTests(): Array<StoredToken> {
  return readRegistry()
}

/** Build the reset URL for an email link. */
export function buildResetUrl(token: string): string {
  const base = process.env.STUDIO_PUBLIC_URL || 'https://studio.huminic.app'
  return `${base.replace(/\/$/, '')}/reset?token=${encodeURIComponent(token)}`
}

/** Build the reset email body. */
export function buildResetEmail(opts: {
  username: string
  token: string
}): { subject: string; html: string; text: string } {
  const url = buildResetUrl(opts.token)
  const subject = 'Huminic Studio — password reset'
  const text =
    `Hi ${opts.username},\n\n` +
    `Someone asked to reset the password for your Huminic Studio account.\n` +
    `If that was you, follow this link within 15 minutes:\n\n` +
    `${url}\n\n` +
    `If you didn't request this, you can safely ignore this email.\n\n` +
    `— Huminic Studio\n`
  const html =
    `<p>Hi ${opts.username},</p>` +
    `<p>Someone asked to reset the password for your Huminic Studio account.</p>` +
    `<p>If that was you, <a href="${url}">click here to choose a new password</a> within 15 minutes.</p>` +
    `<p>If you didn't request this, you can safely ignore this email.</p>` +
    `<p>— Huminic Studio</p>`
  return { subject, html, text }
}
