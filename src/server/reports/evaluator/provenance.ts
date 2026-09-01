/**
 * Gate 2 — governed delivery-envelope provenance (per SCHEMA_CONTRACT §1).
 *
 * A scheduled (gmail_scheduler) delivery MUST carry sender, subject, and a real
 * gmail_message_id (all non-empty) plus filename, full sha256, profile, family, and a
 * range period_hint. Message IDs are never fabricated — they come from committed
 * evidence. gmail_attachment_id absence is encoded explicitly ('unavailable'), not
 * silently treated as present. Period is validated from period_hint, never hardcoded.
 * Pure.
 */
export const EXPECTED_SCHEDULER_SENDER = 'reportscheduler@motosnap.com'

export type DeliveryEnvelope = {
  source_type: string
  sender: string
  subject: string
  gmail_message_id: string
  gmail_attachment_id: string
  received_at: string
  filename: string
  sha256: string
  profile: string
  family: string
  period_hint: string
  period_start: string
  period_end: string
}

export class ProvenanceError extends Error {}

const PERIOD_HINT_RE = /^(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$/

/** Parse + validate a range period_hint 'YYYY-MM-DD/YYYY-MM-DD'. */
export function parsePeriodHint(hint: string): { start: string; end: string } {
  const m = PERIOD_HINT_RE.exec(hint.trim())
  if (!m)
    throw new ProvenanceError(
      `period_hint is not a YYYY-MM-DD/YYYY-MM-DD range: "${hint}"`,
    )
  if (m[1] > m[2])
    throw new ProvenanceError(`period_hint start after end: "${hint}"`)
  return { start: m[1], end: m[2] }
}

type RawDelivery = {
  source_type?: string
  sender?: string
  subject?: string
  gmail_message_id?: string
  gmail_attachment_id?: string
  received_at?: string
  filename?: string
  sha256?: string
  profile?: string
  family?: string
  period_hint?: string
}

/**
 * Validate a committed delivery record into a typed envelope (fail-closed on the
 * SCHEMA_CONTRACT §1 provenance union). Never fabricates a message id.
 */
export function buildEnvelope(d: RawDelivery): DeliveryEnvelope {
  const src = (d.source_type ?? '').trim()
  if (src !== 'gmail_scheduler') {
    throw new ProvenanceError(
      `unsupported source_type "${src}" (only gmail_scheduler admitted here)`,
    )
  }
  const sender = (d.sender ?? '').trim()
  const subject = (d.subject ?? '').trim()
  const messageId = (d.gmail_message_id ?? '').trim()
  if (sender.length === 0)
    throw new ProvenanceError('gmail_scheduler delivery missing sender')
  if (sender !== EXPECTED_SCHEDULER_SENDER)
    throw new ProvenanceError(`unexpected sender "${sender}"`)
  if (subject.length === 0)
    throw new ProvenanceError('gmail_scheduler delivery missing subject')
  if (messageId.length === 0)
    throw new ProvenanceError(
      'gmail_scheduler delivery missing gmail_message_id',
    )
  const filename = (d.filename ?? '').trim()
  const sha = (d.sha256 ?? '').trim()
  const profile = (d.profile ?? '').trim()
  const family = (d.family ?? '').trim()
  if (filename.length === 0)
    throw new ProvenanceError('delivery missing filename')
  if (!/^[0-9a-f]{64}$/.test(sha))
    throw new ProvenanceError(`delivery sha256 is not 64 hex: "${sha}"`)
  if (profile.length === 0 || family.length === 0)
    throw new ProvenanceError('delivery missing profile/family')
  const { start, end } = parsePeriodHint(d.period_hint ?? '')
  // gmail_attachment_id may be genuinely absent — encode it explicitly, never invent one.
  const attachment = (d.gmail_attachment_id ?? '').trim()
  return {
    source_type: src,
    sender,
    subject,
    gmail_message_id: messageId,
    gmail_attachment_id: attachment.length > 0 ? attachment : 'unavailable',
    received_at: (d.received_at ?? '').trim(),
    filename,
    sha256: sha,
    profile,
    family,
    period_hint: (d.period_hint ?? '').trim(),
    period_start: start,
    period_end: end,
  }
}
