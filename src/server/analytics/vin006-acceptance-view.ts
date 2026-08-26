/**
 * HUM-VIN-006 acceptance — bounded, isolated DEV-only read adapter (hardened).
 *
 * Reads ONLY the promoted, isolated analytics namespace (a directory whose basename is
 * `analytics`; never `/`, the hold/dry-run volumes, or a production brain root). Exposes:
 *   - the corrected Response Times readback (v2 schema, accepted verdict, exact profile/dealer
 *     binding, coverage + metrics present, immutable 0444) — else the family is withheld;
 *   - the currently-accepted native families from the profile's brain.db.
 * Missing / quarantined / withheld families are 'withheld' (RT 'unavailable') — NEVER zero-filled.
 * Only the three governed Sales profiles are accepted. No promotion, reclassification, or dispatch.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { listDeliveries, countActiveRows } from '../ingest/ingest-delivery-store'

export class AcceptanceViewAbort extends Error {}

export const GOVERNED_DEALERS: Record<string, string> = { 'serra-honda': '21043', 'serra-nissan': '21044', 'tony-serra-ford': '21047' }
export const GOVERNED_FAMILIES = ['sales_comm_log', 'cage_kpi', 'lead_source_roi', 'dealership_performance', 'crm_sales_gross', 'appointments'] as const
const RT_SCHEMA_V2 = 'huminic.vinsolutions.response_times.analytics_readback.v2'
const ALLOWED_RECIPIENT = 'duanewells@icloud.com'
const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_')

function assertGovernedProfile(profile: string): string {
  const gov = GOVERNED_DEALERS[profile]
  if (!gov) throw new AcceptanceViewAbort(`profile "${profile}" is not a governed Sales profile`)
  return gov
}

/** Bind to the isolated analytics namespace; reject `/`, hold, dry-run, and production roots. */
function assertRoot(root: string): void {
  if (!root || !path.isAbsolute(root)) throw new AcceptanceViewAbort('analyticsRoot must be an absolute path')
  const a = path.resolve(root)
  if (a === '/' || a === path.parse(a).root) throw new AcceptanceViewAbort('analyticsRoot must not be a filesystem root')
  if (path.basename(a) !== 'analytics') throw new AcceptanceViewAbort('analyticsRoot must be an "analytics" namespace directory')
  const segments = a.split(path.sep)
  if (segments.includes('hold') || segments.includes('dry-run') || segments.includes('inbound') || segments.includes('readback')) throw new AcceptanceViewAbort('analyticsRoot must not overlap the hold/dry-run volumes')
  for (const m of [path.join(os.homedir(), '.hermes'), '/root/.hermes']) {
    const mr = path.resolve(m)
    if (a === mr || a.startsWith(mr + path.sep)) throw new AcceptanceViewAbort(`analyticsRoot must not be a production brain root (${m})`)
  }
}

export type FamilyStatus = 'accepted' | 'withheld'
export type NativeFamily = { family: string; status: FamilyStatus; period?: { start: string | null; end: string | null }; accepted_rows?: number; note?: string }
export type RtView = { status: 'accepted' | 'unavailable'; period?: { start: string; end: string }; metrics?: Record<string, unknown>; provenance?: Record<string, unknown>; note?: string }
export type AcceptanceView = { profile: string; response_times: RtView; natives: Array<NativeFamily> }

export function buildAcceptanceView(profile: string, opts: { analyticsRoot: string }): AcceptanceView {
  const gov = assertGovernedProfile(profile)
  assertRoot(opts.analyticsRoot)
  const perProfile = path.join(opts.analyticsRoot, safe(profile))

  // ── Response Times: surface ONLY a fully-valid, immutable, corrected v2 readback ──
  let response_times: RtView = { status: 'unavailable', note: 'no accepted Response Times readback — withheld, not zero' }
  const rtDir = path.join(perProfile, 'response-times')
  if (fs.existsSync(rtDir)) {
    const periods = fs.readdirSync(rtDir).filter((d) => fs.existsSync(path.join(rtDir, d, 'readback.json'))).sort()
    const p = periods[periods.length - 1]
    if (p) {
      const rbPath = path.join(rtDir, p, 'readback.json')
      const withhold = (why: string): RtView => ({ status: 'unavailable', note: `Response Times withheld: ${why}` })
      try {
        if ((fs.statSync(rbPath).mode & 0o777) !== 0o444) response_times = withhold('readback is not immutable (0444)')
        else {
          const rb = JSON.parse(fs.readFileSync(rbPath, 'utf8')) as Record<string, any>
          const prov = rb.provenance ?? {}, cov = prov.coverage ?? {}
          if (String(prov.analytics_schema) !== RT_SCHEMA_V2) response_times = withhold('not the corrected v2 schema')
          else if (String(prov.readback_verdict) !== 'accepted') response_times = withhold('readback verdict is not accepted')
          else if (String(prov.profile) !== profile) response_times = withhold('profile binding mismatch')
          else if (String(prov.vin_dealer_id) !== gov) response_times = withhold('dealer-id binding mismatch')
          else if (!cov.start || !cov.end) response_times = withhold('missing coverage')
          else if (!rb.metrics || typeof rb.metrics !== 'object') response_times = withhold('missing metrics object')
          else response_times = {
            status: 'accepted', period: { start: String(cov.start), end: String(cov.end) }, metrics: rb.metrics,
            provenance: { analytics_schema: prov.analytics_schema, capture_id: prov.capture_id, derivative_sha256: prov.derivative_sha256, vin_dealer_id: prov.vin_dealer_id, metric_units: prov.metric_units, readback_verdict: prov.readback_verdict, supersedes: prov.supersedes ?? null },
          }
        }
      } catch (e) { response_times = withhold(`unreadable (${String((e as Error).message).slice(0, 60)})`) }
    }
  }

  // ── accepted native families (brain.db; only Sales-only accepted deliveries land here) ──
  const deliveries = listDeliveries(profile, { profileRoot: perProfile }) as Array<Record<string, unknown>>
  const acceptedByKind = new Map<string, Record<string, unknown>>()
  for (const d of deliveries) {
    if (d.status === 'accepted' && (d.superseded_by === null || d.superseded_by === undefined)) acceptedByKind.set(String(d.report_kind), d)
  }
  const natives: Array<NativeFamily> = GOVERNED_FAMILIES.map((family) => {
    const d = acceptedByKind.get(family)
    if (d) return { family, status: 'accepted', period: { start: (d.period_start as string) ?? null, end: (d.period_end as string) ?? null }, accepted_rows: countActiveRows(profile, { report_kind: family, profileRoot: perProfile }) }
    return { family, status: 'withheld', note: 'missing or quarantined under the current Sales-only contract — withheld, not zero' }
  })

  return { profile, response_times, natives }
}

/** Metric names that legitimately exist in a profile's accepted view (RT metric keys + accepted natives). */
export function acceptedMetricNames(view: AcceptanceView): Set<string> {
  const set = new Set<string>()
  if (view.response_times.status === 'accepted' && view.response_times.metrics) for (const k of Object.keys(view.response_times.metrics)) set.add(k)
  for (const n of view.natives) if (n.status === 'accepted') { set.add(n.family); set.add(`${n.family}_accepted_rows`) }
  return set
}

// ── inert notification RECORD (no dispatch path is ever invoked) ──
export type InertNotificationInput = { profile: string; metric: string; recipient: string; analyticsRoot: string; now?: string | null }
export type InertNotificationRecord = { schema: string; profile: string; metric: string; recipient: string; channel: 'email'; dispatch: 'disabled'; outbound_gate: string; created_at: string | null; note: string }

const SCHEMA = 'huminic.vin006.inert_notification.v1'
const OUTBOUND_GATE = 'OUTBOUND_LIVE_ENABLED must equal "true" (unset here) — no send invoked'
const NOTE = 'RECORD ONLY — created via the dev acceptance surface; no dispatch/comms-gate/notifyDealer path was invoked'
/** Identity + policy invariants (created_at is deliberately excluded). */
const invariantOf = (r: InertNotificationRecord) => JSON.stringify({ schema: r.schema, profile: r.profile, metric: r.metric, recipient: r.recipient, channel: r.channel, dispatch: r.dispatch, outbound_gate: r.outbound_gate })

/**
 * Persist ONE inert notification record for a metric present in the profile's accepted view.
 * Recipient is restricted to the single acceptance address. Never calls notifyDealer / the
 * comms-gate / any send path. Atomic immutable (0444) write. Idempotent by (profile,metric,
 * recipient): a byte-invariant match is a duplicate (original created_at preserved); any
 * invariant divergence fails closed.
 */
export function recordInertNotification(input: InertNotificationInput): { id: string; record: InertNotificationRecord; path: string; outcome: 'recorded' | 'duplicate' } {
  assertGovernedProfile(input.profile)
  assertRoot(input.analyticsRoot)
  if (input.recipient !== ALLOWED_RECIPIENT) throw new AcceptanceViewAbort(`recipient must be ${ALLOWED_RECIPIENT}`)
  const view = buildAcceptanceView(input.profile, { analyticsRoot: input.analyticsRoot })
  if (!acceptedMetricNames(view).has(input.metric)) throw new AcceptanceViewAbort(`metric "${input.metric}" is not present in ${input.profile} accepted view`)

  const dir = path.join(input.analyticsRoot, safe(input.profile), 'notifications', 'inert')
  fs.mkdirSync(dir, { recursive: true })
  const id = createHash('sha256').update(`${input.profile} ${input.metric} ${input.recipient}`).digest('hex').slice(0, 16)
  const p = path.join(dir, `${id}.json`)
  const record: InertNotificationRecord = { schema: SCHEMA, profile: input.profile, metric: input.metric, recipient: input.recipient, channel: 'email', dispatch: 'disabled', outbound_gate: OUTBOUND_GATE, created_at: input.now ?? null, note: NOTE }

  if (fs.existsSync(p)) {
    const existing = JSON.parse(fs.readFileSync(p, 'utf8')) as InertNotificationRecord
    if (invariantOf(existing) === invariantOf(record)) return { id, record: existing, path: p, outcome: 'duplicate' } // preserve original created_at
    throw new AcceptanceViewAbort('conflict: an inert notification with this id exists with different invariant fields')
  }
  // atomic immutable write
  const tmp = p + `.tmp-${process.pid}-${process.hrtime.bigint()}`
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2)); fs.chmodSync(tmp, 0o444); fs.renameSync(tmp, p)
  return { id, record, path: p, outcome: 'recorded' }
}
