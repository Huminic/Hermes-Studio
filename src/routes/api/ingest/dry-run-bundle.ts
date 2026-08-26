/**
 * POST /api/ingest/dry-run-bundle — DEV-ONLY Response Times trio materialization edge.
 *
 * The real authenticated boundary for the dry-run bundle: it validates the server-held
 * secret via verifyIngestSecret (identical auth to /api/ingest/hold — a caller cannot
 * fake it with an arbitrary string), then atomically materializes the preserved raw +
 * PII-minimized derivative + immutable manifest into the ISOLATED dev reconcile inbound.
 * NEVER computes a metric, runs the Watchdog, or takes a customer action — it only
 * writes a trio directory for Claude's readback watcher.
 *
 * Hard-gated to dev: refuses unless env DRY_RUN_BUNDLE_ENABLED === "true" (only the
 * isolated dev instance sets it), and only ever writes under /srv/ingest-dev/dry-run.
 * Fail-closed on: bad auth; unknown/ineligible profile; unsafe capture_id/filenames;
 * wrong source host; envelope↔manifest field disagreement; rooftop/tz mismatch; any
 * sha256 disagreement (envelope vs recomputed vs manifest binding); collision on an
 * existing capture whose bytes/manifest differ.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireJsonContentType } from '../../../server/rate-limit'
import { decodeBase64Strict, verifyIngestSecret } from '../../../server/ingest-auth'
import { isHoldEligible } from '../../../server/ingest/hold-store'

const INBOUND = '/srv/ingest-dev/dry-run/inbound'
const VIN_HOST = 'vinsolutions.app.coxautoinc.com'
const GOVERNED: Record<string, string> = { 'serra-honda': '21043', 'serra-nissan': '21044', 'tony-serra-ford': '21047' }
const HEX64 = /^[0-9a-f]{64}$/
const SAFE_ID = /^[A-Za-z0-9_-]+$/ // no dots, no separators
const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(csv|json)$/ // simple filename, no leading dot, no separators
const sha256hex = (b: Buffer) => createHash('sha256').update(b).digest('hex')
const bad = (error: string, status = 400) => json({ ok: false, error }, { status })

export const Route = createFileRoute('/api/ingest/dry-run-bundle')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (process.env.DRY_RUN_BUNDLE_ENABLED !== 'true') return bad('dry-run bundle edge is disabled', 404)
        const ct = requireJsonContentType(request)
        if (ct) return ct
        const auth = verifyIngestSecret(request)
        if (!auth.ok) return json({ ok: false, error: auth.error }, { status: auth.status })

        const b = (await request.json().catch(() => ({}))) as Record<string, any>
        const profile = String(b.profile ?? '')
        const captureId = String(b.capture_id ?? '')
        const sourceUrl = String(b.source_url ?? '')
        const raw = b.raw ?? {}, der = b.derivative ?? {}, man = b.manifest
        const rawFile = String(raw.filename ?? '')
        const derFile = String(der.filename ?? '')

        // ── identity + path-safety ──
        if (!isHoldEligible(profile)) return bad(`profile '${profile}' not eligible`, 403)
        if (!SAFE_ID.test(captureId)) return bad('capture_id must match [A-Za-z0-9_-]+ (no dots/separators)')
        if (!SAFE_FILE.test(rawFile) || !SAFE_FILE.test(derFile)) return bad('unsafe raw/derivative filename')
        if (rawFile === 'manifest.v1.json' || derFile === 'manifest.v1.json') return bad('filename collides with manifest')
        let host: string | null = null
        try { host = new URL(sourceUrl).hostname.toLowerCase() } catch { host = null }
        if (host !== VIN_HOST) return bad('source_url host is not the VinSolutions app host', 403)
        if (!man || typeof man !== 'object') return bad('manifest required')

        // ── envelope ↔ manifest binding (do not trust one without the other) ──
        const rooftop = man.rooftop ?? {}, source = man.source ?? {}, cov = man.coverage ?? {}, dm = man.derivative ?? {}
        if (String(rooftop.profile ?? '') !== profile) return bad('manifest rooftop.profile != envelope profile')
        if (String(rooftop.vin_dealer_id ?? rooftop.dealer_id ?? '') !== GOVERNED[profile]) return bad('rooftop.vin_dealer_id != governed dealer id')
        if (String(cov.timezone ?? cov.tz ?? '') !== 'America/New_York') return bad('coverage.timezone != America/New_York')
        if (String(source.capture_id ?? '') !== captureId) return bad('manifest source.capture_id != envelope capture_id')
        if (String(source.source_url ?? source.final_url ?? '') !== sourceUrl) return bad('manifest source url != envelope source_url')
        if (String(source.raw_filename ?? '') !== rawFile) return bad('manifest source.raw_filename != envelope raw filename')
        if (String(dm.filename ?? '') !== derFile) return bad('manifest derivative.filename != envelope derivative filename')

        // ── decode + integrity: envelope sha == recomputed == manifest binding ──
        const rawBuf = decodeBase64Strict(String(raw.content_base64 ?? ''))
        const derBuf = decodeBase64Strict(String(der.content_base64 ?? ''))
        if (!rawBuf) return bad('raw content_base64 invalid')
        if (!derBuf) return bad('derivative content_base64 invalid')
        const rawSha = sha256hex(rawBuf), derSha = sha256hex(derBuf)
        const rawEnv = String(raw.sha256 ?? '').toLowerCase(), derEnv = String(der.sha256 ?? '').toLowerCase()
        const rawMan = String(source.raw_sha256 ?? '').toLowerCase(), derMan = String(dm.sha256 ?? '').toLowerCase()
        if (!HEX64.test(rawEnv) || rawSha !== rawEnv) return bad('raw sha256 != envelope')
        if (!HEX64.test(derEnv) || derSha !== derEnv) return bad('derivative sha256 != envelope')
        if (!HEX64.test(rawMan) || rawSha !== rawMan) return bad('raw sha256 != manifest binding')
        if (!HEX64.test(derMan) || derSha !== derMan) return bad('derivative sha256 != manifest binding')

        // ── target (isolated dev only) ──
        const target = path.join(INBOUND, profile, captureId)
        if (!target.startsWith(INBOUND + path.sep)) return bad('target escapes inbound', 403)

        // ── idempotent: identical bytes+manifest → no-op; different → COLLISION refuse ──
        if (fs.existsSync(target)) {
          try {
            const exRaw = fs.readFileSync(path.join(target, rawFile))
            const exDer = fs.readFileSync(path.join(target, derFile))
            const exMan = fs.readFileSync(path.join(target, 'manifest.v1.json'), 'utf8')
            const same = sha256hex(exRaw) === rawSha && sha256hex(exDer) === derSha && exMan === JSON.stringify(man, null, 2)
            if (same) return json({ ok: true, status: 'idempotent_skip', profile, capture_id: captureId, target, raw_sha256: rawSha, derivative_sha256: derSha }, { status: 200 })
            return bad('capture_id collision: existing delivery differs (bytes/manifest)', 409)
          } catch {
            return bad('capture_id collision: existing target unreadable', 409)
          }
        }

        // ── atomic write (temp dir + rename; watcher never sees a partial trio) ──
        const tmp = path.join(INBOUND, profile, `.tmp-${captureId}-${process.pid}-${process.hrtime.bigint()}`)
        try {
          fs.mkdirSync(tmp, { recursive: true })
          fs.writeFileSync(path.join(tmp, rawFile), rawBuf)
          fs.writeFileSync(path.join(tmp, derFile), derBuf)
          fs.writeFileSync(path.join(tmp, 'manifest.v1.json'), JSON.stringify(man, null, 2))
          fs.mkdirSync(path.dirname(target), { recursive: true })
          fs.renameSync(tmp, target)
        } catch (e) {
          try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
          return bad('materialize error: ' + String((e as Error).message).slice(0, 120), 500)
        }
        return json({ ok: true, status: 'materialized', profile, capture_id: captureId, target, raw_sha256: rawSha, derivative_sha256: derSha, raw_bytes: rawBuf.length, derivative_bytes: derBuf.length }, { status: 200 })
      },
    },
  },
})
