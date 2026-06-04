import { describe, expect, it } from 'vitest'
import { parseContactCsv } from '@/server/contact-csv'

describe('parseContactCsv', () => {
  it('parses standard headers and builds channel identifiers', () => {
    const csv = [
      'first_name,last_name,phone,email',
      'Ada,Lovelace,(555) 123-4567,ada@example.com',
      'Alan,Turing,,alan@example.com',
    ].join('\n')
    const r = parseContactCsv(csv)
    expect(r.contacts).toHaveLength(2)
    expect(r.skipped).toHaveLength(0)
    expect(r.contacts[0]).toEqual({
      display_name: 'Ada Lovelace',
      identifiers: { email: 'ada@example.com', sms: '5551234567', phone: '5551234567' },
    })
    // No phone → only email identifier.
    expect(r.contacts[1].identifiers).toEqual({ email: 'alan@example.com' })
  })

  it('tolerates header variants and column order', () => {
    const csv = [
      'Email Address,Mobile,Full Name',
      'grace@example.com,+1 555 000 1111,Grace Hopper',
    ].join('\n')
    const r = parseContactCsv(csv)
    expect(r.matchedColumns.email).toBe(0)
    expect(r.matchedColumns.phone).toBe(1)
    expect(r.matchedColumns.name).toBe(2)
    expect(r.contacts[0]).toEqual({
      display_name: 'Grace Hopper',
      identifiers: {
        email: 'grace@example.com',
        sms: '+15550001111',
        phone: '+15550001111',
      },
    })
  })

  it('skips rows with no phone or email and reports them', () => {
    const csv = [
      'name,phone,email',
      'No Contact,,',
      'Bad Email,,not-an-email',
      'Good,5551112222,',
    ].join('\n')
    const r = parseContactCsv(csv)
    expect(r.contacts).toHaveLength(1)
    expect(r.contacts[0].display_name).toBe('Good')
    expect(r.skipped).toHaveLength(2)
    expect(r.skipped[0]).toEqual({ row: 1, reason: 'missing phone/email' })
    expect(r.skipped[1]).toEqual({ row: 2, reason: 'invalid email and no phone' })
  })

  it('handles quoted fields and a BOM', () => {
    const csv = '﻿first,last,email\n"Doe, Jr.","Smith","jd@example.com"'
    const r = parseContactCsv(csv)
    expect(r.contacts).toHaveLength(1)
    expect(r.contacts[0].display_name).toBe('Doe, Jr. Smith')
    expect(r.contacts[0].identifiers.email).toBe('jd@example.com')
  })

  it('returns empty result for empty input', () => {
    expect(parseContactCsv('').contacts).toHaveLength(0)
    expect(parseContactCsv('\n\n').contacts).toHaveLength(0)
  })
})
