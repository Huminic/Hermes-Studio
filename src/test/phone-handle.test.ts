import { describe, expect, it } from 'vitest'
import { toE164, canonicalizeContactHandle } from '@/server/phone-handle'

describe('toE164', () => {
  it('adds + to an 11-digit US number with country code (TextMagic inbound shape)', () => {
    expect(toE164('17313946907')).toBe('+17313946907')
  })
  it('adds +1 to a bare 10-digit US number', () => {
    expect(toE164('7313946907')).toBe('+17313946907')
  })
  it('keeps an already-E.164 number unchanged', () => {
    expect(toE164('+17313946907')).toBe('+17313946907')
  })
  it('strips formatting (spaces, parens, dashes)', () => {
    expect(toE164('+1 (731) 394-6907')).toBe('+17313946907')
    expect(toE164('1-731-394-6907')).toBe('+17313946907')
  })
  it('returns null for empty / non-phone input', () => {
    expect(toE164('')).toBeNull()
    expect(toE164('   ')).toBeNull()
    expect(toE164(null as unknown as string)).toBeNull()
  })
})

describe('canonicalizeContactHandle', () => {
  it('canonicalizes phone channels to E.164', () => {
    expect(canonicalizeContactHandle('sms', '17313946907')).toBe('+17313946907')
    expect(canonicalizeContactHandle('voice', '7313946907')).toBe('+17313946907')
    expect(canonicalizeContactHandle('textmagic', '17313946907')).toBe('+17313946907')
  })
  it('leaves non-phone channels (email/chat/video) untouched', () => {
    expect(canonicalizeContactHandle('email', 'lead@example.com')).toBe('lead@example.com')
    expect(canonicalizeContactHandle('chat', 'duane')).toBe('duane')
    expect(canonicalizeContactHandle('video', 'video-abc123')).toBe('video-abc123')
  })
  it('passes through a phone value it cannot parse rather than dropping it', () => {
    expect(canonicalizeContactHandle('sms', 'unknown')).toBe('unknown')
  })
})
