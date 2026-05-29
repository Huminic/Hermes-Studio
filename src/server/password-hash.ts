/**
 * Password hashing using Node's built-in scrypt.
 *
 * Hash format: `scrypt$<N>$<r>$<p>$<saltHex>$<derivedKeyHex>`
 *  - N, r, p: scrypt cost parameters
 *  - salt: 16 random bytes
 *  - derived key: 64 bytes
 *
 * Used by profile-auth.ts to verify credentials stored in
 * ~/.hermes/profiles/<profile>/auth.yaml.
 */

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)

const COST_N = 16384
const COST_R = 8
const COST_P = 1
const SALT_BYTES = 16
const KEY_BYTES = 64

export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('password must be a non-empty string')
  }
  const salt = randomBytes(SALT_BYTES)
  const key = (await scryptAsync(password, salt, KEY_BYTES, {
    N: COST_N,
    r: COST_R,
    p: COST_P,
  })) as Buffer
  return [
    'scrypt',
    COST_N,
    COST_R,
    COST_P,
    salt.toString('hex'),
    key.toString('hex'),
  ].join('$')
}

export async function verifyPasswordHash(
  password: string,
  hashString: string,
): Promise<boolean> {
  if (typeof password !== 'string' || typeof hashString !== 'string') {
    return false
  }
  const parts = hashString.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const n = parseInt(parts[1], 10)
  const r = parseInt(parts[2], 10)
  const p = parseInt(parts[3], 10)
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false
  }
  let salt: Buffer
  let stored: Buffer
  try {
    salt = Buffer.from(parts[4], 'hex')
    stored = Buffer.from(parts[5], 'hex')
  } catch {
    return false
  }
  if (salt.length !== SALT_BYTES || stored.length === 0) return false

  let derived: Buffer
  try {
    derived = (await scryptAsync(password, salt, stored.length, {
      N: n,
      r,
      p,
    })) as Buffer
  } catch {
    return false
  }
  if (derived.length !== stored.length) return false
  return timingSafeEqual(derived, stored)
}

export function isHashString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^scrypt\$\d+\$\d+\$\d+\$[0-9a-f]+\$[0-9a-f]+$/.test(value)
  )
}
