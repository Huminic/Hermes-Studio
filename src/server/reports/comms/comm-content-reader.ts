/**
 * Gate 4E — isolated, in-memory CONTENT feature reader for the Enhanced Sales Communication Log
 * (weekly). It does NOT modify or re-implement the frozen Gate 4C1 reader/contract: it CALLS
 * `readCommWeekly` (running every fail-closed validation gate + producing the authoritative
 * structural derived rows + lineage), then re-reads ONLY the Message Content column from the same
 * validated bytes to attach DETERMINISTIC, aggregate-safe content features (word count, unfilled
 * merge-tag flag, link-only flag, one-way body-identity hash) to each already-validated row.
 *
 * Message Content is read in-memory from the /tmp handoff and discarded; the per-row features are
 * NON-PII (integer/boolean/one-way hash) and, like the frozen derived rows, are NEVER committed —
 * only the downstream evaluator's aggregate cells are. The re-read is bound to the frozen reader by
 * a fail-closed 1:1 join on the comm pseudonym and a content_present cross-check, so it can never
 * drift from — or silently relax — the validated row population.
 */
import { createHash } from 'node:crypto'
import { parseCsv } from '../../report-ingest'
import { COMM_KEY_COLUMNS, PSEUDONYM_SALT } from './comm-family-contract'
import { readCommWeekly } from './comm-reader'
import {
  bodyIdentityHash,
  hasUnfilledMergeTag,
  isLinkOnly,
  wordCount,
} from './comm-content-features'
import type { CommLineage, CommManifestEntry, CommPeriod } from './comm-reader'

export class CommContentError extends Error {}

/**
 * A validated row augmented with DETERMINISTIC content features. Structural fields are copied
 * verbatim from the frozen reader's derived row; content features are computed in-memory from the
 * body. NON-PII: no name, customer, message content, or reversible id. In-memory only.
 */
export type CommContentRow = {
  comm_token: string
  thread_token: string
  rep_token: string
  person_token: string
  direction: string
  channel: string
  activity_date: string
  activity_iso: string
  content_present: boolean
  word_count: number
  has_unfilled_merge_tag: boolean
  is_link_only: boolean
  body_identity_hash: string // '' when the body is blank (absence is not an identity)
}

export type CommContentReadInput = {
  buf: Buffer
  entry: CommManifestEntry
  manifestSha: string
  period: CommPeriod
  sourceUrl: string
  reportUrl: string
  dealerName: string
}

/** Replicates comm-reader's one-way pseudonym EXACTLY — used ONLY as a join key to bind this
 *  re-read to the frozen reader's rows. A drift would break the fail-closed 1:1 join below. */
function commPseudonym(rooftop: string, kind: string, raw: string): string {
  const v = raw.trim()
  if (v === '') return ''
  return createHash('sha256')
    .update(`${PSEUDONYM_SALT}|${rooftop}|${kind}|${v}`)
    .digest('hex')
    .slice(0, 16)
}

/**
 * Validate ONE rooftop's weekly capture via the frozen reader, then attach deterministic content
 * features to every validated row. Fails closed if the content re-read does not join the validated
 * rows 1:1 or disagrees on content presence.
 */
export function readCommContent(input: CommContentReadInput): {
  rows: Array<CommContentRow>
  lineage: CommLineage
} {
  const derivative = readCommWeekly(input) // full fail-closed validation + structural rows + lineage
  const byToken = new Map(
    derivative.derived_rows.map((r) => [r.comm_token, r] as const),
  )

  const matrix = parseCsv(input.buf.toString('utf8'))
  const header = matrix[0]
  const iMsg = header.indexOf(COMM_KEY_COLUMNS.messageContent)
  const iComm = header.indexOf(COMM_KEY_COLUMNS.communicationId)
  if (iMsg < 0 || iComm < 0)
    throw new CommContentError(
      'content re-read missing Message Content / Communication ID column (fail closed)',
    )

  const rooftop = input.entry.dealer_id
  const rows: Array<CommContentRow> = []
  const joined = new Set<string>()
  for (const r of matrix.slice(1)) {
    const commId = (r[iComm] ?? '').trim()
    const token = commPseudonym(rooftop, 'comm', commId)
    const d = byToken.get(token)
    if (d === undefined)
      throw new CommContentError(
        'content row does not join a validated derived row (fail closed)',
      )
    if (joined.has(token))
      throw new CommContentError(
        'duplicate Communication ID in content join (fail closed)',
      )
    joined.add(token)

    const body = r[iMsg] ?? ''
    const present = body.trim() !== ''
    if (present !== d.content_present)
      throw new CommContentError(
        'content_present disagreement with the frozen reader (fail closed)',
      )
    rows.push({
      comm_token: d.comm_token,
      thread_token: d.thread_token,
      rep_token: d.rep_token,
      person_token: d.person_token,
      direction: d.direction,
      channel: d.channel,
      activity_date: d.activity_date,
      activity_iso: d.activity_iso,
      content_present: d.content_present,
      word_count: wordCount(body),
      has_unfilled_merge_tag: present && hasUnfilledMergeTag(body),
      is_link_only: present && isLinkOnly(body),
      body_identity_hash: present ? bodyIdentityHash(body) : '',
    })
  }

  if (rows.length !== derivative.derived_rows.length)
    throw new CommContentError(
      `content rows ${rows.length} != validated derived rows ${derivative.derived_rows.length}`,
    )
  if (joined.size !== byToken.size)
    throw new CommContentError(
      'not every validated derived row was joined by a content row (fail closed)',
    )

  return { rows, lineage: derivative.lineage }
}
