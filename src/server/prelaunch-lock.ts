/**
 * Pre-launch SAFE-TEST allowlist — the universal outbound test guard.
 *
 * When PRELAUNCH_SMS_LOCK === 'true', ONLY phone numbers present in
 * PRELAUNCH_TEST_RECIPIENTS (comma-separated E.164) may receive a real
 * phone-channel send (sms / voice). A live run then reaches the operator's own
 * number alone and can NEVER broadcast — even if OUTBOUND_LIVE_ENABLED is
 * flipped on for a controlled test. Absent the lock this adds no restriction
 * (CommGate's global kill switch still governs whether anything sends at all).
 *
 * Enforced at EVERY outbound choke point so no path can bypass it:
 *   - CommGate (covers dispatchOutbound → campaigns / triggers / autonomous
 *     replies / manual replies / lead-flow).
 *   - The comms MCP tool handlers (comms_send_sms / comms_initiate_call), which
 *     hold their own gate and a direct provider call.
 *   - vin-watcher + lead-flow also call it directly so a blocked send is
 *     recorded with a reason in the hub before it ever reaches the gate.
 */

import { toE164 } from './phone-handle'

/** Canonical E.164 normalisation (shared with hub handles): "+1 (415) 555-0100",
 *  "4155550100", and "+14155550100" all compare equal. Using the same canonical
 *  form as producers means an allowlisted "+1…" number matches a candidate handle
 *  regardless of the format it arrives in (a bare 10-digit test number still
 *  matches). Falls back to a digits-only form if the value can't be parsed. */
export function normalizePhone(p: unknown): string | null {
  if (typeof p !== 'string') return null
  const t = p.trim()
  if (!t) return null
  return toE164(t) ?? (t.replace(/[^\d+]/g, '') || null)
}

export function prelaunchLockEngaged(): boolean {
  return process.env.PRELAUNCH_SMS_LOCK === 'true'
}

/** The configured allowlist (normalised E.164), empty when unset. */
export function prelaunchAllowList(): Array<string> {
  return (process.env.PRELAUNCH_TEST_RECIPIENTS ?? '')
    .split(',')
    .map((s) => normalizePhone(s))
    .filter((s): s is string => !!s)
}

/**
 * True when `phone` may be texted/called under the current lock state. Returns
 * true when the lock is disengaged; when engaged, true ONLY for allowlisted
 * numbers. An empty allowlist with the lock engaged blocks everyone (safe).
 */
export function allowedByPrelaunchLock(phone: string): boolean {
  if (!prelaunchLockEngaged()) return true
  return prelaunchAllowList().includes(normalizePhone(phone) ?? phone)
}
