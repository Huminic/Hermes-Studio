import { describe, expect, it } from 'vitest'
import {
  firstPhoneInText,
  extractName,
  extractContactFromHistory,
} from '@/server/chat-contact-extract'

describe('firstPhoneInText', () => {
  it('extracts a dashed US number and canonicalizes to E.164', () => {
    // The exact shape from the live P0 thread 6f9264ca.
    expect(firstPhoneInText('678-492-1396')).toBe('+16784921396')
  })
  it('extracts a number embedded in a sentence', () => {
    expect(firstPhoneInText('you can reach me at (205) 777-2044 anytime')).toBe(
      '+12057772044',
    )
  })
  it('handles dots and a leading +1 / 1', () => {
    expect(firstPhoneInText('call 731.394.6907')).toBe('+17313946907')
    expect(firstPhoneInText('+1 731 394 6907')).toBe('+17313946907')
    expect(firstPhoneInText('1-731-394-6907')).toBe('+17313946907')
  })
  it('returns null when there is no phone', () => {
    expect(firstPhoneInText('How much down?')).toBeNull()
    expect(firstPhoneInText('Yes')).toBeNull()
    expect(firstPhoneInText('')).toBeNull()
  })
  it('does not misread a longer digit run (VIN / order number) as a phone', () => {
    expect(firstPhoneInText('my VIN is 1HGCM82633A004352')).toBeNull()
    expect(firstPhoneInText('order 12345678901234')).toBeNull()
  })
  it('rejects an invalid NANP area code (leading 0/1)', () => {
    expect(firstPhoneInText('123-456-7890')).toBeNull()
    expect(firstPhoneInText('012-345-6789')).toBeNull()
  })
})

describe('extractName', () => {
  it('detects an explicit self-introduction and title-cases it', () => {
    expect(extractName('my name is sybil swindle')).toBe('Sybil Swindle')
    expect(extractName("I'm Pat Buyer")).toBe('Pat Buyer')
    expect(extractName('This is Jordan')).toBe('Jordan')
    expect(extractName('name: Alex Chen')).toBe('Alex Chen')
  })
  it('does not treat a non-name continuation as a name', () => {
    expect(extractName("I'm looking for a truck")).toBeNull()
    expect(extractName('I am interested in the Accord')).toBeNull()
  })
  it('returns null with no name cue', () => {
    expect(extractName('678-492-1396')).toBeNull()
    expect(extractName('How much down?')).toBeNull()
  })
})

describe('extractContactFromHistory', () => {
  it('captures the phone from the visitor turn, ignoring the assistant echo', () => {
    // Mirrors the live P0 conversation shape: the assistant quotes the number
    // back — extraction must credit the VISITOR turn, not the assistant.
    const history = [
      { role: 'user', content: 'How much down?' },
      {
        role: 'assistant',
        content: "I can't quote that; can a rep reach you?",
      },
      { role: 'user', content: 'Yes' },
      { role: 'assistant', content: 'Great — what is the best number?' },
      { role: 'user', content: '678-492-1396' },
      {
        role: 'assistant',
        content: 'Thanks! A team member will reach you at 678-492-1396.',
      },
    ]
    expect(extractContactFromHistory(history)).toEqual({
      phone: '+16784921396',
      name: null,
    })
  })
  it('captures both phone and name across turns', () => {
    const history = [
      { role: 'user', content: 'my name is Sybil Swindle' },
      { role: 'assistant', content: 'Hi Sybil!' },
      { role: 'user', content: 'reach me at 205-777-2044' },
    ]
    expect(extractContactFromHistory(history)).toEqual({
      phone: '+12057772044',
      name: 'Sybil Swindle',
    })
  })
  it('returns nulls for a fully anonymous conversation', () => {
    const history = [
      { role: 'user', content: 'Do you have any trucks?' },
      { role: 'assistant', content: 'Yes, several!' },
    ]
    expect(extractContactFromHistory(history)).toEqual({
      phone: null,
      name: null,
    })
  })
})
