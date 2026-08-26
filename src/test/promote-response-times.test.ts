import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { promoteResponseTimesToAnalytics, RtPromoteAbort, parseCsv } from '@/server/analytics/promote-response-times'

const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex')
let tmp: string, dry: string, analytics: string
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-promote-')); dry = path.join(tmp, 'dry-run'); analytics = path.join(tmp, 'analytics') })
afterEach(() => { try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ } })

const CAP = 'vinsolutions-response-times-serra-honda-20260824T151507-0400-1618b9c1'
// Real-shape derivative: responseTimeActual/Adjusted are EXCEL-DAY fractions; target is categorical.
const HEADER = 'derivative_version,vin_dealer_id,activityDateTimeUtc,lead.id,responseTimeActual,responseTimeAdjusted,responseTimeTarget,soldDateUtc,appointmentUtc,unansweredCommunication.taskAgeInDays'
const REAL = [
  HEADER,
  'v,21043,2026-08-18T13:00:00Z,111,0.005,0.005,Target 1,2026-08-19T00:00:00Z,,',   // 7.2min / 7.2min, sold
  'v,21043,2026-08-19T14:00:00Z,222,0.5,0.01,Missed,,2026-08-20T15:00:00Z,3',        // 720min / 14.4min, appt, unanswered
  'v,21043,2026-08-20T15:00:00Z,333,,,No Contact,,,',                                 // no response
].join('\n') + '\n'

type Ov = { verdict?: string; rbProfile?: string; derivative?: string; man?: Record<string, any>; computed?: Record<string, any> }
function seed(profile: string, captureId: string, o: Ov = {}) {
  const derivative = o.derivative ?? REAL
  const derBuf = Buffer.from(derivative, 'utf8'); const derSha = sha256(derBuf)
  const dataRows = parseCsv(derivative).length - 1
  const capDir = path.join(dry, 'inbound', profile, captureId); fs.mkdirSync(capDir, { recursive: true })
  fs.writeFileSync(path.join(capDir, 'response-times-canonical-v1.csv'), derBuf)
  const man = {
    schema_version: 'huminic.vinsolutions.response_times_derivative_manifest.v1',
    derivative_version: 'huminic.vinsolutions.response_times.canonical.v1',
    validation: { state: 'ready_for_isolated_dev' },
    rooftop: { profile, vin_dealer_id: '21043', name: 'Serra Honda of Sylacauga' },
    source: { capture_id: captureId },
    coverage: { start: '2026-08-17', end: '2026-08-23', timezone: 'America/New_York', reconciles: true, total_rows: dataRows, accepted_rows: dataRows, excluded_out_of_window: 0 },
    derivative: { filename: 'response-times-canonical-v1.csv', sha256: derSha },
    ...(o.man ?? {}),
  }
  fs.writeFileSync(path.join(capDir, 'manifest.v1.json'), JSON.stringify(man, null, 2))
  const rbDir = path.join(dry, 'readback', profile); fs.mkdirSync(rbDir, { recursive: true })
  fs.writeFileSync(path.join(rbDir, `${captureId}.readback.json`), JSON.stringify({
    verdict: o.verdict ?? 'accepted', profile: o.rbProfile ?? profile,
    computed: { raw_sha256: 'raw', derivative_sha256: derSha, derivative_rows: dataRows, ...(o.computed ?? {}) },
  }, null, 2))
  return { derSha }
}
const promote = (profile: string, captureId: string) => promoteResponseTimesToAnalytics({ dryRunRoot: dry, analyticsRoot: analytics, profile, captureId })

describe('promoteResponseTimesToAnalytics — real-shape metrics', () => {
  it('converts excel-day → minutes, counts target categories, immutable readback', () => {
    seed('serra-honda', CAP)
    const r = promote('serra-honda', CAP)
    expect(r.outcome).toBe('promoted')
    expect(r.metrics.leads_total).toBe(3)
    expect(r.metrics.responded).toBe(2)
    expect(r.metrics.response_time_actual_avg_min).toBe(363.6)   // (7.2 + 720)/2
    expect(r.metrics.response_time_actual_median_min).toBe(363.6)
    expect(r.metrics.response_time_adjusted_avg_min).toBe(10.8)  // (7.2 + 14.4)/2
    expect(r.metrics.target_category_counts).toEqual({ 'Target 1': 1, 'Target 2': 0, 'Missed': 1, 'No Contact': 1, other: 0 })
    expect(r.metrics.sold_count).toBe(1)
    expect(r.metrics.appointment_count).toBe(1)
    expect(r.metrics.unanswered_count).toBe(1)
    expect((r.provenance as any).metric_units.response_time).toMatch(/1440/)
    expect(fs.statSync(r.readback_path).mode & 0o777).toBe(0o444)
  })

  it('rounds an odd-length median', () => {
    // three responded: 0.001*1440=1.44, 0.002*1440=2.88, 0.003*1440=4.32 → median 2.88
    const der = [HEADER, 'v,21043,t,1,0.001,0.001,Target 1,,,', 'v,21043,t,2,0.002,0.002,Target 1,,,', 'v,21043,t,3,0.003,0.003,Target 1,,,'].join('\n') + '\n'
    seed('serra-honda', CAP, { derivative: der })
    expect(promote('serra-honda', CAP).metrics.response_time_actual_median_min).toBe(2.88)
  })

  it('idempotent replay → duplicate', () => {
    seed('serra-honda', CAP)
    const first = promote('serra-honda', CAP)
    const before = fs.readFileSync(first.readback_path)
    const second = promote('serra-honda', CAP)
    expect(second.outcome).toBe('duplicate')
    expect(fs.readFileSync(first.readback_path).equals(before)).toBe(true)
  })

  it('corrected-schema prior → attributable revision archives v1 (evidence preserved, not deleted)', () => {
    const { derSha } = seed('serra-honda', CAP)
    // seed a prior WRONG v1 readback of the same bytes directly at the target
    const outDir = path.join(analytics, 'serra-honda', 'response-times', '2026-08-17_2026-08-23')
    fs.mkdirSync(outDir, { recursive: true })
    const outPath = path.join(outDir, 'readback.json')
    // legacy provisional shape used provenance.schema (NOT analytics_schema) — attribution must resolve it
    const v1raw = JSON.stringify({ provenance: { schema: 'huminic.vinsolutions.response_times.analytics_readback.v1', derivative_sha256: derSha }, metrics: { response_time_actual_avg_min: 7.07 } }, null, 2)
    fs.writeFileSync(outPath, v1raw)
    const rev = promote('serra-honda', CAP)
    expect(rev.outcome).toBe('revised')
    expect((rev.provenance as any).supersedes.analytics_schema).toBe('huminic.vinsolutions.response_times.analytics_readback.v1')
    // v1 preserved content-addressed under superseded/ (byte-identical, not deleted)
    const supDir = path.join(outDir, 'superseded')
    const archivedFiles = fs.readdirSync(supDir)
    const archived = archivedFiles.map((f) => fs.readFileSync(path.join(supDir, f), 'utf8'))
    expect(archived).toContain(v1raw)
    // archived evidence is immutable (0444) even though the prior pointer was writable
    for (const f of archivedFiles) expect(fs.statSync(path.join(supDir, f)).mode & 0o777).toBe(0o444)
    // new pointer is v2 with corrected minute metrics
    expect((JSON.parse(fs.readFileSync(outPath, 'utf8')).metrics as any).response_time_actual_avg_min).toBe(363.6)
    // re-running is now a no-op duplicate (deterministic)
    expect(promote('serra-honda', CAP).outcome).toBe('duplicate')
  })
})

describe('promoteResponseTimesToAnalytics — fail-closed guards', () => {
  const cases: Array<[string, () => void]> = [
    ['unsafe captureId (traversal)', () => promote('serra-honda', '../evil')],
    ['verdict not accepted', () => { seed('serra-honda', CAP, { verdict: 'quarantined' }); promote('serra-honda', CAP) }],
    ['readback profile mismatch', () => { seed('serra-honda', CAP, { rbProfile: 'serra-nissan' }); promote('serra-honda', CAP) }],
    ['manifest sha mismatch', () => { seed('serra-honda', CAP, { man: { derivative: { filename: 'response-times-canonical-v1.csv', sha256: 'deadbeef' } } }); promote('serra-honda', CAP) }],
    ['rooftop.profile mismatch', () => { seed('serra-honda', CAP, { man: { rooftop: { profile: 'serra-nissan', vin_dealer_id: '21043' } } }); promote('serra-honda', CAP) }],
    ['source.capture_id mismatch', () => { seed('serra-honda', CAP, { man: { source: { capture_id: 'other' } } }); promote('serra-honda', CAP) }],
    ['wrong schema_version', () => { seed('serra-honda', CAP, { man: { schema_version: 'x' } }); promote('serra-honda', CAP) }],
    ['wrong validation.state', () => { seed('serra-honda', CAP, { man: { validation: { state: 'nope' } } }); promote('serra-honda', CAP) }],
    ['row-count binding mismatch', () => { seed('serra-honda', CAP, { man: { coverage: { start: '2026-08-17', end: '2026-08-23', timezone: 'America/New_York', reconciles: true, accepted_rows: 99 } } }); promote('serra-honda', CAP) }],
    ['missing metric column', () => { seed('serra-honda', CAP, { derivative: 'derivative_version,vin_dealer_id,lead.id,responseTimeActual\nv,21043,1,0.005\n' }); promote('serra-honda', CAP) }],
    ['malformed numeric response time', () => { seed('serra-honda', CAP, { derivative: [HEADER, 'v,21043,t,1,not-a-number,0.005,Target 1,,,'].join('\n') + '\n' }); promote('serra-honda', CAP) }],
  ]
  for (const [name, fn] of cases) it(`aborts: ${name}`, () => expect(fn).toThrow(RtPromoteAbort))

  it('aborts on nested/equal/production analytics root', () => {
    seed('serra-honda', CAP)
    expect(() => promoteResponseTimesToAnalytics({ dryRunRoot: dry, analyticsRoot: dry, profile: 'serra-honda', captureId: CAP })).toThrow(RtPromoteAbort)
    expect(() => promoteResponseTimesToAnalytics({ dryRunRoot: dry, analyticsRoot: path.join(os.homedir(), '.hermes', 'profiles'), profile: 'serra-honda', captureId: CAP })).toThrow(/production brain root/)
  })

  it('parseCsv handles quoted fields with embedded commas', () => {
    expect(parseCsv('a,b\n"x,y",z\n')).toEqual([['a', 'b'], ['x,y', 'z']])
  })
})
