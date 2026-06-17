import { describe, it, expect } from 'vitest'
import {
  evaluateSmsConsent,
  fetchSmsConsent,
  type SmsConsentPolicy,
} from '@/server/vin-sms-consent'

const PHONE = '+14126546500'

/** A v3 ProviderContact-shaped record (as the broker returns, element [0]). */
function contact(over: {
  status?: string | null
  phoneOnPref?: string
  consent?: { express?: boolean; implied?: boolean } | null
  doNotMail?: boolean
  noPrefs?: boolean
}): Record<string, unknown> {
  const cc =
    over.consent === null
      ? null
      : {
          ExpressConsent: { HasGivenConsent: over.consent?.express ?? false },
          ImpliedConsent: { HasGivenConsent: over.consent?.implied ?? false },
        }
  return {
    ContactId: 1421162555,
    ContactInformation: { DoNotCall: false, DoNotMail: over.doNotMail ?? false },
    CustomerConsent: cc,
    SmsPreferences: over.noPrefs
      ? []
      : [{ PhoneNumber: over.phoneOnPref ?? PHONE, PhoneType: 'Cell', SubscriberStatus: over.status ?? 'Pending' }],
  }
}

const STRICT: SmsConsentPolicy = { optInStatuses: [], consentMode: 'either' } // fail-closed default

describe('evaluateSmsConsent — fail closed', () => {
  it('blocks when the contact is missing', () => {
    const d = evaluateSmsConsent(null, PHONE, STRICT)
    expect(d.allow).toBe(false)
    expect(d.audit.source).toBe('no-contact')
  })

  it('blocks when there is no SmsPreferences entry for the target phone', () => {
    const d = evaluateSmsConsent(contact({ noPrefs: true }), PHONE, STRICT)
    expect(d.allow).toBe(false)
    expect(d.audit.source).toBe('no-sms-pref')
  })

  it('blocks "Pending" + null consent with the default empty opt-in list (the live sample)', () => {
    const d = evaluateSmsConsent(contact({ status: 'Pending', consent: null }), PHONE, STRICT)
    expect(d.allow).toBe(false)
    expect(d.audit.source).toBe('subscriber-status')
    expect(d.audit.subscriberStatus).toBe('Pending')
  })

  it('blocks an opted-in status when CustomerConsent is null', () => {
    const policy: SmsConsentPolicy = { optInStatuses: ['Active'], consentMode: 'either' }
    const d = evaluateSmsConsent(contact({ status: 'Active', consent: null }), PHONE, policy)
    expect(d.allow).toBe(false)
    expect(d.audit.source).toBe('customer-consent')
  })

  it('blocks a different phone number even if some other number is opted in', () => {
    const policy: SmsConsentPolicy = { optInStatuses: ['Active'], consentMode: 'none' }
    const d = evaluateSmsConsent(
      contact({ status: 'Active', phoneOnPref: '+15555550000' }),
      PHONE,
      policy,
    )
    expect(d.allow).toBe(false)
    expect(d.audit.source).toBe('no-sms-pref')
  })
})

describe('evaluateSmsConsent — allow paths (only when configured)', () => {
  it('allows opted-in status + express consent (mode either)', () => {
    const policy: SmsConsentPolicy = { optInStatuses: ['Active'], consentMode: 'either' }
    const d = evaluateSmsConsent(contact({ status: 'Active', consent: { express: true } }), PHONE, policy)
    expect(d.allow).toBe(true)
    expect(d.audit.consent).toBe('express')
  })

  it('mode express blocks implied-only; mode implied allows it', () => {
    const c = contact({ status: 'Active', consent: { implied: true } })
    expect(evaluateSmsConsent(c, PHONE, { optInStatuses: ['Active'], consentMode: 'express' }).allow).toBe(false)
    expect(evaluateSmsConsent(c, PHONE, { optInStatuses: ['Active'], consentMode: 'implied' }).allow).toBe(true)
  })

  it('status matching is case-insensitive and phone-format tolerant', () => {
    const policy: SmsConsentPolicy = { optInStatuses: ['active'], consentMode: 'none' }
    const c = contact({ status: 'Active', phoneOnPref: '+1 (412) 654-6500' })
    expect(evaluateSmsConsent(c, PHONE, policy).allow).toBe(true)
  })

  it('blockOnDoNotMail blocks even an otherwise-valid contact', () => {
    const policy: SmsConsentPolicy = { optInStatuses: ['Active'], consentMode: 'none', blockOnDoNotMail: true }
    const d = evaluateSmsConsent(contact({ status: 'Active', doNotMail: true }), PHONE, policy)
    expect(d.allow).toBe(false)
    expect(d.audit.source).toBe('do-not-mail')
  })
})

describe('fetchSmsConsent — broker errors fail closed', () => {
  it('blocks when the broker call fails', async () => {
    const call = async () => ({ ok: false as const, error: 'timeout' })
    const d = await fetchSmsConsent({ orgId: 'org', contactId: '123', phone: PHONE, policy: STRICT, call })
    expect(d.allow).toBe(false)
    expect(d.audit.source).toBe('vin-error')
  })

  it('passes a NUMERIC contactId to the broker and evaluates the returned contact', async () => {
    let seenArgs: Record<string, unknown> = {}
    const call = async (_t: string, args: Record<string, unknown>) => {
      seenArgs = args
      return { ok: true as const, data: [contact({ status: 'Active', consent: { express: true } })] }
    }
    const d = await fetchSmsConsent({
      orgId: 'org',
      contactId: '1421162555',
      phone: PHONE,
      policy: { optInStatuses: ['Active'], consentMode: 'either' },
      call,
    })
    expect(seenArgs.contactId).toBe(1421162555) // number, not string
    expect(d.allow).toBe(true)
  })
})
