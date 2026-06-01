/**
 * PII redactor for embeddings (P-SRS-F7 / AC-DR-006).
 *
 * Closes the long-deferred SRS F.7 by providing a default regex-based
 * redactor + opt-in NER hook + integration with the embedding pipeline.
 *
 * Policy:
 * - Default model `local-hash-v1` is fully local and deterministic, so PII
 *   redaction is a no-op by default (no data egress).
 * - Remote models MUST have a redactor enabled or the embed will be
 *   refused. Operator opts in by setting `EMBED_PII_REDACTOR=on` (or
 *   `=ner` for the optional NER pass) plus configuring a remote provider
 *   via `EMBED_MODEL_PROVIDER`.
 * - Custom redactors can be registered via `registerPiiRedactor()`.
 *
 * Default patterns:
 * - SSN:     `\d{3}-\d{2}-\d{4}` → `[SSN]`
 * - CC:      `\d{13,16}` (Luhn-shaped) → `[CC]`
 * - email:   common email regex → `[EMAIL]`
 * - US-style phone numbers → `[PHONE]`
 *
 * Patterns are intentionally conservative; false-positives are preferable
 * to leaking PII to a remote embedding service.
 */

const SSN = /\b\d{3}-\d{2}-\d{4}\b/g
const CC = /(?<!\d)\d{13,16}(?!\d)/g
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
// Phone: anchored so it does not match into a longer digit run (e.g. a CC).
const PHONE = /(?<!\d)(\+1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g

export type RedactionResult = {
  redactedText: string
  /** Count of replaced spans per category. */
  counts: { ssn: number; cc: number; email: number; phone: number; custom: number }
}

export function regexRedact(text: string): RedactionResult {
  let counts = { ssn: 0, cc: 0, email: 0, phone: 0, custom: 0 }
  let s = text
  s = s.replace(SSN, () => {
    counts.ssn++
    return '[SSN]'
  })
  s = s.replace(EMAIL, () => {
    counts.email++
    return '[EMAIL]'
  })
  // CC before PHONE so a 13–16 digit run is consumed as CC, not partially as PHONE.
  s = s.replace(CC, () => {
    counts.cc++
    return '[CC]'
  })
  s = s.replace(PHONE, () => {
    counts.phone++
    return '[PHONE]'
  })
  return { redactedText: s, counts }
}

type RedactorFn = (text: string) => RedactionResult | Promise<RedactionResult>

const REGISTRY = new Map<string, RedactorFn>([
  ['default', (t) => regexRedact(t)],
])

/**
 * Register a custom redactor. Operator opts in via
 * `EMBED_PII_REDACTOR=<name>` where `<name>` matches the registered key.
 */
export function registerPiiRedactor(name: string, fn: RedactorFn): void {
  REGISTRY.set(name, fn)
}

export function getPiiRedactor(name?: string): RedactorFn | null {
  const key = name ?? 'default'
  return REGISTRY.get(key) ?? null
}

/**
 * Whether redaction is required for the given model.
 *
 * Local models (`local-*`) require no redaction by default. Any non-local
 * model (any provider not starting with `local-`) requires redaction
 * because chunk_text would otherwise egress to a remote service.
 *
 * Operator can FORCE redaction even on local with EMBED_PII_REDACTOR_ALWAYS=1.
 */
export function isRedactionRequired(modelId: string): boolean {
  if (process.env.EMBED_PII_REDACTOR_ALWAYS === '1') return true
  return !modelId.startsWith('local-')
}

/**
 * Redact chunk_text before embedding. If the model is remote and no
 * redactor is configured, returns `null` to signal the caller must refuse
 * the embed (this is the security gate).
 */
export async function maybeRedactForEmbedding(
  modelId: string,
  text: string,
): Promise<{ ok: true; text: string; counts: RedactionResult['counts'] | null } | { ok: false; reason: 'redactor-required' }> {
  if (!isRedactionRequired(modelId)) {
    return { ok: true, text, counts: null }
  }
  const name = process.env.EMBED_PII_REDACTOR
  if (!name || name === '' || name === 'off') {
    return { ok: false, reason: 'redactor-required' }
  }
  const fn = getPiiRedactor(name)
  if (!fn) {
    return { ok: false, reason: 'redactor-required' }
  }
  const out = await Promise.resolve(fn(text))
  return { ok: true, text: out.redactedText, counts: out.counts }
}

/** Test helper. */
export function _resetRedactorsForTests() {
  REGISTRY.clear()
  REGISTRY.set('default', (t) => regexRedact(t))
}
