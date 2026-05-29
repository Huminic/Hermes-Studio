import { describe, it, expect } from 'vitest'
import {
  hashPassword,
  verifyPasswordHash,
  isHashString,
} from '@/server/password-hash'

describe('hashPassword', () => {
  it('produces a hash in the documented format', async () => {
    const hash = await hashPassword('correct-horse')
    expect(hash).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[0-9a-f]+\$[0-9a-f]+$/)
  })

  it('produces a different hash each call for the same password (salt randomness)', async () => {
    const a = await hashPassword('s3cret')
    const b = await hashPassword('s3cret')
    expect(a).not.toBe(b)
  })

  it('rejects empty passwords', async () => {
    await expect(hashPassword('')).rejects.toThrow()
  })
})

describe('verifyPasswordHash', () => {
  it('verifies the correct password', async () => {
    const hash = await hashPassword('right-password')
    expect(await verifyPasswordHash('right-password', hash)).toBe(true)
  })

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('right-password')
    expect(await verifyPasswordHash('wrong-password', hash)).toBe(false)
  })

  it('rejects garbage hash strings', async () => {
    expect(await verifyPasswordHash('any', 'not-a-hash')).toBe(false)
    expect(await verifyPasswordHash('any', '')).toBe(false)
    expect(
      await verifyPasswordHash(
        'any',
        'scrypt$16384$8$1$nothex$nothexeither',
      ),
    ).toBe(false)
  })

  it('rejects a tampered hash (changed key bytes)', async () => {
    const hash = await hashPassword('original')
    const parts = hash.split('$')
    parts[5] = parts[5].replace(/.$/, (c) => (c === 'a' ? 'b' : 'a'))
    const tampered = parts.join('$')
    expect(await verifyPasswordHash('original', tampered)).toBe(false)
  })
})

describe('isHashString', () => {
  it('accepts a valid scrypt hash string', async () => {
    const hash = await hashPassword('x')
    expect(isHashString(hash)).toBe(true)
  })

  it('rejects non-strings and malformed strings', () => {
    expect(isHashString(null)).toBe(false)
    expect(isHashString(123)).toBe(false)
    expect(isHashString('scrypt$noN$8$1$ab$cd')).toBe(false)
    expect(isHashString('argon2$...')).toBe(false)
  })
})
