import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { recordDelivery, type DeliveryInput } from '@/server/ingest/ingest-delivery-store'
import { buildAcceptanceView, recordInertNotification, AcceptanceViewAbort, GOVERNED_FAMILIES, GOVERNED_DEALERS } from '@/server/analytics/vin006-acceptance-view'

let tmp: string, analyticsRoot: string
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'accept-view-')); analyticsRoot = path.join(tmp, 'analytics') })
afterEach(() => { try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ } })

const perProfile = (p: string) => path.join(analyticsRoot, p)
function seedNative(profile: string, kind: string, nRows: number, status: 'accepted' | 'quarantined') {
  const input: DeliveryInput = {
    profile, dealer: 'Serra Honda', report_kind: kind as any, period_start: '2026-08-17', period_end: '2026-08-23',
    source_filename: `${kind}.xlsx`, source_filter_metadata: null, final_filter_metadata: null, checksum: `${profile}-${kind}-${status}`,
    parser_version: 'vin-xlsx-1', source_row_count: nRows, accepted_row_count: status === 'accepted' ? nRows : 0,
    header: ['a', 'b'], validation_evidence: {}, status, quarantine_reason: status === 'quarantined' ? 'non-sales-lead-type' : null,
  }
  recordDelivery(input, Array.from({ length: nRows }, (_, i) => [`r${i}`, 'x']), 1, { profileRoot: perProfile(profile) })
}
function seedRt(profile: string, over: Record<string, any> = {}, opts: { mode?: number } = {}) {
  const dir = path.join(perProfile(profile), 'response-times', '2026-08-17_2026-08-23')
  fs.mkdirSync(dir, { recursive: true })
  const p = path.join(dir, 'readback.json')
  const body = JSON.stringify({
    provenance: { analytics_schema: 'huminic.vinsolutions.response_times.analytics_readback.v2', capture_id: 'cap-' + profile, derivative_sha256: 'x'.repeat(64), profile, vin_dealer_id: GOVERNED_DEALERS[profile], metric_units: {}, readback_verdict: 'accepted', coverage: { start: '2026-08-17', end: '2026-08-23' }, ...over.provenance },
    metrics: 'metrics' in over ? over.metrics : { leads_total: 57, response_time_actual_median_min: 2117.73 },
  }, null, 2)
  fs.writeFileSync(p, body); fs.chmodSync(p, opts.mode ?? 0o444)
  return p
}

describe('buildAcceptanceView — governance + surfacing guards', () => {
  it('exposes accepted natives + valid immutable v2 RT; missing families withheld (never zero)', () => {
    seedNative('serra-honda', 'dealership_performance', 40, 'accepted')
    seedNative('serra-honda', 'appointments', 18, 'accepted')
    seedRt('serra-honda')
    const v = buildAcceptanceView('serra-honda', { analyticsRoot })
    expect(v.response_times.status).toBe('accepted')
    const byFam = Object.fromEntries(v.natives.map((n) => [n.family, n]))
    expect(byFam.dealership_performance.accepted_rows).toBe(40)
    expect(byFam.appointments.accepted_rows).toBe(18)
    for (const fam of ['sales_comm_log', 'cage_kpi', 'lead_source_roi', 'crm_sales_gross']) { expect(byFam[fam].status).toBe('withheld'); expect(byFam[fam].accepted_rows).toBeUndefined() }
    expect(v.natives).toHaveLength(GOVERNED_FAMILIES.length)
  })

  it('rejects ungoverned/arbitrary profiles (a service/other family cannot surface)', () => {
    for (const bad of ['serra-service', 'serra-parts', 'evil', '../etc']) expect(() => buildAcceptanceView(bad, { analyticsRoot })).toThrow(AcceptanceViewAbort)
  })

  it('Service/Parts fail-closed: a quarantined native surfaces as WITHHELD, not accepted/zero', () => {
    seedNative('serra-honda', 'lead_source_roi', 3, 'quarantined')
    const roi = buildAcceptanceView('serra-honda', { analyticsRoot }).natives.find((n) => n.family === 'lead_source_roi')!
    expect(roi.status).toBe('withheld'); expect(roi.accepted_rows).toBeUndefined()
  })

  it('withholds RT unless v2 schema + accepted verdict + profile/dealer + coverage + metrics + immutable', () => {
    const chk = (over: Record<string, any>, mode?: number) => { fs.rmSync(perProfile('serra-honda'), { recursive: true, force: true }); seedRt('serra-honda', over, { mode }); return buildAcceptanceView('serra-honda', { analyticsRoot }).response_times.status }
    expect(chk({})).toBe('accepted')
    expect(chk({}, 0o644)).toBe('unavailable')                                       // not immutable
    expect(chk({ provenance: { analytics_schema: 'v1' } })).toBe('unavailable')       // wrong schema
    expect(chk({ provenance: { readback_verdict: 'quarantined' } })).toBe('unavailable')
    expect(chk({ provenance: { vin_dealer_id: '99999' } })).toBe('unavailable')       // dealer mismatch
    expect(chk({ provenance: { profile: 'serra-nissan' } })).toBe('unavailable')      // profile mismatch
    expect(chk({ metrics: null })).toBe('unavailable')                               // no metrics
  })

  it('binds the root to the analytics namespace; rejects /, hold, dry-run, production, non-analytics', () => {
    // assertRoot throws before touching the fs, so the paths need not exist
    const bad = ['/', path.join(tmp, 'hold'), path.join(tmp, 'dry-run'), path.join(tmp, 'inbound', 'x', 'analytics'), path.join(os.homedir(), '.hermes', 'profiles'), path.join(tmp, 'notanalytics'), 'relative/analytics']
    for (const r of bad) expect(() => buildAcceptanceView('serra-honda', { analyticsRoot: r }), r).toThrow(AcceptanceViewAbort)
  })
})

describe('recordInertNotification — hardened', () => {
  beforeEach(() => { seedNative('serra-honda', 'appointments', 18, 'accepted'); seedRt('serra-honda') })
  const rec = (over: Partial<{ metric: string; recipient: string; now: string | null }> = {}) =>
    recordInertNotification({ profile: 'serra-honda', metric: over.metric ?? 'appointments_accepted_rows', recipient: over.recipient ?? 'duanewells@icloud.com', analyticsRoot, now: over.now ?? '2026-08-26T00:00:00Z' })

  it('records an inert 0444 notification (no dispatch) for an in-view metric', () => {
    const r = rec()
    expect(r.outcome).toBe('recorded')
    expect(r.record.dispatch).toBe('disabled')
    expect(fs.statSync(r.path).mode & 0o777).toBe(0o444)
  })

  it('duplicate only on invariant match, preserving the ORIGINAL created_at (new timestamp is not a conflict)', () => {
    const first = rec({ now: '2026-08-26T00:00:00Z' })
    const again = rec({ now: '2026-08-27T11:11:11Z' }) // different timestamp, same invariants
    expect(again.outcome).toBe('duplicate')
    expect(again.record.created_at).toBe('2026-08-26T00:00:00Z') // original preserved
    expect(fs.readdirSync(path.dirname(first.path))).toHaveLength(1) // exactly one record
  })

  it('fails closed on an invariant conflict at the same id', () => {
    const first = rec()
    fs.chmodSync(first.path, 0o644)
    const tampered = JSON.parse(fs.readFileSync(first.path, 'utf8')); tampered.dispatch = 'enabled' // policy invariant changed
    fs.writeFileSync(first.path, JSON.stringify(tampered))
    expect(() => rec()).toThrow(/conflict/i)
  })

  it('restricts recipient to the single acceptance address', () => {
    expect(() => rec({ recipient: 'someone@else.com' })).toThrow(AcceptanceViewAbort)
    expect(() => rec({ recipient: 'not-an-email' })).toThrow(AcceptanceViewAbort)
  })

  it('rejects a metric not present in the accepted view', () => {
    expect(() => rec({ metric: 'made_up_metric' })).toThrow(/not present/)
    expect(() => rec({ metric: 'lead_source_roi_accepted_rows' })).toThrow(/not present/) // withheld family
  })

  it('rejects ungoverned profiles / production roots', () => {
    expect(() => recordInertNotification({ profile: 'evil', metric: 'm', recipient: 'duanewells@icloud.com', analyticsRoot })).toThrow(AcceptanceViewAbort)
    expect(() => recordInertNotification({ profile: 'serra-honda', metric: 'appointments_accepted_rows', recipient: 'duanewells@icloud.com', analyticsRoot: path.join(os.homedir(), '.hermes', 'profiles') })).toThrow(AcceptanceViewAbort)
  })
})
