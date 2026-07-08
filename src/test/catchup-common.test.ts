import { describe, expect, it } from 'vitest'
import { isValidSmsE164, localMidnight } from '../server/catchup-common'

describe('isValidSmsE164 — NANP validity guard', () => {
  it('accepts valid +1 NANP mobile numbers', () => {
    for (const ok of ['+17313946907', '+12055550104', '+13347475359', '+19169699204']) {
      expect(isValidSmsE164(ok)).toBe(true)
    }
  })
  it('rejects 7-digit fragments and fused extensions', () => {
    expect(isValidSmsE164('+7313946')).toBe(false) // 7-digit fragment
    expect(isValidSmsE164('+73139469075')).toBe(false) // extension fused → looks intl
  })
  it('rejects leading-zero / invalid area or exchange first digit', () => {
    expect(isValidSmsE164('+10137204567')).toBe(false) // area code starts 0/1
    expect(isValidSmsE164('+12051234567')).toBe(false) // exchange starts 1
    expect(isValidSmsE164('+1017313946')).toBe(false)
  })
  it('rejects non-US numbers (US dealership scope)', () => {
    expect(isValidSmsE164('+447911123456')).toBe(false) // UK
  })
  it('rejects wrong total length', () => {
    expect(isValidSmsE164('+120555501040')).toBe(false) // 11 NANP digits
    expect(isValidSmsE164('+1205555010')).toBe(false) // 9 digits
  })
  it('does NOT (yet) catch a structurally-valid but unassigned area code', () => {
    // Documented limitation: 676 is unassigned but structurally valid → passes.
    expect(isValidSmsE164('+16767205676')).toBe(true)
  })
})

describe('localMidnight', () => {
  it('returns the CT midnight instant for a CDT afternoon', () => {
    const now = Date.parse('2026-07-08T19:00:00-05:00')
    expect(localMidnight('America/Chicago', now)).toBe(Date.parse('2026-07-08T00:00:00-05:00'))
  })
})
