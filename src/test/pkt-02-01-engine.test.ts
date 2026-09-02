// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { executePacket } from '@/server/reports/packet/engine'

const REPO = path.resolve(__dirname, '..', '..')
const LEADS = process.env.HALO_LEADS_DIR ?? '/tmp/halo-295-leads-20260831'
const HAVE = fs.existsSync(
  path.join(LEADS, 'serra-honda-21043_leads_2026-08-24_2026-08-30.xlsx'),
)

const run = (asOf = '2026-09-02T06:51:10Z') =>
  executePacket({
    repoRoot: REPO,
    leadsDir: LEADS,
    asOf,
    engineVersion: 'pkt-exec-1',
  })

describe.runIf(HAVE)('PKT-02-01 engine — end-to-end execution', () => {
  it('binds identity to the frozen authorities', () => {
    const r = run()
    expect(r.packet_id).toBe('PKT-02-01')
    expect(r.module).toBe(2)
    expect(r.dealer_id).toBe('21043')
    expect(r.period).toBe('2026-08-24..2026-08-30')
    expect(r.binding_sha256).toBe(
      '1c1c98a2e7b3be8d10eea9495861b7a33e65a00020ab7c9e756da363b69f2082',
    )
    expect(r.source_sha256).toBe(
      '39f0577400c912b8e0f0db4a37a35726c1a460c32df88f231aaa39aff9d100ae',
    )
  })

  it('produces measured observations for SW-011/012/015 equal to the frozen values', () => {
    const r = run()
    const o = (id: string) => r.observations.find((x) => x.metric_id === id)!
    const s11 = o('SW-011')
    expect(s11.status).toBe('measured')
    expect(s11.value).toBe(6)
    expect(s11.unit).toBe('minutes')
    expect(s11.numerator).toBe(27)
    expect(s11.denominator).toBe(76)
    expect(s11.missing).toBe(49)
    // missing is never zero: coverage + missing == denominator
    expect((s11.numerator ?? 0) + (s11.missing ?? 0)).toBe(s11.denominator)
    expect(s11.gradable).toBe(true)

    const s12 = o('SW-012')
    expect(s12.value).toBe(0.19736842105263158)
    expect(s12.numerator).toBe(15)
    expect(s12.denominator).toBe(76)

    const s15 = o('SW-015')
    expect(s15.value).toBe(0.5)
    expect(s15.numerator).toBe(2)
    expect(s15.denominator).toBe(4)
  })

  it('holds SW-013/014 open as source_investigation_pending with exact missing fields', () => {
    const r = run()
    for (const id of ['SW-013', 'SW-014']) {
      const o = r.observations.find((x) => x.metric_id === id)!
      expect(o.status).toBe('source_investigation_pending')
      expect(o.value).toBeNull()
      expect(o.numerator).toBeNull()
      expect(o.denominator).toBeNull()
      expect(o.gradable).toBe(false)
      expect(o.source_investigation).not.toBeNull()
      expect(o.source_investigation!.missing_fields.length).toBeGreaterThan(0)
    }
  })

  it('grades measured metrics against the frozen operational targets', () => {
    const r = run()
    const e = (id: string) => r.evaluations.find((x) => x.metric_id === id)!
    expect(e('SW-011').rating).toBe('healthy') // 6 > 10 is false
    expect(e('SW-011').detection_fired).toBe(false)
    expect(e('SW-012').rating).toBe('breach') // 0.197 > 0
    expect(e('SW-012').detection_fired).toBe(true)
    expect(e('SW-015').rating).toBe('breach') // 0.5 > 0
    expect(e('SW-015').detection_fired).toBe(true)
    // pending metrics: withheld, never graded, never fabricated healthy
    expect(e('SW-013').gradable_state).toBe('withheld')
    expect(e('SW-013').rating).toBe('withheld')
    expect(e('SW-014').gradable_state).toBe('withheld')
  })

  it('independently reconciles recompute == evaluator == persisted accepted', () => {
    const r = run()
    expect(r.reconciliation.ok).toBe(true)
    for (const id of ['SW-011', 'SW-012', 'SW-015']) {
      const rec = r.reconciliation.metrics.find((m) => m.metric_id === id)!
      expect(rec.independent).toBe(rec.evaluator)
      expect(rec.independent).toBe(rec.persisted_accepted)
      expect(rec.match).toBe(true)
    }
  })

  it('emits unsent alert simulations ONLY for valid measured metrics', () => {
    const r = run()
    const ids = r.alert_simulations.map((a) => a.metric_id).sort()
    expect(ids).toEqual(['SW-011', 'SW-012', 'SW-015'])
    for (const a of r.alert_simulations) {
      expect(a.delivered).toBe(false)
      expect(a.unsent).toBe(true)
    }
    const fire = (id: string) =>
      r.alert_simulations.find((a) => a.metric_id === id)!.would_fire
    expect(fire('SW-011')).toBe(false)
    expect(fire('SW-012')).toBe(true)
    expect(fire('SW-015')).toBe(true)
  })

  it('carries the two-delta proof (raw->normalized, normalized->grade)', () => {
    const r = run()
    expect(r.two_delta.evidence_delta.source_sha256).toBe(
      '39f0577400c912b8e0f0db4a37a35726c1a460c32df88f231aaa39aff9d100ae',
    )
    expect(r.two_delta.evidence_delta.row_reconciliation).toBe('119 of 119')
    expect(r.two_delta.meaning_delta.length).toBe(5)
  })

  it('is deterministic + idempotent: content_sha256 and run_key are stable across as_of', () => {
    const a = run('2026-09-02T06:51:10Z')
    const b = run('2030-01-01T00:00:00Z')
    expect(a.content_sha256).toBe(b.content_sha256)
    expect(a.run_key).toBe(b.run_key)
  })

  it('never persists a Sales Rep name in the SW-015 detail', () => {
    const r = run()
    const s15 = r.observations.find((x) => x.metric_id === 'SW-015')!
    const keys = Object.keys(s15.detail ?? {})
    expect(keys).toContain('reps_with_numeric')
    expect(keys).toContain('triggered_rep_count')
    // no per-rep name/identity keys
    expect(keys.some((k) => /name|rep_id|identity/i.test(k))).toBe(false)
  })
})
