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
  isIngestEligible,
  parsePeriodHint,
  verifyIngestSecret,
} from '../../../server/ingest-auth'

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

        // 5. decode + shape checks
        if (!/\.csv$/i.test(filename)) {
          return json(
            { ok: false, error: 'only .csv reports are accepted' },
            { status: 400 },
          )
        }
        let text: string
        try {
          text = Buffer.from(contentBase64, 'base64').toString('utf8')
        } catch {
          return json(
            { ok: false, error: 'content_base64 is not valid base64' },
            { status: 400 },
          )
        }

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
