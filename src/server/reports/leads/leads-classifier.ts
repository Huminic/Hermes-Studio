/**
 * VinSolutions Custom Reporting "Leads" family CLASSIFIER (M1R) — fail-closed.
 *
 * Given the raw workbook bytes + declared browser provenance, RECOMPUTE (never
 * trust) every reconciliation point and return a hold decision:
 *   - `held`        : accepted-eligible (all content checks pass). NOT promoted;
 *                     purely a hold/analysis decision. Nothing is written to /srv.
 *                     May carry `provenance_gaps` (absent provenance items exposed
 *                     as unproven contract items — never fabricated).
 *   - `quarantined` : one or more content checks failed; lists every failure.
 *
 * Content checks (all must pass for a hold): magic bytes; declared-SHA256
 * reconciliation; source-URL host admission (exact reporting host); capture-id
 * shape + rooftop; exactly one 'Export' sheet; no formulas; exact 57-column
 * schema; no non-blank extra rows/columns; one-rooftop dealer id + dealer name on
 * every row; reporting window well-formed + every origination date (business tz)
 * inside it + filename/declared period reconcile; Lead ID on every row + unique;
 * Sales-only (allowed lead types, no Service/Parts by list or by fail-closed scan
 * across all categorical columns); row-count reconciliation. Missing is never zero.
 */
import { createHash } from 'node:crypto'
import { readXlsx } from '../provisional/xlsx-reader'
import { dealerMatches } from '../../report-ingest'
import { normalizeBusinessDate } from './leads-reader'
import {
  ALLOWED_LEAD_TYPES,
  CAPTURE_ID_RE,
  CATEGORICAL_SERVICE_SCAN_COLUMNS,
  DEALER_IDENTITY,
  EXCLUDED_LEAD_SOURCES,
  EXPECTED_REPORT_KIND,
  LEADS_CLASSIFIER_CHECKS,
  LEADS_COLUMN_COUNT,
  LEADS_FAMILY,
  LEADS_HEADERS,
  LEADS_KEY_COLUMNS,
  LEADS_PROFILES,
  LEADS_SHEET_NAME,
  SERVICE_PARTS_TOKEN,
  TZ_OFFSET_RE,
  XLSX_MAGIC,
  admitLeadsSourceUrl,
  evaluateProvenanceCompleteness,
} from './leads-family-contract'
import type { LeadsProfile } from './leads-family-contract'
import type { XlsxError } from '../provisional/xlsx-reader'

export type LeadsProvenance = {
  capture_id: string
  profile: string
  dealer_id: string
  dealer_name: string
  source_url: string
  reporting_period: { start: string; end: string }
  declared_rows: number
  declared_sha256: string
  filename: string
  captured_at?: string
  declared_report_kind?: string
  filter_evidence?: unknown
}

export type LeadsCheckFailure = { check: string; detail: string }

export type LeadsClassification =
  | {
      status: 'held'
      family: typeof LEADS_FAMILY
      profile: LeadsProfile
      dealer_id: string
      period: { start: string; end: string }
      rows: number
      sha256: string
      checks_passed: Array<string>
      provenance_gaps: Array<string>
      provenance_needed: Record<string, string>
    }
  | {
      status: 'quarantined'
      family: typeof LEADS_FAMILY
      reason: string
      failures: Array<LeadsCheckFailure>
      sha256: string | null
    }

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Classify a Leads workbook fail-closed. Pure: no I/O beyond hashing the buffer. */
export function classifyLeadsDelivery(
  buf: Buffer,
  prov: LeadsProvenance,
): LeadsClassification {
  const failures: Array<LeadsCheckFailure> = []
  const fail = (check: string, detail: string) =>
    failures.push({ check, detail })

  // 0) Buffer sanity + magic bytes.
  let sha256: string | null = null
  const isBuffer = Buffer.isBuffer(buf) && buf.length >= 4
  if (!isBuffer) {
    fail('magic_bytes', 'input is not a non-empty buffer')
  } else {
    sha256 = createHash('sha256').update(buf).digest('hex')
    const magicOk = XLSX_MAGIC.every((b, i) => buf[i] === b)
    if (!magicOk)
      fail(
        'magic_bytes',
        `expected PK\\x03\\x04, got ${[...buf.subarray(0, 4)].map((b) => b.toString(16)).join(' ')}`,
      )
  }

  // 1) Declared-SHA256 reconciliation (missing declared hash is a failure).
  if (!prov.declared_sha256)
    fail('declared_sha256', 'provenance is missing declared_sha256')
  else if (sha256 && sha256 !== prov.declared_sha256)
    fail(
      'declared_sha256',
      `computed ${sha256} != declared ${prov.declared_sha256}`,
    )

  // 2) Provenance: profile + rooftop identity.
  const profile = prov.profile as LeadsProfile
  const identity = LEADS_PROFILES.includes(profile)
    ? DEALER_IDENTITY[profile]
    : null
  if (!identity) fail('profile', `unknown profile: ${String(prov.profile)}`)
  else if (prov.dealer_id !== identity.dealer_id)
    fail(
      'dealer_identity',
      `declared dealer_id ${prov.dealer_id} != ${identity.dealer_id} for ${profile}`,
    )

  // 3) Capture id shape + rooftop consistency.
  const capMatch = CAPTURE_ID_RE.exec(prov.capture_id)
  if (!capMatch)
    fail(
      'capture_id',
      `capture_id "${prov.capture_id}" does not match VIN-LEADS-YYYYMMDD-<dealerId>`,
    )
  else if (identity && capMatch[1] !== identity.dealer_id)
    fail(
      'capture_id',
      `capture_id dealer ${capMatch[1]} != rooftop ${identity.dealer_id}`,
    )

  // 4) Source-URL host admission (exact reporting host; not the dashboard host).
  if (!admitLeadsSourceUrl(prov.source_url))
    fail(
      'source_url_host',
      `source_url not admitted (must be https reporting host + InfoGo path): "${prov.source_url}"`,
    )

  // 4b) Declared report kind, when present, must be the Leads family (present-but-wrong fails closed).
  if (
    prov.declared_report_kind != null &&
    prov.declared_report_kind !== EXPECTED_REPORT_KIND
  )
    fail(
      'declared_report_kind',
      `declared_report_kind "${prov.declared_report_kind}" != "${EXPECTED_REPORT_KIND}"`,
    )

  // 4c) captured_at, when present, must carry an explicit timezone offset.
  if (prov.captured_at != null && !TZ_OFFSET_RE.test(prov.captured_at))
    fail(
      'captured_at_timezone',
      `captured_at "${prov.captured_at}" lacks an explicit timezone offset`,
    )

  // 5) Reporting window well-formed.
  const p = prov.reporting_period
  const periodOk =
    ISO_DATE.test(p.start) && ISO_DATE.test(p.end) && p.start <= p.end
  if (!periodOk)
    fail('reporting_window', `malformed reporting_period: ${JSON.stringify(p)}`)

  // 6) Filename period reconciliation.
  const fnDates = prov.filename.match(/\d{4}-\d{2}-\d{2}/g) ?? []
  if (
    periodOk &&
    (fnDates[0] !== p.start || fnDates[fnDates.length - 1] !== p.end)
  )
    fail(
      'filename_period',
      `filename dates ${JSON.stringify(fnDates)} != period ${p.start}..${p.end}`,
    )

  // 7) Parse container + schema (raw serials; a malformed workbook fails closed).
  let rows: Array<Array<string>> | null = null
  if (isBuffer && failures.every((f) => f.check !== 'magic_bytes')) {
    try {
      const { sheets } = readXlsx(buf, {}, { rawDates: true })
      if (sheets.length !== 1)
        fail('single_sheet', `expected exactly 1 sheet, got ${sheets.length}`)
      // readXlsx guarantees >= 1 sheet (it throws otherwise), so sheet is defined.
      const sheet = sheets.find((s) => s.name === LEADS_SHEET_NAME) ?? sheets[0]
      if (sheet.name !== LEADS_SHEET_NAME)
        fail(
          'sheet_name',
          `expected sheet "${LEADS_SHEET_NAME}", got "${sheet.name}"`,
        )
      if ((sheet.formulaCount ?? 0) > 0)
        fail(
          'no_formulas',
          `workbook contains ${String(sheet.formulaCount)} formula cell(s)`,
        )
      rows = sheet.rows
    } catch (e) {
      fail('workbook', `unreadable workbook: ${(e as XlsxError).message}`)
    }
  }

  if (rows && rows.length >= 1) {
    const headers = rows[0].map((h) => h.trim())
    const headerWidth = rows[0].length
    if (headers.length !== LEADS_COLUMN_COUNT)
      fail(
        'schema',
        `expected ${LEADS_COLUMN_COUNT} columns, got ${headers.length}`,
      )
    const mismatch = LEADS_HEADERS.findIndex((h, i) => headers[i] !== h)
    if (headers.length === LEADS_COLUMN_COUNT && mismatch >= 0)
      fail(
        'schema',
        `column ${mismatch}: expected "${LEADS_HEADERS[mismatch]}", got "${headers[mismatch]}"`,
      )
    if (headerWidth > LEADS_COLUMN_COUNT)
      fail(
        'extra_columns',
        `header row has ${headerWidth} cells (> ${LEADS_COLUMN_COUNT})`,
      )

    // Only scan data rows when the schema is exact — otherwise indices are unsafe.
    if (
      headers.length === LEADS_COLUMN_COUNT &&
      mismatch < 0 &&
      headerWidth <= LEADS_COLUMN_COUNT
    ) {
      const K = LEADS_KEY_COLUMNS
      const ix = (n: string) => headers.indexOf(n)
      const allRows = rows.slice(1)
      const data = allRows.filter((r) => r.some((c) => c.trim() !== ''))
      // Bounds-safe accessor: a short row yields '' rather than an out-of-range read.
      const at = (r: Array<string>, i: number): string =>
        i >= 0 && i < r.length ? r[i] : ''
      const g = (r: Array<string>, i: number) => at(r, i).trim()
      const iId = ix(K.leadId),
        iDealer = ix(K.dealer),
        iDealerId = ix(K.dealerId),
        iSource = ix(K.leadSource),
        iType = ix(K.leadType),
        iOrig = ix(K.originationDate)

      // No non-blank cell beyond the 57-column grid, on any row.
      const wideRow = allRows.find((r) =>
        r.slice(LEADS_COLUMN_COUNT).some((c) => c.trim() !== ''),
      )
      if (wideRow)
        fail(
          'extra_columns',
          `a row has non-blank cells beyond column ${LEADS_COLUMN_COUNT}`,
        )

      // Row-count reconciliation (also catches non-blank extra rows).
      if (data.length !== prov.declared_rows)
        fail(
          'row_count',
          `parsed ${data.length} data rows != declared ${prov.declared_rows}`,
        )

      // One-rooftop dealer identity across every row.
      const dealerIds = new Set(data.map((r) => g(r, iDealerId)))
      if (identity) {
        if (dealerIds.size !== 1 || !dealerIds.has(identity.dealer_id))
          fail(
            'one_rooftop',
            `Dealer ID column values ${JSON.stringify([...dealerIds])} != single ${identity.dealer_id}`,
          )
        const badName = data.find(
          (r) => !dealerMatches(identity.dealer_name, g(r, iDealer)),
        )
        if (badName)
          fail(
            'dealer_name',
            `a row Dealer "${g(badName, iDealer)}" does not match ${identity.dealer_name}`,
          )
      }

      // Lead ID on every row + uniqueness.
      const ids = data.map((r) => g(r, iId))
      const blankIds = ids.filter((v) => v === '').length
      if (blankIds > 0) fail('lead_id', `${blankIds} rows have a blank Lead ID`)
      const nonBlankIds = ids.filter((v) => v !== '')
      if (new Set(nonBlankIds).size !== nonBlankIds.length)
        fail(
          'lead_id',
          `Lead IDs not unique (${new Set(nonBlankIds).size} unique of ${nonBlankIds.length})`,
        )

      // Origination dates inside the reporting window (business tz, no UTC shift).
      if (periodOk) {
        const outOfWindow = data.filter((r) => {
          const d = normalizeBusinessDate(r[iOrig])
          return d != null && (d < p.start || d > p.end)
        }).length
        if (outOfWindow > 0)
          fail(
            'period_rows',
            `${outOfWindow} rows have origination date outside ${p.start}..${p.end}`,
          )
      }

      // Sales-only: allowed lead types.
      const badTypes = new Set(
        data
          .map((r) => g(r, iType))
          .filter((v) => v !== '' && !ALLOWED_LEAD_TYPES.includes(v)),
      )
      if (badTypes.size > 0)
        fail(
          'sales_only_lead_type',
          `disallowed Lead Type(s): ${JSON.stringify([...badTypes])}`,
        )

      // Sales-only: no governed Service source (declared exclusion list).
      const excluded = new Set(
        EXCLUDED_LEAD_SOURCES.map((s) => s.toLowerCase()),
      )
      const svcListed = data.filter((r) =>
        excluded.has(g(r, iSource).toLowerCase()),
      ).length
      if (svcListed > 0)
        fail(
          'sales_only_source',
          `${svcListed} rows carry a governed Service source`,
        )

      // Sales-only: fail-closed Service/Parts token scan across all categorical columns.
      for (const colName of CATEGORICAL_SERVICE_SCAN_COLUMNS) {
        const ci = ix(colName)
        if (ci < 0) continue
        const hits = data.filter((r) =>
          SERVICE_PARTS_TOKEN.test(g(r, ci)),
        ).length
        if (hits > 0)
          fail(
            'sales_only_scan',
            `${hits} rows carry a Service/Parts token in "${colName}"`,
          )
      }
    }
  } else if (
    isBuffer &&
    failures.every(
      (f) =>
        !['magic_bytes', 'workbook', 'sheet_name', 'single_sheet'].includes(
          f.check,
        ),
    )
  ) {
    fail('empty', 'workbook has no rows')
  }

  if (failures.length > 0) {
    return {
      status: 'quarantined',
      family: LEADS_FAMILY,
      reason: failures.map((f) => f.check).join(', '),
      failures,
      sha256,
    }
  }

  // Held. Expose (never fabricate) any absent provenance items as unproven gaps.
  const { gaps, needed } = evaluateProvenanceCompleteness(
    prov as unknown as Record<string, unknown>,
  )
  return {
    status: 'held',
    family: LEADS_FAMILY,
    profile,
    dealer_id: identity!.dealer_id,
    period: {
      start: prov.reporting_period.start,
      end: prov.reporting_period.end,
    },
    rows: prov.declared_rows,
    sha256: sha256!,
    checks_passed: [...LEADS_CLASSIFIER_CHECKS],
    provenance_gaps: gaps,
    provenance_needed: needed,
  }
}
