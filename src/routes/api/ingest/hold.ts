/**
 * POST /api/ingest/hold  — HOLD_ONLY / NO_ACTION landing edge (HUM-VIN-006 revised).
 *
 * The smallest contract Central MCP must call to land a VinSolutions delivery on
 * Andromeda through verified file landing ONLY. It preserves the original bytes
 * immutably, writes a provenance manifest, optionally stores a structural
 * transport payload, and returns a durable receipt. It NEVER computes a metric,
 * runs the Watchdog, populates a dashboard, evaluates a threshold, notifies, or
 * takes a customer action (see hold-store HARD GUARD).
 *
 * Contract:
 *   Auth : Authorization: Bearer <INGEST_SERVICE_SECRET>   (existing server-held auth)
 *   Body : {
 *            profile,                 // one of serra-honda | serra-nissan | tony-serra-ford
 *            filename,                // *.xlsx
 *            content_base64,          // strict base64 of the workbook bytes
 *            gmail_message_id,        // required transport metadata
 *            sender,                  // required
 *            subject,                 // required
 *            received_at?,            // ISO8601 (Gmail receive time)
 *            period_hint?,            // "YYYY-MM-DD" | "YYYY-MM-DD/YYYY-MM-DD"
 *            include_transport?       // store the structural transport payload too
 *          }
 *   Resp : 200 { ok:true, outcome:'held'|'replay', receipt } | 422 { ok:false, quarantined:true, ... }
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireJsonContentType } from '../../../server/rate-limit'
import { readStudioConfig } from '../../../server/studio-config'
import { resolveDealerName } from '../../../server/report-ingest'
import { decodeBase64Strict, verifyIngestSecret } from '../../../server/ingest-auth'
import { isHoldEligible, landDelivery, type HoldMetadata } from '../../../server/ingest/hold-store'

function receiptBody(r: ReturnType<typeof landDelivery>) {
  const m = r.manifest
  return {
    outcome: r.outcome,
    receipt_id: m.receipt_id,
    hold_only: m.hold_only,
    no_action: m.no_action,
    profile: m.profile,
    dealer: m.dealer,
    report_kind: m.report_kind,
    period: m.period,
    sha256: m.sha256,
    size_bytes: m.size_bytes,
    filename: m.filename,
    validation_state: m.validation_state,
    quarantine_reason: m.quarantine_reason,
    detail: m.detail,
    prior_sha256_in_period: m.prior_sha256_in_period,
    transport_stored: m.transport_stored,
    captured_at: m.captured_at,
    hold_path: r.hold_path,
    manifest_path: r.manifest_path,
    transport_path: r.transport_path,
  }
}

export const Route = createFileRoute('/api/ingest/hold')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ctCheck = requireJsonContentType(request)
        if (ctCheck) return ctCheck

        const auth = verifyIngestSecret(request)
        if (!auth.ok) return json({ ok: false, error: auth.error }, { status: auth.status })

        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
        const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string) : '')
        const profile = str('profile')
        const filename = str('filename')
        const contentBase64 = str('content_base64')

        if (!profile || !filename || !contentBase64) {
          return json({ ok: false, error: 'profile, filename, and content_base64 are required' }, { status: 400 })
        }
        // Only the three exact Serra profiles are supported.
        if (!isHoldEligible(profile)) {
          return json({ ok: false, error: `profile '${profile}' is not hold-eligible` }, { status: 403 })
        }
        if (!/\.xlsx$/i.test(filename)) {
          return json({ ok: false, error: 'only .xlsx deliveries are accepted' }, { status: 400 })
        }
        const buf = decodeBase64Strict(contentBase64)
        if (!buf) return json({ ok: false, error: 'content_base64 is not valid base64' }, { status: 400 })

        const { config } = readStudioConfig(profile)
        const profileDealer = resolveDealerName(config)

        const meta: HoldMetadata = {
          profile,
          filename,
          sender: str('sender'),
          subject: str('subject'),
          gmail_message_id: str('gmail_message_id'),
          received_at: str('received_at') || null,
          period_hint: str('period_hint') || null,
        }

        const receipt = landDelivery(buf, meta, {
          profileDealer,
          capturedAt: new Date().toISOString(),
          includeTransport: body.include_transport === true,
        })

        if (receipt.manifest.validation_state === 'quarantined') {
          return json({ ok: false, quarantined: true, ...receiptBody(receipt) }, { status: 422 })
        }
        return json({ ok: true, ...receiptBody(receipt) }, { status: 200 })
      },
    },
  },
})
