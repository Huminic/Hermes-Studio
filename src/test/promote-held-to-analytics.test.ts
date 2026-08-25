import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { makeXlsx, type Cell } from './helpers/make-xlsx'
import { landDelivery, type HoldMetadata } from '@/server/ingest/hold-store'
import { promoteHeldToAnalytics, PromoteAbort } from '@/server/analytics/promote-held-to-analytics'

let holdRoot: string
let analyticsRoot: string
let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'promote-'))
  holdRoot = path.join(tmp, 'hold')
  analyticsRoot = path.join(tmp, 'analytics') // distinct, non-nested, non-prod
  process.env.INGEST_HOLD_ROOT = holdRoot
})
afterEach(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
  delete process.env.INGEST_HOLD_ROOT
  delete process.env.BRAIN_PROFILES_ROOT
})

const DEALER = 'Serra Honda'
const PERIOD = { start: '2026-08-17', end: '2026-08-23' }
const OPTS = { profileDealer: DEALER, capturedAt: '2026-08-25T00:00:00.000Z' }
const meta = (over: Partial<HoldMetadata> = {}): HoldMetadata => ({
  profile: 'serra-honda', filename: 'appt.xlsx', sender: 's@motosnap.com', subject: 'Appointments',
  gmail_message_id: 'g1', received_at: '2026-08-24T00:00:00Z', ...over,
})

const APPT_HEADER = ['Appointment ID', 'Dealer', 'Dealer ID', 'Appointment Type', 'Appt Reason', 'Appointment Start Date', 'Appointment Start DateTime', 'Appointment Status', 'Is Confirmed', 'Is Show', 'Is No Show', 'Rescheduled Date']
const apptRow = (o: { id: string; show?: string; noShow?: string; reason?: string; date?: string }): Array<Cell> =>
  [o.id, 'Serra Honda of Sylacauga', '21043', 'Meeting', o.reason ?? 'Sales Appointment', o.date ?? '2026-08-18', o.date ?? '2026-08-18', 'Scheduled', 'TRUE', o.show ?? 'FALSE', o.noShow ?? 'FALSE', '']
const apptWb = (rows: Array<Array<Cell>>) => makeXlsx([{ name: 'Sheet1', rows: [APPT_HEADER, ...rows] }])

/** Land a held Honda appointments delivery (2 rows: 1 shown, 1 no-show). */
function seedHeldAppointments(): string {
  const wb = apptWb([apptRow({ id: 'A1', show: 'TRUE' }), apptRow({ id: 'A2', noShow: 'TRUE', date: '2026-08-20' })])
  const r = landDelivery(wb, meta({ period_hint: '2026-08-17/2026-08-23' }), OPTS)
  expect(r.outcome).toBe('held')
  return r.manifest.sha256
}
const promoteInput = (sha256: string, over: Record<string, unknown> = {}) => ({ holdRoot, analyticsRoot, profile: 'serra-honda', sha256, profileDealer: DEALER, period: PERIOD, ...over })

describe('promote-held-to-analytics — promote + calculate + readback', () => {
  it('promotes a held appointments period, calculates real metrics, deterministic readback', () => {
    const sha = seedHeldAppointments()
    const r = promoteHeldToAnalytics(promoteInput(sha))
    expect(r.outcome).toBe('promoted')
    expect(r.report_kind).toBe('appointments')
    expect(r.accepted_rows).toBe(2)
    expect(r.metrics.profile).toBe('serra-honda')
    // real calculation (not withheld): 1 of 2 shown / 1 no-show
    const byId = new Map(r.metrics.metrics.map((m) => [m.metric_id, m]))
    expect(byId.get('appt.show_rate')).toMatchObject({ value: 0.5, count: 1 })
    expect(byId.get('appt.no_show_rate')).toMatchObject({ value: 0.5, count: 1 })
    expect(byId.get('appt.confirmed_rate')).toMatchObject({ value: 1, count: 2 })
    // analytics db lives under the isolated root (never the hold root)
    expect(r.evidence.analytics_db.startsWith(path.resolve(analyticsRoot))).toBe(true)
    expect(fs.existsSync(r.evidence.analytics_db)).toBe(true)
    // deterministic readback: re-promote (duplicate) yields identical metrics
    const again = promoteHeldToAnalytics(promoteInput(sha))
    expect(JSON.stringify(again.metrics)).toBe(JSON.stringify(r.metrics))
  })

  it('duplicate checksum is a no-op (no second delivery, no double-count)', () => {
    const sha = seedHeldAppointments()
    const first = promoteHeldToAnalytics(promoteInput(sha))
    expect(first.outcome).toBe('promoted')
    expect(first.accepted_rows).toBe(2)
    const second = promoteHeldToAnalytics(promoteInput(sha))
    expect(second.outcome).toBe('duplicate')
    expect(second.accepted_rows).toBe(0)
    // still exactly 2 rows behind the metrics (no double count)
    const total = second.metrics.metrics.find((m) => m.metric_id === 'appt.confirmed_rate')
    expect(total?.count).toBe(2)
  })

  it('missing-is-not-zero: unpromoted kinds are WITHHELD, not zero', () => {
    const sha = seedHeldAppointments()
    const r = promoteHeldToAnalytics(promoteInput(sha))
    const metricIds = new Set(r.metrics.metrics.map((m) => m.metric_id))
    const withheldIds = new Set(r.metrics.withheld.map((w) => w.metric_id))
    // ROI/gross/CAGE were never promoted → withheld (never emitted as value 0)
    expect(withheldIds.has('roi.total_leads')).toBe(true)
    expect(withheldIds.has('gross.total_sum')).toBe(true)
    expect(metricIds.has('roi.total_leads')).toBe(false)
    expect(r.metrics.withheld.every((w) => w.status === 'withheld')).toBe(true)
  })

  it('tenant isolation: metrics are scoped to the promoted profile', () => {
    const sha = seedHeldAppointments()
    const r = promoteHeldToAnalytics(promoteInput(sha))
    expect(r.metrics.metrics.every((m) => m.profile === 'serra-honda')).toBe(true)
    expect(r.metrics.metrics.every((m) => m.dealer === DEALER)).toBe(true)
    // a mismatched profile aborts before any write
    expect(() => promoteHeldToAnalytics(promoteInput(sha, { profile: 'serra-nissan' }))).toThrow(PromoteAbort)
  })

  it('unchanged hold bytes: the immutable original is not touched', () => {
    const sha = seedHeldAppointments()
    const orig = fs.readFileSync(path.join(holdRoot, 'serra-honda', 'held', 'appointments', '2026-08-17_2026-08-23', sha, 'original.xlsx'))
    const before = fs.statSync(path.join(holdRoot, 'serra-honda', 'held', 'appointments', '2026-08-17_2026-08-23', sha, 'original.xlsx')).mtimeMs
    promoteHeldToAnalytics(promoteInput(sha))
    const p = path.join(holdRoot, 'serra-honda', 'held', 'appointments', '2026-08-17_2026-08-23', sha, 'original.xlsx')
    expect(fs.readFileSync(p).equals(orig)).toBe(true)
    expect(fs.statSync(p).mtimeMs).toBe(before)
  })

  it('rollback evidence: the isolated analytics store is separable and removable; hold survives', () => {
    const sha = seedHeldAppointments()
    const r = promoteHeldToAnalytics(promoteInput(sha))
    expect(r.evidence.analytics_root).not.toBe(r.evidence.hold_root)
    fs.rmSync(analyticsRoot, { recursive: true, force: true }) // rollback = delete the dev analytics root
    expect(fs.existsSync(analyticsRoot)).toBe(false)
    // hold is untouched by the rollback
    expect(fs.existsSync(path.join(holdRoot, 'serra-honda', 'held', 'appointments', '2026-08-17_2026-08-23', sha, 'manifest.json'))).toBe(true)
  })
})

describe('promote-held-to-analytics — fail-closed rejections (abort before any write)', () => {
  const analyticsHasDb = () => fs.existsSync(path.join(analyticsRoot, 'serra-honda', 'brain', 'brain.db'))

  it('a QUARANTINED hold entry cannot be promoted (Sales/Parts rejection)', () => {
    // a Service appointment reason quarantines at land time
    const wb = apptWb([apptRow({ id: 'S1', reason: 'Service Appointment' })])
    const q = landDelivery(wb, meta({ filename: 'svc.xlsx', period_hint: '2026-08-17/2026-08-23' }), OPTS)
    expect(q.outcome).toBe('quarantined')
    expect(() => promoteHeldToAnalytics(promoteInput(q.manifest.sha256))).toThrow(/not held|quarantin/i)
    expect(analyticsHasDb()).toBe(false) // no analytical write happened
  })

  it('period / dealer mismatch aborts before write', () => {
    const sha = seedHeldAppointments()
    expect(() => promoteHeldToAnalytics(promoteInput(sha, { period: { start: '2026-08-10', end: '2026-08-16' } }))).toThrow(PromoteAbort)
    expect(() => promoteHeldToAnalytics(promoteInput(sha, { profileDealer: 'Serra Nissan' }))).toThrow(PromoteAbort)
    expect(analyticsHasDb()).toBe(false)
  })

  it('root guards: overlap / nesting / production default / non-absolute / empty all abort', () => {
    const sha = seedHeldAppointments()
    const bad = (over: Record<string, unknown>) => () => promoteHeldToAnalytics(promoteInput(sha, over))
    expect(bad({ analyticsRoot: holdRoot })).toThrow(/equal/i) // overlap (equal)
    expect(bad({ analyticsRoot: path.join(holdRoot, 'sub') })).toThrow(/nested/i) // nested under hold
    expect(bad({ analyticsRoot: path.join(os.homedir(), '.hermes', 'profiles') })).toThrow(/production/i)
    expect(bad({ analyticsRoot: 'relative/path' })).toThrow(/absolute/i)
    expect(bad({ analyticsRoot: '' })).toThrow(/must be explicitly set/i)
    expect(analyticsHasDb()).toBe(false)
  })

  it('an unknown SHA aborts', () => {
    expect(() => promoteHeldToAnalytics(promoteInput('0'.repeat(64)))).toThrow(/no held delivery/i)
  })
})
