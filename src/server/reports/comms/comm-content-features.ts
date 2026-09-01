/**
 * Gate 4E — DETERMINISTIC content-feature primitives for the Enhanced Sales Communication Log
 * (weekly). These are pure string functions over a single message body, computed IN-MEMORY only
 * from the restricted raw body inside the /tmp handoff; their OUTPUTS are non-PII aggregate-safe
 * features (an integer count, a boolean, or a one-way identity hash) — never the body itself.
 *
 * They are NOT semantics: no sentiment, intent, language, entity, or keyword-meaning judgement is
 * made here. Each function is the LITERAL surface pattern named by a Semantic-Watchdog condition
 * (unfilled merge-tag delimiter, word count, link-only message, identical body). A message whose
 * meaning must be understood (objection, churn, competitor, apology, tone) is out of scope for this
 * module and its condition is HELD, not proxied.
 */
import { createHash } from 'node:crypto'

/**
 * The EXACT, enumerated unfilled merge-tag delimiter syntaxes this module detects (disclosed so a
 * zero result is auditable — detection is exact for THIS enumerated set; a novel delimiter outside
 * it is a disclosed recall limitation, never silently treated as "no merge tag possible"). An
 * "unfilled" merge tag is the template placeholder markup surviving verbatim into the sent message.
 */
export const MERGE_TAG_SYNTAXES: ReadonlyArray<string> = [
  '{{ field }}',
  '{ field }',
  '[[ field ]]',
  '<< field >>',
  '%% field %%',
  '% field %',
  '$ field $',
]

// One regex per enumerated syntax (delimiter + a field-like inner token). Deterministic; no meaning.
const MERGE_TAG_RE =
  /\{\{[^}]*\}\}|\{[A-Za-z][\w ]*\}|\[\[[^\]]*\]\]|<<[^>]*>>|%%[^%]*%%|%[A-Za-z][\w ]*%|\$[A-Za-z][\w ]*\$/

// URL detectors (deterministic). Non-global for `.test`, global for `.replace`.
const URL_RE = /(?:https?:\/\/\S+|www\.\S+)/i
const URL_RE_G = /(?:https?:\/\/\S+|www\.\S+)/gi

// A "word character" for language-agnostic tokenisation: any Unicode letter or number.
const WORDCHAR = /[\p{L}\p{N}]/u

/**
 * Deterministic word count: whitespace-delimited tokens that contain at least one Unicode
 * letter/number (so bare punctuation/emoji tokens do not inflate the count). Language-agnostic.
 */
export function wordCount(body: string): number {
  const t = body.trim()
  if (t === '') return 0
  return t.split(/\s+/).filter((w) => WORDCHAR.test(w)).length
}

/** True iff the body carries an UNFILLED merge-tag delimiter of an enumerated syntax. */
export function hasUnfilledMergeTag(body: string): boolean {
  return MERGE_TAG_RE.test(body)
}

/**
 * True iff the body contains at least one URL and, after removing every URL, no letters/numbers
 * remain — i.e. the message is only link(s) with no conversational text. Deterministic.
 */
export function isLinkOnly(body: string): boolean {
  if (!URL_RE.test(body)) return false
  const stripped = body.replace(URL_RE_G, ' ')
  return !WORDCHAR.test(stripped)
}

/**
 * "identical" normalisation for copy-paste/template detection: TRIM ONLY. This is the closest
 * literal reading of "same/identical message body" — it ignores only leading/trailing whitespace
 * (export artefacts), and deliberately does NOT case-fold or collapse internal whitespace (those
 * would be proxies that merge genuinely-different bodies).
 */
export function normalizeBody(body: string): string {
  return body.trim()
}

/**
 * One-way 16-hex content-identity of the trim-normalised body — an IN-MEMORY join key for grouping
 * identical bodies. Never reversible to the body; blank body ⇒ '' (absence is not an identity).
 */
export function bodyIdentityHash(body: string): string {
  const n = normalizeBody(body)
  if (n === '') return ''
  return createHash('sha256').update(n).digest('hex').slice(0, 16)
}
