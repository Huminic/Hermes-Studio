/**
 * Enhanced Sales Communication Log (weekly browser export) — validated held-input reader +
 * PII-minimizing transform (M1R Gate 4C1).
 *
 * Reads ONE rooftop's restricted weekly CSV from the /tmp handoff (never committed), enforces
 * every fail-closed gate in the family contract, and produces a NON-PII derivative:
 *   - aggregate counts (row/lead/channel/direction/etc) that reconcile to the manifest;
 *   - a lineage record binding raw SHA + manifest SHA + capture id + rooftop + period +
 *     transform version/hash;
 *   - in-memory, PII-MINIMIZED per-row derived features (structural/categorical/timestamp +
 *     non-reversible goal-scoped pseudonyms for rep/thread/person joins). Message Content is
 *     converted to length/presence ONLY; Customer/User/Message Content and any name are never
 *     retained.
 *
 * `toAdmissionProof` returns ONLY the committable aggregates + lineage (no per-row data).
 * Missing is never zero: a blank required cell fails closed, never coerces to 0. Pure compute
 * (the caller supplies the already-read bytes + the manifest entry). No writes, no /srv.
 */
import { createHash } from 'node:crypto'
import { parseCsv } from '../../report-ingest'
import {
  BUSINESS_TIMEZONE,
  CATEGORICAL_SERVICE_SCAN_COLUMNS,
  COMM_COLUMN_COUNT,
  COMM_HEADERS,
  COMM_KEY_COLUMNS,
  COMM_WEEKLY_FAMILY,
  PERMITTED_DERIVED_COLUMNS,
  PSEUDONYM_SALT,
  REQUIRED_COMM_TYPE,
  SERVICE_PARTS_TOKEN,
  TRANSFORM_VERSION,
  localDateOf,
  parseCaptureId,
  parseFilenamePeriod,
} from './comm-family-contract'

export class CommReaderError extends Error {}

export type CommManifestEntry = {
  profile: string
  capture_id: string
  dealer: string
  dealer_id: string
  filename: string
  sha256: string
  bytes: number
  captured_at: string
  rows: number
  columns: number
  observed_activity_min: string
  observed_activity_max: string
  unique_communication_ids: number
  unique_lead_ids: number
  filter_evidence_sha256: string
  applied_result_evidence_sha256: string
}

export type CommPeriod = { start: string; end: string; timezone: string }

export type CommLineage = {
  family: typeof COMM_WEEKLY_FAMILY
  profile: string
  dealer_id: string
  dealer_name: string
  capture_id: string
  raw_sha256: string
  manifest_sha256: string
  reporting_period: CommPeriod
  source_url: string
  report_url: string
  captured_at: string
  filter_evidence_sha256: string
  applied_result_evidence_sha256: string
  transform_version: string
  transform_hash: string
}

/** Aggregate, NON-PII admission proof (all counts; no names, ids, or content). */
export type CommAggregates = {
  family: typeof COMM_WEEKLY_FAMILY
  profile: string
  dealer_id: string
  rows: number
  columns: number
  unique_communication_ids: number
  unique_lead_ids: number
  unique_reps: number
  direction_counts: Record<string, number>
  channel_counts: Record<string, number>
  comm_type_counts: Record<string, number>
  lead_type_counts: Record<string, number>
  interaction_result_counts: Record<string, number>
  service_parts_signal_rows: number
  wrong_dealer_rows: number
  observed_activity_min: string
  observed_activity_max: string
  sales_only_proof: string
}

/**
 * PII-MINIMIZED per-row derived features (in-memory only; NEVER committed). Carries only
 * structural/categorical/timestamp features + one-way pseudonyms — no Customer/User/Message
 * Content/name/phone/email. `content_length`/`content_present` are the ONLY derivations of
 * Message Content (the text itself is discarded before this row is built).
 */
export type CommDerivedRow = {
  comm_token: string
  thread_token: string
  rep_token: string
  person_token: string
  user_group: string
  direction: string
  channel: string
  comm_type: string
  interaction_result: string
  lead_type: string
  lead_status_type: string
  lead_status: string
  lead_source_group: string
  lead_source: string
  make: string
  activity_iso: string
  activity_date: string
  has_attachment: boolean
  has_image: boolean
  has_video: boolean
  content_length: number
  content_present: boolean
}

export type CommDerivative = {
  aggregates: CommAggregates
  lineage: CommLineage
  derived_rows: Array<CommDerivedRow>
}

const sha256Hex = (b: Buffer) => createHash('sha256').update(b).digest('hex')

/** One-way, goal-scoped pseudonym: 16-hex truncated SHA-256 over salt||rooftop||kind||raw.
 *  Blank raw ids yield '' (absent), never a token — so absence is not fabricated as identity. */
function pseudonym(rooftop: string, kind: string, raw: string): string {
  const v = raw.trim()
  if (v === '') return ''
  return createHash('sha256')
    .update(`${PSEUDONYM_SALT}|${rooftop}|${kind}|${v}`)
    .digest('hex')
    .slice(0, 16)
}

/** Deterministic identity of the transformation logic (bound into lineage). */
export function transformHash(): string {
  return createHash('sha256')
    .update(
      `${TRANSFORM_VERSION}|permitted=${PERMITTED_DERIVED_COLUMNS.join(',')}` +
        `|pseudonym=sha256(salt||rooftop||kind||id)[:16]|content=length+present`,
    )
    .digest('hex')
    .slice(0, 16)
}

const ACT_DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})\s+(AM|PM)$/

/** Parse "MM/DD/YYYY HH:MM AM/PM" into a business-local ISO datetime + calendar date. The
 *  -04:00 offset is EDT, correct for the governed Aug-24..30 window; any row outside the
 *  window fails the window gate regardless of offset. Returns null on any malformation. */
function parseActivity(v: string): { date: string; iso: string } | null {
  const m = ACT_DATE_RE.exec(v.trim())
  if (!m) return null
  const [, mm, dd, yyyy, hhRaw, min, ap] = m
  let hh = Number(hhRaw)
  if (hh > 12 || Number(mm) > 12 || Number(mm) < 1 || Number(dd) > 31)
    return null
  if (ap === 'AM') hh = hh === 12 ? 0 : hh
  else hh = hh === 12 ? 12 : hh + 12
  const date = `${yyyy}-${mm}-${dd}`
  const iso = `${date}T${String(hh).padStart(2, '0')}:${min}:00-04:00`
  return { date, iso }
}

const tally = (xs: Array<string>): Record<string, number> => {
  const out: Record<string, number> = {}
  for (const x of xs) out[x] = (out[x] ?? 0) + 1
  return out
}

/**
 * Validate + transform ONE rooftop's weekly Communication Log capture. `buf` is the already
 * read raw bytes; `entry` is its manifest record; `manifestSha` is the verified manifest hash;
 * `period`/`sourceUrl`/`reportUrl`/`dealerName` come from the (already provenance-checked)
 * manifest. Fails closed on ANY schema/period/rooftop/Comm-Type/Service-Parts/uniqueness
 * violation. Returns a NON-PII derivative + lineage.
 */
export function readCommWeekly(input: {
  buf: Buffer
  entry: CommManifestEntry
  manifestSha: string
  period: CommPeriod
  sourceUrl: string
  reportUrl: string
  dealerName: string
}): CommDerivative {
  const { buf, entry, manifestSha, period, sourceUrl, reportUrl, dealerName } =
    input

  // 1. Bytes bind to the manifest (SHA + size).
  const rawSha = sha256Hex(buf)
  if (rawSha !== entry.sha256)
    throw new CommReaderError(
      `sha mismatch for ${entry.filename}: computed != manifest`,
    )
  if (buf.byteLength !== entry.bytes)
    throw new CommReaderError(`byte-size mismatch for ${entry.filename}`)

  // 1a. Capture-id must be well-formed AND agree on rooftop + capture DATE (a different-date
  //     or different-rooftop capture id binding this data fails closed).
  const cap = parseCaptureId(entry.capture_id)
  if (cap === null)
    throw new CommReaderError(`malformed capture_id ${entry.capture_id}`)
  if (cap.dealer_id !== entry.dealer_id)
    throw new CommReaderError(
      `capture_id rooftop ${cap.dealer_id} != dealer_id ${entry.dealer_id}`,
    )
  const capturedDate = localDateOf(entry.captured_at)
  if (capturedDate === '' || cap.date !== capturedDate)
    throw new CommReaderError(
      `capture_id date ${cap.date} != captured_at date ${capturedDate || '(unparseable)'}`,
    )

  // 1b. Exact dealer-name/ID agreement (a wrong manifest dealer label fails closed).
  if (entry.dealer !== dealerName)
    throw new CommReaderError(
      `manifest dealer "${entry.dealer}" != expected "${dealerName}"`,
    )

  // 1c. Filename-embedded period must equal the contracted/captured window (a 1999-period
  //     filename binding current data fails closed).
  const fnPeriod = parseFilenamePeriod(entry.filename)
  if (fnPeriod === null)
    throw new CommReaderError(`filename lacks a YYYY-MM-DD_YYYY-MM-DD period`)
  if (fnPeriod.start !== period.start || fnPeriod.end !== period.end)
    throw new CommReaderError(
      `filename period ${fnPeriod.start}..${fnPeriod.end} != contracted ${period.start}..${period.end}`,
    )

  // 2. Parse (RFC-4180, BOM-safe) + exact 24-column schema.
  const matrix = parseCsv(buf.toString('utf8'))
  if (matrix.length === 0) throw new CommReaderError('empty CSV')
  const header = matrix[0]
  if (header.length !== COMM_COLUMN_COUNT)
    throw new CommReaderError(
      `column count ${header.length} != ${COMM_COLUMN_COUNT}`,
    )
  for (let i = 0; i < COMM_COLUMN_COUNT; i++) {
    if (header[i] !== COMM_HEADERS[i])
      throw new CommReaderError(
        `schema mismatch at column ${i}: "${header[i]}" != "${COMM_HEADERS[i]}"`,
      )
  }
  const data = matrix.slice(1)
  if (data.length !== entry.rows)
    throw new CommReaderError(
      `row count ${data.length} != manifest ${entry.rows}`,
    )

  const col = (name: string) => header.indexOf(name)
  const iDealer = col(COMM_KEY_COLUMNS.dealer)
  const iUserGroup = col(COMM_KEY_COLUMNS.userGroup)
  const iUser = col(COMM_KEY_COLUMNS.user)
  const iDealerId = col(COMM_KEY_COLUMNS.dealerId)
  const iActivity = col(COMM_KEY_COLUMNS.activityDate)
  const iDirection = col(COMM_KEY_COLUMNS.direction)
  const iChannel = col(COMM_KEY_COLUMNS.commChannel)
  const iCommType = col(COMM_KEY_COLUMNS.commType)
  const iResult = col(COMM_KEY_COLUMNS.interactionResult)
  const iLeadType = col(COMM_KEY_COLUMNS.leadType)
  const iLeadStatusType = col(COMM_KEY_COLUMNS.leadStatusType)
  const iLeadStatus = col(COMM_KEY_COLUMNS.leadStatus)
  const iLeadSourceGroup = col(COMM_KEY_COLUMNS.leadSourceGroup)
  const iLeadSource = col(COMM_KEY_COLUMNS.leadSource)
  const iMake = col('Make')
  const iMessage = col(COMM_KEY_COLUMNS.messageContent)
  const iAttach = col('Text Attachment')
  const iImage = col('Text Image')
  const iVideo = col('Text Video')
  const iGlobalCust = col(COMM_KEY_COLUMNS.globalCustomerId)
  const iLead = col(COMM_KEY_COLUMNS.leadId)
  const iComm = col(COMM_KEY_COLUMNS.communicationId)
  const scanIdx = CATEGORICAL_SERVICE_SCAN_COLUMNS.map((c) => col(c))

  const rooftop = entry.dealer_id
  const derived: Array<CommDerivedRow> = []
  const commIds = new Set<string>()
  const leadIds = new Set<string>()
  const repTokens = new Set<string>()
  let servicePartsRows = 0
  let wrongDealerRows = 0
  let obsMinIso = ''
  let obsMaxIso = ''
  const present = (v: string | undefined): string => (v ?? '').trim()

  for (const r of data) {
    // 3-pre. Per-row Dealer NAME must match the expected rooftop name (exact agreement).
    if (present(r[iDealer]) !== dealerName)
      throw new CommReaderError(
        `row Dealer name != expected "${dealerName}" (fail closed)`,
      )
    // 3a. Comm Type = Sales on EVERY row.
    if (present(r[iCommType]) !== REQUIRED_COMM_TYPE)
      throw new CommReaderError(
        `non-Sales Comm Type on a row (fail closed): "${present(r[iCommType]).slice(0, 20)}"`,
      )
    // 3b. one rooftop only.
    if (present(r[iDealerId]) !== rooftop) wrongDealerRows++
    // 3c. Service/Parts scan across categorical fields (incl User Group).
    for (const i of scanIdx) {
      if (i >= 0 && SERVICE_PARTS_TOKEN.test(r[i] ?? '')) {
        servicePartsRows++
        break
      }
    }
    // 3d. Activity Date parses + falls inside the governed window.
    const act = parseActivity(present(r[iActivity]))
    if (act === null)
      throw new CommReaderError('Activity Date does not parse (fail closed)')
    if (act.date < period.start || act.date > period.end)
      throw new CommReaderError(
        `Activity Date ${act.date} outside window ${period.start}..${period.end}`,
      )
    if (obsMinIso === '' || act.iso < obsMinIso) obsMinIso = act.iso
    if (obsMaxIso === '' || act.iso > obsMaxIso) obsMaxIso = act.iso
    // 3e. Communication ID complete + unique.
    const commId = present(r[iComm])
    if (commId === '')
      throw new CommReaderError('blank Communication ID (fail closed)')
    if (commIds.has(commId))
      throw new CommReaderError('duplicate Communication ID (fail closed)')
    commIds.add(commId)
    const leadId = present(r[iLead])
    if (leadId !== '') leadIds.add(leadId)

    // 4. Build the PII-MINIMIZED derived row. Message Content is converted to length/presence
    //    ONLY and then discarded; Customer/User/name are never carried (pseudonyms only).
    const rawMessage = r[iMessage] ?? ''
    const repToken = pseudonym(rooftop, 'rep', present(r[iUser]))
    if (repToken !== '') repTokens.add(repToken)
    derived.push({
      comm_token: pseudonym(rooftop, 'comm', commId),
      thread_token: pseudonym(rooftop, 'thread', leadId),
      rep_token: repToken,
      person_token: pseudonym(rooftop, 'person', present(r[iGlobalCust])),
      user_group: present(r[iUserGroup]),
      direction: present(r[iDirection]),
      channel: present(r[iChannel]),
      comm_type: present(r[iCommType]),
      interaction_result: present(r[iResult]),
      lead_type: present(r[iLeadType]),
      lead_status_type: present(r[iLeadStatusType]),
      lead_status: present(r[iLeadStatus]),
      lead_source_group: present(r[iLeadSourceGroup]),
      lead_source: present(r[iLeadSource]),
      make: present(r[iMake]),
      activity_iso: act.iso,
      activity_date: act.date,
      has_attachment: present(r[iAttach]) !== '',
      has_image: present(r[iImage]) !== '',
      has_video: present(r[iVideo]) !== '',
      content_length: rawMessage.length,
      content_present: rawMessage.trim() !== '',
    })
  }

  // 5. Fail-closed reconciliations against the manifest (integrity, not trust).
  if (servicePartsRows !== 0)
    throw new CommReaderError(
      `${servicePartsRows} Service/Parts signal rows (must be 0)`,
    )
  if (wrongDealerRows !== 0)
    throw new CommReaderError(
      `${wrongDealerRows} wrong-dealer rows (must be 0)`,
    )
  if (commIds.size !== data.length)
    throw new CommReaderError('Communication ID not unique per row')
  if (commIds.size !== entry.unique_communication_ids)
    throw new CommReaderError(
      `unique Communication IDs ${commIds.size} != manifest ${entry.unique_communication_ids}`,
    )
  if (leadIds.size !== entry.unique_lead_ids)
    throw new CommReaderError(
      `unique Lead IDs ${leadIds.size} != manifest ${entry.unique_lead_ids}`,
    )
  if (obsMinIso !== entry.observed_activity_min)
    throw new CommReaderError(
      `observed activity min ${obsMinIso} != manifest ${entry.observed_activity_min}`,
    )
  if (obsMaxIso !== entry.observed_activity_max)
    throw new CommReaderError(
      `observed activity max ${obsMaxIso} != manifest ${entry.observed_activity_max}`,
    )

  const aggregates: CommAggregates = {
    family: COMM_WEEKLY_FAMILY,
    profile: entry.profile,
    dealer_id: rooftop,
    rows: data.length,
    columns: header.length,
    unique_communication_ids: commIds.size,
    unique_lead_ids: leadIds.size,
    unique_reps: repTokens.size,
    direction_counts: tally(derived.map((d) => d.direction)),
    channel_counts: tally(derived.map((d) => d.channel)),
    comm_type_counts: tally(derived.map((d) => d.comm_type)),
    lead_type_counts: tally(derived.map((d) => d.lead_type)),
    interaction_result_counts: tally(derived.map((d) => d.interaction_result)),
    service_parts_signal_rows: 0,
    wrong_dealer_rows: 0,
    observed_activity_min: obsMinIso,
    observed_activity_max: obsMaxIso,
    sales_only_proof:
      `${data.length} rows: Comm Type=Sales on every row; one rooftop Dealer ID=${rooftop}; ` +
      `zero Service/Parts tokens across ${CATEGORICAL_SERVICE_SCAN_COLUMNS.length} categorical ` +
      `columns (incl User Group); zero wrong-dealer rows; ${commIds.size} unique Communication IDs; ` +
      `all Activity Dates within ${period.start}..${period.end} (${BUSINESS_TIMEZONE})`,
  }

  const lineage: CommLineage = {
    family: COMM_WEEKLY_FAMILY,
    profile: entry.profile,
    dealer_id: rooftop,
    dealer_name: dealerName,
    capture_id: entry.capture_id,
    raw_sha256: rawSha,
    manifest_sha256: manifestSha,
    reporting_period: period,
    source_url: sourceUrl,
    report_url: reportUrl,
    captured_at: entry.captured_at,
    filter_evidence_sha256: entry.filter_evidence_sha256,
    applied_result_evidence_sha256: entry.applied_result_evidence_sha256,
    transform_version: TRANSFORM_VERSION,
    transform_hash: transformHash(),
  }

  return { aggregates, lineage, derived_rows: derived }
}

/** Committable admission proof: aggregates + lineage ONLY (drops per-row derived data). */
export function toAdmissionProof(d: CommDerivative): {
  aggregates: CommAggregates
  lineage: CommLineage
} {
  return { aggregates: d.aggregates, lineage: d.lineage }
}
