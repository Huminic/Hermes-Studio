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
import { decodeBase64Strict, verifyIngestSecret } from '../../../server/ingest-auth'
import { isHoldEligible, landDelivery, type HoldMetadata } from '../../../server/ingest/hold-store'

/** Profile dealer name (inlined to keep this route free of Brain-coupled report-ingest). */
function resolveProfileDealer(config: { vin?: { watcher?: { dealer_name?: string } }; branding?: { persona_name?: string } }): string {
  return config.vin?.watcher?.dealer_name?.trim() || config.branding?.persona_name?.trim() || ''
}

function receiptBody(r: ReturnType<typeof landDelivery>) {
  const m = r.manifest
  return {
    outcome: r.outcome,
    receipt_id: m.receipt_id,
    hold_only: m.hold_only,
    no_action: m.no_action,
    profile: m.profile,
    dealer: m.dealer,
    source_type: m.source_type,
    capture_id: m.capture_id,
    source_url: m.source_url,
    declared_report_kind: m.declared_report_kind,
    report_kind: m.report_kind,
    period: m.period,
    sha256: m.sha256,
    size_bytes: m.size_bytes,
    filename: m.filename,
    file_extension: m.file_extension,
    media_type: m.media_type,
    structural_transform: m.structural_transform,
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
        // Every VinSolutions source file must reach the inert holding point. The
        // format (.xlsx/.csv/.pdf) and any unknown-format/MIME-mismatch quarantine
        // (with byte retention) are decided by landDelivery — never rejected here.
        const buf = decodeBase64Strict(contentBase64)
        if (!buf) return json({ ok: false, error: 'content_base64 is not valid base64' }, { status: 400 })

        const { config } = readStudioConfig(profile)
        const profileDealer = resolveProfileDealer(config)

        // Pass source_type through verbatim (including an unknown value) so the
        // provenance gate in landDelivery fails closed rather than silent-coercing.
        const sourceTypeRaw = str('source_type')
        const meta: HoldMetadata = {
          profile,
          filename,
          source_type: (sourceTypeRaw || undefined) as HoldMetadata['source_type'],
          sender: str('sender') || undefined,
          subject: str('subject') || undefined,
          gmail_message_id: str('gmail_message_id') || undefined,
          capture_id: str('capture_id') || undefined,
          source_url: str('source_url') || undefined,
          declared_report_kind: str('declared_report_kind') || undefined,
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
