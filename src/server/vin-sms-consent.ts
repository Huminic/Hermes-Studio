/**
 * VinSolutions SMS consent / DNC gate (safety-critical — FAIL CLOSED).
 *
 * Per the operator brief: VinSolutions has NO downloadable DNC list — consent is
 * FIELD VALUES on the contact record. Before any proactive SMS we read the
 * recipient's contact (broker `vin_get_contact`, which returns the v3
 * ProviderContact incl. `SmsPreferences[]` and `CustomerConsent`) and send ONLY
 * when, for the TARGET phone, BOTH hold:
 *   1. an SmsPreferences entry for that number has an affirmative SubscriberStatus
 *      (the affirmative value(s) are operator-CONFIGURED, never hardcoded — only
 *      "Pending" has been observed live and that means do-NOT-send), AND
 *   2. CustomerConsent satisfies the configured policy (Express/Implied/either).
 *
 * `DoNotCall` alone is the VOICE channel — it does NOT gate SMS by itself.
 *
 * EVERYTHING fails closed: missing contact, no SmsPreferences entry for the
 * number, non-affirmative/blank status, null consent, lookup error, or ambiguous
 * data → BLOCK. The TextMagic opt-out (local blacklist) is honored separately in
 * CommGate; a "VIN says OK" must never override a TextMagic STOP.
 */

import { callCentralMcpTool, type CentralMcpResult } from './central-mcp'

export type ConsentMode = 'express' | 'implied' | 'either' | 'none'

export type SmsConsentPolicy = {
  /**
   * SubscriberStatus values (case-insensitive) that count as opted-in. EMPTY =>
   * block everyone (the fail-closed default until the operator confirms the
   * affirmative value against VinSolutions — Part 4 of the brief).
   */
  optInStatuses: Array<string>
  /**
   * Which CustomerConsent qualifies. 'express' | 'implied' | 'either' require a
   * matching affirmative consent; 'none' does not require consent (NOT for
   * warranty/recall). Default 'either'.
   */
  consentMode?: ConsentMode
  /** Also block when ContactInformation.DoNotMail is true (policy). Default false. */
  blockOnDoNotMail?: boolean
}

export type SmsConsentDecision = {
  allow: boolean
  reason: string
  audit: {
    contactId: string | number | null
    phone: string
    subscriberStatus: string | null
    consent: 'express' | 'implied' | 'none' | 'unknown'
    decision: 'allow' | 'block'
    source: string
  }
}

/** Digits-only normalisation for phone comparison (tolerates +, spaces, parens). */
function digits(p: unknown): string {
  return typeof p === 'string' ? p.replace(/\D/g, '') : ''
}

function block(
  reason: string,
  source: string,
  contactId: string | number | null,
  phone: string,
  subscriberStatus: string | null,
  consent: SmsConsentDecision['audit']['consent'],
): SmsConsentDecision {
  return {
    allow: false,
    reason,
    audit: { contactId, phone, subscriberStatus, consent, decision: 'block', source },
  }
}

/** Read a boolean-ish HasGivenConsent off an ImpliedConsent/ExpressConsent node. */
function hasConsent(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false
  const v = (node as Record<string, unknown>).HasGivenConsent
  return v === true || v === 1 || (typeof v === 'string' && /^(true|yes|y|1)$/i.test(v.trim()))
}

/**
 * Pure evaluation of one contact record against the policy for a target phone.
 * `contact` is the v3 ProviderContact object (array element [0] already unwrapped).
 * Any missing/ambiguous input → BLOCK. No I/O.
 */
export function evaluateSmsConsent(
  contact: unknown,
  targetPhone: string,
  policy: SmsConsentPolicy,
): SmsConsentDecision {
  const phone = targetPhone
  const want = digits(targetPhone)
  const mode: ConsentMode = policy.consentMode ?? 'either'

  if (!contact || typeof contact !== 'object') {
    return block('contact not found', 'no-contact', null, phone, null, 'unknown')
  }
  const c = contact as Record<string, unknown>
  const contactId = (c.ContactId ?? c.contactId ?? null) as string | number | null

  // 1) SmsPreferences entry for the TARGET phone.
  const prefs = Array.isArray(c.SmsPreferences) ? (c.SmsPreferences as Array<Record<string, unknown>>) : []
  // When a target phone is given, match it; if no number on the entries matches,
  // there is no SMS subscription for this number → block. (A blank target with a
  // single entry is tolerated for callers that pre-resolved the number.)
  const entry = want
    ? prefs.find((e) => digits(e.PhoneNumber ?? e.phoneNumber) === want)
    : prefs.length === 1
      ? prefs[0]
      : undefined
  if (!entry) {
    return block(
      'no SmsPreferences entry for the target phone',
      'no-sms-pref',
      contactId,
      phone,
      null,
      'unknown',
    )
  }
  const status = (entry.SubscriberStatus ?? entry.subscriberStatus ?? null) as string | null

  // 2) Affirmative subscriber status (operator-configured; empty => block-all).
  const optIn = policy.optInStatuses.map((s) => s.trim().toLowerCase()).filter(Boolean)
  const statusOk = !!status && optIn.includes(status.trim().toLowerCase())
  if (!statusOk) {
    return block(
      optIn.length === 0
        ? `SubscriberStatus "${status ?? 'blank'}" blocked — no opt-in status configured (fail-closed)`
        : `SubscriberStatus "${status ?? 'blank'}" is not an opted-in value`,
      'subscriber-status',
      contactId,
      phone,
      status,
      'unknown',
    )
  }

  // 3) CustomerConsent per policy.
  const cc = c.CustomerConsent as Record<string, unknown> | null | undefined
  const express = hasConsent(cc?.ExpressConsent)
  const implied = hasConsent(cc?.ImpliedConsent)
  const consentLabel: SmsConsentDecision['audit']['consent'] = express
    ? 'express'
    : implied
      ? 'implied'
      : 'none'
  if (mode !== 'none') {
    const consentOk =
      mode === 'express' ? express : mode === 'implied' ? implied : express || implied
    if (!consentOk) {
      return block(
        cc == null
          ? 'CustomerConsent is null (no consent on record)'
          : `CustomerConsent does not satisfy policy "${mode}"`,
        'customer-consent',
        contactId,
        phone,
        status,
        consentLabel,
      )
    }
  }

  // 4) Optional DoNotMail policy block.
  const ci = (c.ContactInformation ?? {}) as Record<string, unknown>
  if (policy.blockOnDoNotMail && ci.DoNotMail === true) {
    return block('ContactInformation.DoNotMail is true (policy)', 'do-not-mail', contactId, phone, status, consentLabel)
  }

  return {
    allow: true,
    reason: 'opted-in status + consent satisfied',
    audit: { contactId, phone, subscriberStatus: status, consent: consentLabel, decision: 'allow', source: 'ok' },
  }
}

type CallFn = (
  tool: string,
  args: Record<string, unknown>,
  opts?: { timeoutMs?: number },
) => Promise<CentralMcpResult>

/**
 * Fetch the contact via the broker (numeric contactId) and evaluate consent.
 * FAIL CLOSED on any broker error/timeout/empty — never throws.
 */
export async function fetchSmsConsent(input: {
  orgId: string
  contactId: string | number
  phone: string
  policy: SmsConsentPolicy
  call?: CallFn
  timeoutMs?: number
}): Promise<SmsConsentDecision> {
  const call = input.call ?? callCentralMcpTool
  try {
    const r = await call(
      'vin_get_contact',
      { orgId: input.orgId, contactId: Number(input.contactId) },
      { timeoutMs: input.timeoutMs },
    )
    if (!r.ok) {
      return block(`VinSolutions lookup failed: ${r.error ?? 'error'}`, 'vin-error', input.contactId, input.phone, null, 'unknown')
    }
    const data = r.data
    const node = Array.isArray(data) ? data[0] : data
    return evaluateSmsConsent(node, input.phone, input.policy)
  } catch (err) {
    return block(
      `VinSolutions lookup threw: ${err instanceof Error ? err.message : 'unknown'}`,
      'vin-throw',
      input.contactId,
      input.phone,
      null,
      'unknown',
    )
  }
}
