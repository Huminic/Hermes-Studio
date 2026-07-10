/**
 * Extract a customer's contact identity (phone + name) from the accumulated
 * text of a website-chat conversation.
 *
 * The public widget-chat lead used to fire on the FIRST visitor message, while
 * the session is still anonymous (`chat:<uuid>` handle, no name). The phone and
 * name the shopper types a few turns later were never captured, so the ADF sent
 * to the DMS carried an empty <contact>. A contactless ADF cannot be deduped by
 * VinSolutions, which mints a fresh anonymous contact per ingest — producing the
 * dealer-reported "no name / no phone / two leads" P0.
 *
 * This module scans only the VISITOR turns (never the assistant's) for a phone
 * number and, best-effort, a self-introduced name, so the lead can fire ONCE
 * with real identity. Extraction is deliberately conservative: a miss (null)
 * means "no identity yet — keep waiting", never a wrong guess.
 */

import { toE164 } from './phone-handle'

// `content` is typed loosely because the value arrives from an untrusted
// request body (widget-chat `history`), so the coercions below are real
// runtime guards, not dead defensive code.
export type ChatTurn = { role: string; content: unknown }

export type ExtractedContact = {
  /** E.164 phone if a plausible number was found in a visitor turn, else null. */
  phone: string | null
  /** Self-introduced full name if confidently found, else null. */
  name: string | null
}

/**
 * Match a North-American phone number embedded in free text. Requires the
 * 3-3-4 digit shape with common separators (space, dot, dash) and optional
 * parens / leading +1 or 1. Anchored on word boundaries so it does not slice a
 * run out of a longer digit string (e.g. an order number or a VIN). We reject
 * matches that are part of a longer digit run in `firstPhoneInText`.
 */
const PHONE_RE =
  /(?<!\d)(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})(?!\d)/

/**
 * Pull the first plausible phone number out of a single message, canonicalized
 * to E.164. Returns null when nothing phone-shaped is present. The area code is
 * constrained to a valid NANP form ([2-9] leading) so years, prices, or zip+ext
 * runs are not misread as phones.
 */
export function firstPhoneInText(text: string): string | null {
  if (typeof text !== 'string' || !text) return null
  const m = PHONE_RE.exec(text)
  if (!m) return null
  const digits = `${m[1]}${m[2]}${m[3]}`
  // Guard: exactly 10 significant digits (the leading 1/+1 is optional and
  // stripped by the regex groups). toE164 re-adds +1.
  if (digits.length !== 10) return null
  return toE164(digits)
}

/**
 * Very conservative self-introduced-name detector. Matches only explicit
 * "my name is X" / "this is X" / "I'm X" / "name: X" lead-ins, then takes 1–3
 * capitalized-ish tokens. Returns null on anything ambiguous — a wrong name is
 * worse for the DMS than no name, and the phone alone already lets VinSolutions
 * dedupe. Intentionally does NOT try to parse a bare "John Smith" with no cue.
 */
const NAME_CUE_RE =
  /(?:my name is|i am|i'm|im|this is|name'?s|name\s*[:=])\s+([A-Za-z][A-Za-z'’.-]*(?:\s+[A-Za-z][A-Za-z'’.-]*){0,2})/i

/** Tokens that follow a cue but are not names (e.g. "I'm looking for a car"). */
const NAME_STOPWORDS = new Set([
  'looking',
  'interested',
  'trying',
  'just',
  'here',
  'not',
  'good',
  'fine',
  'ready',
  'wondering',
  'hoping',
  'calling',
  'texting',
  'available',
  'the',
  'a',
  'an',
])

export function extractName(text: string): string | null {
  if (typeof text !== 'string' || !text) return null
  const m = NAME_CUE_RE.exec(text)
  if (!m) return null
  const raw = m[1].trim().replace(/[.,!?]+$/, '')
  if (!raw) return null
  const first = raw.split(/\s+/)[0].toLowerCase()
  if (NAME_STOPWORDS.has(first)) return null
  // Title-case each token so "john smith" → "John Smith" for the DMS.
  const name = raw
    .split(/\s+/)
    .map((t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t))
    .join(' ')
  return name.length > 1 ? name : null
}

/**
 * Scan the full conversation (visitor turns only) for the customer's phone and
 * name. Returns the FIRST phone found and the FIRST confidently-detected name.
 * Assistant turns are skipped so the agent quoting the number back ("…reach you
 * at 678-…") or asking "what is your name?" is never mistaken for the visitor's
 * own identity.
 */
export function extractContactFromHistory(
  history: ReadonlyArray<ChatTurn>,
): ExtractedContact {
  let phone: string | null = null
  let name: string | null = null
  for (const turn of history) {
    if (turn.role === 'assistant') continue
    const content = String(turn.content ?? '')
    if (!phone) phone = firstPhoneInText(content)
    if (!name) name = extractName(content)
    if (phone && name) break
  }
  return { phone, name }
}
