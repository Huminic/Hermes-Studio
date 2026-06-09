/**
 * Dealer-visible output sanitiser (LC-BLOCKER-004).
 *
 * Third-party provider names must never reach a customer/dealer-visible surface.
 * Current inbound webhooks already emit clean labels ("Phone call" / "Video call"
 * / `video-<id>` handles), but the live message store still holds STALE pre-scrub
 * threads and cert/test seeds whose subject / contact_handle / identifiers carry
 * provider terms (e.g. `tavus-cert_…`, `vapi call · …`). The Teambox renders those
 * raw, so they leak.
 *
 * This sanitiser runs at the comms API boundary (threads list / thread detail /
 * contacts) so BOTH the JSON response and the rendered Teambox are clean,
 * covering stale data on every store without a destructive live-DB write. It is
 * deterministic (same input → same output), so handle-based matching between
 * threads and contacts stays consistent after scrubbing.
 *
 * NOTE: this sanitises DISPLAY/transport only. Stored handles (the dedup/threading
 * keys) are untouched, so message routing is unaffected. A one-time source data
 * cleanup of the stale rows remains a separate operator-gated task.
 */

const VENDOR_REPLACEMENTS: Array<[RegExp, string]> = [
  [/text\s*magic/gi, 'text'],
  [/vin\s*solutions/gi, 'leads'],
  [/signalwire/gi, 'voice'],
  [/vapi/gi, 'voice'],
  [/tavus/gi, 'video'],
  [/resend/gi, 'email'],
]

/** Replace any third-party provider term with a neutral, dealer-safe word. */
export function scrubVendorTerms(value: string): string
export function scrubVendorTerms(value: null): null
export function scrubVendorTerms(value: string | null): string | null
export function scrubVendorTerms(value: string | null): string | null {
  if (typeof value !== 'string') return value
  let out = value
  for (const [re, rep] of VENDOR_REPLACEMENTS) out = out.replace(re, rep)
  return out
}

type ThreadListItem = {
  subject: string
  contact_handle: string
  last_message_preview: string
  [k: string]: unknown
}

/** Scrub the dealer-visible fields of a threads-list row (in place-safe copy). */
export function scrubThreadListItem<T extends ThreadListItem>(item: T): T {
  return {
    ...item,
    subject: scrubVendorTerms(item.subject),
    contact_handle: scrubVendorTerms(item.contact_handle),
    last_message_preview: scrubVendorTerms(item.last_message_preview),
  }
}

type MessageLike = {
  content: string
  author: string
  metadata?: Record<string, unknown>
  [k: string]: unknown
}
type ThreadDetailLike = {
  subject: string
  contact_handle: string
  messages: Array<MessageLike>
  [k: string]: unknown
}

/**
 * Scrub a full thread (detail view). Visible fields are sanitised; message
 * `metadata` is DROPPED entirely — it is internal-only (the renderer never reads
 * it) and carries provider-named keys (`vapi_call_id`, `tavus_conversation_id`)
 * that would otherwise sit in the network response.
 */
export function scrubThreadDetail<T extends ThreadDetailLike>(thread: T): T {
  return {
    ...thread,
    subject: scrubVendorTerms(thread.subject),
    contact_handle: scrubVendorTerms(thread.contact_handle),
    messages: thread.messages.map((m) => {
      const { metadata: _drop, ...rest } = m
      return {
        ...rest,
        content: scrubVendorTerms(m.content),
        author: scrubVendorTerms(m.author),
      }
    }),
  }
}

type ContactLike = {
  display_name: string | null
  identifiers: Record<string, string>
  [k: string]: unknown
}

/** Scrub a contact's display name + identifier keys/values (consistently). */
export function scrubContact<T extends ContactLike>(contact: T): T {
  return {
    ...contact,
    display_name: scrubVendorTerms(contact.display_name),
    identifiers: Object.fromEntries(
      Object.entries(contact.identifiers).map(([k, v]) => [
        scrubVendorTerms(k),
        scrubVendorTerms(v),
      ]),
    ),
  }
}
