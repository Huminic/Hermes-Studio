/**
 * Canonical phone-handle normalization for messaging threads.
 *
 * Outbound producers (vin-watcher, automations, lead-flow, campaign-worker)
 * store the recipient as E.164 WITH a leading '+' (e.g. "+17313946907"), while
 * the TextMagic inbound webhook receives the sender WITHOUT the '+' (e.g.
 * "17313946907"). Because threads are matched on the exact `contact_handle`
 * string, an unnormalized inbound reply lands on a SEPARATE thread from the
 * outbound conversation — so the agent's reply subscription never fires and a
 * duplicate "new lead" notification is sent. Canonicalizing both sides to the
 * same E.164 form at the thread choke point keeps a conversation on one thread.
 */

/** Channels whose `contact_handle` is a phone number (E.164 canonical form). */
const PHONE_CHANNELS: ReadonlySet<string> = new Set([
  'sms',
  'textmagic',
  'voice',
  'phone',
  'vapi',
])

/**
 * Coerce a raw phone string to canonical E.164 ("+" + digits). Returns null
 * when there is nothing phone-like to parse (caller decides the fallback).
 * - "17313946907"      → "+17313946907"  (11-digit, already has country code)
 * - "7313946907"       → "+17313946907"  (bare 10-digit US → assume +1)
 * - "+1 (731) 394-6907"→ "+17313946907"  (strip formatting)
 * - already "+…"       → unchanged (minus stray formatting)
 */
export function toE164(raw: string): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  const hadPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return null
  if (hadPlus) return `+${digits}`
  if (digits.length === 10) return `+1${digits}`
  return `+${digits}`
}

/**
 * Canonicalize a thread `contact_handle` for the given channel. Phone channels
 * are coerced to E.164; every other channel (email/chat/video/…) is returned
 * unchanged. A phone value that cannot be parsed is passed through as-is rather
 * than dropped, so we never lose the handle.
 */
export function canonicalizeContactHandle(channel: string, handle: string): string {
  if (!PHONE_CHANNELS.has(channel)) return handle
  return toE164(handle) ?? handle
}
