/**
 * POST /api/ingest/report
 *
 * Service-to-service report ingestion for the automated VinSolutions →
 * InfoStore pipeline. Called by central-mcp's `studio_ingest_report` tool
 * (which holds the shared secret); external callers (Codex, later a Cloudflare
 * Worker) are governed by their MCP token allowlist upstream.
 *
 * Contract:
 *   Auth : Authorization: Bearer <INGEST_SERVICE_SECRET>   (fail-closed)
 *   Body : { profile, filename, content_base64, period_hint? }
 *   Resp : { ok, profile, dealer, period, rows_ingested,
 *            recognized_columns, ignored_columns[], warnings[] }  | { ok:false, error }
 *
 * Design: lenient on shape / strict on meaning / lossless.
 *   - Unknown columns are ignored but reported (`ignored_columns`) — drift never breaks ingest.
 *   - A non-VIN / unrecognized CSV is rejected (never a silent 0-row "success").
 *   - The raw file is retained via handleUpload regardless of parse outcome.
 *   - period_hint carries the true coverage window (retires the filename-date scrape).
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireJsonContentType } from '../../../server/rate-limit'
import { handleUpload } from '../../../server/upload-surface'
import { readStudioConfig } from '../../../server/studio-config'
import {
  classifyHeaders,
  ingestReport,
  parseCsv,
  resolveDealerName,
} from '../../../server/report-ingest'
import {
  INGEST_ACTOR,
  decodeBase64Strict,
  isIngestEligible,
  parsePeriodHint,
  verifyIngestSecret,
} from '../../../server/ingest-auth'
import { readXlsx } from '../../../server/ingest/xlsx-reader'
import { PARSER_VERSION, evaluateDelivery } from '../../../server/ingest/vin-contracts'
import { recordDelivery } from '../../../server/ingest/ingest-delivery-store'

/**
 * XLSX delivery: retain raw (lossless) → classify + Sales-only quarantine
 * (fail-closed) → record provenance (dup no-op / transactional supersession).
 * A malformed workbook or any quarantine yields NO accepted metrics/actions.
 */
async function handleXlsxDelivery(
  profile: string,
  filename: string,
  contentBase64: string,
): Promise<Response> {
  const buf = decodeBase64Strict(contentBase64)
  if (!buf) return json({ ok: false, error: 'content_base64 is not valid base64' }, { status: 400 })

  // Lossless raw retention regardless of parse/quarantine outcome.
  const up = await handleUpload({
    profile,
    actor: INGEST_ACTOR,
    filename,
    content: contentBase64,
    classification: 'data',
  })
  if (!up.ok) return json({ ok: false, error: up.reason, rule: up.rule }, { status: 400 })

  const { config } = readStudioConfig(profile)
  const profileDealer = resolveDealerName(config)
  const now = Date.now()

  // Malformed ZIP/XML / caps exceeded → fail-closed quarantine (still recorded).
  let sheets
  try {
    sheets = readXlsx(buf).sheets
  } catch (err) {
    const rec = recordDelivery(
      {
        profile, dealer: profileDealer, report_kind: 'unknown',
        period_start: null, period_end: null, source_filename: filename,
        source_filter_metadata: null, final_filter_metadata: null,
        checksum: up.checksum, parser_version: PARSER_VERSION,
        source_row_count: 0, accepted_row_count: 0, header: [],
        validation_evidence: { error: (err as Error).message },
        status: 'quarantined', quarantine_reason: 'malformed-workbook',
      },
      [],
      now,
    )
    return json(
      { ok: false, quarantined: true, reason: 'malformed-workbook', error: (err as Error).message, delivery_id: rec.id, upload_id: up.id },
      { status: 422 },
    )
  }

  const evalResult = evaluateDelivery(sheets, { profileDealer })

  if (evalResult.status === 'quarantined') {
    const rec = recordDelivery(
      {
        profile, dealer: profileDealer, report_kind: evalResult.kind ?? 'unknown',
        period_start: null, period_end: null, source_filename: filename,
        source_filter_metadata: evalResult.evidence, final_filter_metadata: null,
        checksum: up.checksum, parser_version: PARSER_VERSION,
        source_row_count: evalResult.source_row_count, accepted_row_count: 0, header: [],
        validation_evidence: evalResult.evidence,
        status: 'quarantined', quarantine_reason: evalResult.reason,
      },
      [],
      now,
    )
    return json(
      { ok: false, quarantined: true, reason: evalResult.reason, detail: evalResult.detail, kind: evalResult.kind, delivery_id: rec.id, upload_id: up.id },
      { status: 422 },
    )
  }

  const rec = recordDelivery(
    {
      profile, dealer: evalResult.dealer, report_kind: evalResult.kind,
      period_start: evalResult.period.start, period_end: evalResult.period.end,
      source_filename: filename,
      source_filter_metadata: evalResult.filters?.raw ?? null,
      final_filter_metadata: evalResult.filters
        ? { dealers: evalResult.filters.dealers, leadTypes: evalResult.filters.leadTypes, leadIntents: evalResult.filters.leadIntents }
        : null,
      checksum: up.checksum, parser_version: PARSER_VERSION,
      source_row_count: evalResult.source_row_count, accepted_row_count: evalResult.accepted_row_count,
      header: evalResult.header,
      validation_evidence: evalResult.evidence, status: 'accepted', quarantine_reason: null,
    },
    evalResult.rows,
    now,
  )
  return json({
    ok: true,
    kind: evalResult.kind,
    dealer: evalResult.dealer,
    period: evalResult.period,
    source_row_count: evalResult.source_row_count,
    accepted_row_count: rec.accepted_rows,
    schedule_vulnerability: evalResult.schedule_vulnerability,
    outcome: rec.outcome,
    revision: rec.revision,
    superseded: rec.superseded,
    delivery_id: rec.id,
    upload_id: up.id,
  })
}

export const Route = createFileRoute('/api/ingest/report')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // 1. content-type guard (rejects form-encoded CSRF-style posts)
        const ctCheck = requireJsonContentType(request)
        if (ctCheck) return ctCheck

        // 2. service secret — fail closed
        const auth = verifyIngestSecret(request)
        if (!auth.ok) {
          return json({ ok: false, error: auth.error }, { status: auth.status })
        }

        // 3. body
        const body = (await request.json().catch(() => ({}))) as Record<
          string,
          unknown
        >
        const profile = typeof body.profile === 'string' ? body.profile : ''
        const filename = typeof body.filename === 'string' ? body.filename : ''
        const contentBase64 =
          typeof body.content_base64 === 'string' ? body.content_base64 : ''
        if (!profile || !filename || !contentBase64) {
          return json(
            {
              ok: false,
              error: 'profile, filename, and content_base64 are required',
            },
            { status: 400 },
          )
        }

        // 4. profile allowlist — scope guard
        if (!isIngestEligible(profile)) {
          return json(
            { ok: false, error: `profile '${profile}' is not ingest-eligible` },
            { status: 403 },
          )
        }

        // 5. XLSX six-family delivery path (Sales-only quarantine + provenance).
        //    CSV path (below) is retained unchanged for backward compatibility.
        if (/\.xlsx$/i.test(filename)) {
          return await handleXlsxDelivery(profile, filename, contentBase64)
        }
        if (!/\.csv$/i.test(filename)) {
          return json(
            { ok: false, error: 'only .csv or .xlsx reports are accepted' },
            { status: 400 },
          )
        }
        const decoded = decodeBase64Strict(contentBase64)
        if (!decoded) {
          return json(
            { ok: false, error: 'content_base64 is not valid base64' },
            { status: 400 },
          )
        }
        const text = decoded.toString('utf8')

        // 6. header sanity — must look like a VIN ROI/KPI export
        const firstRow = parseCsv(text)[0] ?? []
        const { kind, recognized, ignored } = classifyHeaders(firstRow)
        if (!kind) {
          return json(
            {
              ok: false,
              error:
                'unrecognized report — expected a VinSolutions Lead Source ROI or salesperson KPI export',
              ignored_columns: ignored,
            },
            { status: 422 },
          )
        }

        const warnings: Array<string> = []
        const { periodStart, periodEnd, warning } = parsePeriodHint(
          body.period_hint,
        )
        if (warning) warnings.push(warning)
        if (ignored.length > 0) {
          warnings.push(
            `${ignored.length} unrecognized column(s) ignored (retained in raw upload): ${ignored.join(', ')}`,
          )
        }

        // 7. lossless raw retention (governed upload path)
        const up = await handleUpload({
          profile,
          actor: INGEST_ACTOR,
          filename,
          content: contentBase64,
          classification: 'data',
        })
        if (!up.ok) {
          return json(
            { ok: false, error: up.reason, rule: up.rule },
            { status: 400 },
          )
        }

        // 8. structured ingest (known columns → dashboard tables)
        const { config } = readStudioConfig(profile)
        const dealerName = resolveDealerName(config)
        const ing = ingestReport({
          profile,
          text,
          filename,
          dealerName,
          sourceUploadId: up.id,
          checksum: up.checksum,
          periodStart,
          periodEnd,
        })
        if (!ing.ok) {
          return json(
            {
              ok: false,
              error: ing.reason,
              rule: ing.rule,
              recognized_columns: recognized,
              ignored_columns: ignored,
            },
            { status: 422 },
          )
        }

        const period =
          periodStart && periodEnd
            ? periodStart === periodEnd
              ? periodStart
              : `${periodStart}/${periodEnd}`
            : null
        if (ing.dealers_in_file.length > 1) {
          warnings.push(
            `report contained ${ing.dealers_in_file.length} dealers; ingested only rows matching '${ing.dealer}'`,
          )
        }

        return json({
          ok: true,
          profile,
          dealer: ing.dealer,
          report_kind: ing.report_kind,
          period,
          rows_ingested: ing.row_count,
          recognized_columns: recognized,
          ignored_columns: ignored,
          dealers_in_file: ing.dealers_in_file,
          replaced_prior: ing.replaced_prior,
          upload_id: up.id,
          warnings,
        })
      },
    },
  },
})
