/**
 * Immediate-engagement exclude filter.
 *
 * The immediate lead-engagement text must NOT go to leads already handled by one
 * of our conversational agents (Vapi voice, Tavus video, incl. the widget video
 * path) — those customers are being engaged by the agent directly. Those leads
 * do NOT enter the VinSolutions feed; they live in the messaging hub as threads
 * whose first message carries a `via` tag (vapi-webhook / tavus-webhook / …). A
 * VIN lead only overlaps them if the dealer's DMS re-imports our ADF notification
 * (landing as "Dealers WebSite", indistinguishable by source label) — so the
 * exclude keys on the phone's hub history, not the VIN source string.
 *
 * `isAgentHandled(phone)` = true when any hub thread for that phone (canonical
 * E.164) has a message `via` in the configured exclude set. Config-driven
 * (`comms.immediate_exclude_via`) so call-back (`widget-callback`) can be added
 * in one line without a code change. Default: vapi-webhook + tavus-webhook.
 */

import { canonicalizeContactHandle } from './phone-handle'
import { listContactVias } from './messaging-hub-store'

/** Voice (Vapi) + video (Tavus, incl. widget video) — handled by the agent. */
export const DEFAULT_EXCLUDE_VIA = ['vapi-webhook', 'tavus-webhook'] as const

export type ExcludeConfig = { immediate_exclude_via?: string[] }

/** Resolve the exclude set: configured list if non-empty, else the default. */
export function resolveExcludeVia(cfg: ExcludeConfig | undefined): string[] {
  const v = cfg?.immediate_exclude_via
  return v && v.length ? v : [...DEFAULT_EXCLUDE_VIA]
}

/** Injectable lookup: all `via` tags across a contact's hub threads. */
export type ViasForContact = (profile: string, contactHandle: string) => string[]

/**
 * True when this phone was already engaged by an excluded conversational agent
 * channel. `viasForContact` defaults to the messaging-hub store; inject in tests.
 */
export function isAgentHandled(input: {
  profile: string
  phone: string
  cfg?: ExcludeConfig
  viasForContact?: ViasForContact
}): boolean {
  const handle = canonicalizeContactHandle('sms', input.phone)
  const exclude = new Set(resolveExcludeVia(input.cfg))
  const lookup = input.viasForContact ?? listContactVias
  return lookup(input.profile, handle).some((v) => exclude.has(v))
}
