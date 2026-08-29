import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  readAppointments,
  readDealershipPerformance,
} from '@/server/ingest-native-metrics'
import { resolveNativeMetricValues } from '@/server/watchdog/metric-values'
import { createMetricAlert, listNotifications } from '@/server/watchdog/notifications-store'
import { evaluateProfileAlerts, type MetricValues } from '@/server/watchdog/alert-engine'
import { dispatchFiringAlerts } from '@/server/watchdog/alert-dispatch'

/* ── Block 1 — 3-store provenance-backed goldens (real accepted store; read-only) ── */
const REAL_ROOT = '/srv/ingest-dev/analytics'
const HAVE_DATA = fs.existsSync(`${REAL_ROOT}/serra-honda/brain/brain.db`)

describe.runIf(HAVE_DATA)('Halo M1 native goldens (isolated accepted store)', () => {
  const saved = process.env.BRAIN_PROFILES_ROOT
  beforeAll(() => {
    process.env.BRAIN_PROFILES_ROOT = REAL_ROOT
  })
  afterAll(() => {
    if (saved === undefined) delete process.env.BRAIN_PROFILES_ROOT
    else process.env.BRAIN_PROFILES_ROOT = saved
  })

  it('serra-honda: five native slugs, exact values + governed period provenance', () => {
    const v = resolveNativeMetricValues('serra-honda')
    expect(v.get('gross.total_sum')).toBeCloseTo(12240.78, 2)
    expect(v.get('appt.show_rate')).toBeCloseTo(12 / 18, 6)
    expect(v.get('appt.no_show_rate')).toBeCloseTo(4 / 18, 6)
    expect(v.get('appt.confirmed_rate')).toBeCloseTo(6 / 18, 6)
    expect(v.get('appt.cancel_rate')).toBeCloseTo(2 / 18, 6)

    const dp = readDealershipPerformance('serra-honda')
    const ap = readAppointments('serra-honda')
    expect(dp.available && ap.available).toBe(true)
    if (dp.available) {
      expect(dp.provenance.period.start).toBe('2026-08-17')
      expect(dp.provenance.period.end).toBe('2026-08-23')
      expect(dp.provenance.checksum).toBeTruthy()
    }
    if (ap.available) {
      expect(ap.provenance.period.start).toBe('2026-08-17')
      expect(ap.total).toBe(18)
    }
  })

  it('serra-nissan: gross only (appointments withheld → all appt.* absent) + provenance', () => {
    const v = resolveNativeMetricValues('serra-nissan')
    expect(v.get('gross.total_sum')).toBeCloseTo(5263.6, 2)
    for (const s of ['appt.show_rate', 'appt.no_show_rate', 'appt.confirmed_rate', 'appt.cancel_rate']) {
      expect(v.has(s)).toBe(false)
    }
    const dp = readDealershipPerformance('serra-nissan')
    if (dp.available) expect(dp.provenance.period.end).toBe('2026-08-23')
    expect(readAppointments('serra-nissan').available).toBe(false)
  })

  it('tony-serra-ford: all native families withheld → no native slugs (missing≠zero)', () => {
    const v = resolveNativeMetricValues('tony-serra-ford')
    expect(v.size).toBe(0)
    expect(readDealershipPerformance('tony-serra-ford').available).toBe(false)
    expect(readAppointments('tony-serra-ford').available).toBe(false)
  })
})

/* ── Block 2 — a supported Vin metric crosses a threshold through the REAL app alert
 *   path, with dispatch DISABLED: internal INERT alert record, no transport. The
 *   notification record is SYNTHETIC (temp profile, never a governed store). ── */
async function runInert(value: number, now: number) {
  const savedEnv = process.env.BRAIN_PROFILES_ROOT
  const savedTicks = ['OUTBOUND_LIVE_ENABLED', 'COMMS_TICK_ENABLED', 'SENTINEL_TICK_ENABLED'].map(
    (k) => [k, process.env[k]] as const,
  )
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'halo-inert-'))
  process.env.BRAIN_PROFILES_ROOT = tmp
  for (const [k] of savedTicks) delete process.env[k]
  const sender = vi.fn(async () => ({ ok: true as const, email_id: 'must-not-send' }))
  try {
    const created = createMetricAlert(
      {
        profile: 'inert', email: 'inert@fixture.invalid',
        metric_id: 'appt.no_show_rate', metric_label: 'Appointment no-show rate',
        rule_type: 'threshold', direction: 'above', threshold: 0.2,
      },
      now,
    )
    const values: MetricValues = new Map([['appt.no_show_rate', value]])
    const decisions = evaluateProfileAlerts('inert', { values, now })
    const results = await dispatchFiringAlerts('inert', decisions, { now, send: false, sender })
    return {
      createdOk: created.ok,
      firing: decisions.filter((d) => d.decision.fires).length,
      firingMetric: decisions.find((d) => d.decision.fires)?.alert.metric_id,
      results,
      senderCalls: sender.mock.calls.length,
      records: listNotifications('inert').filter((n) => n.metric_id === 'appt.no_show_rate').length,
    }
  } finally {
    if (savedEnv === undefined) delete process.env.BRAIN_PROFILES_ROOT
    else process.env.BRAIN_PROFILES_ROOT = savedEnv
    for (const [k, val] of savedTicks) if (val !== undefined) process.env[k] = val
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

describe('Halo M1 inert alert — supported Vin metric via the real app path (dispatch disabled)', () => {
  it('deterministic: a representative no-show value fires an inert alert; dry-run, nothing sent', async () => {
    const r = await runInert(4 / 18, Date.now())
    expect(r.createdOk).toBe(true)
    expect(r.firing).toBe(1)
    expect(r.firingMetric).toBe('appt.no_show_rate')
    expect(r.results).toEqual([expect.objectContaining({ dry_run: true, sent: false })])
    expect(r.senderCalls).toBe(0)
    expect(r.records).toBe(1) // internal INERT record persisted, dispatch disabled
  })

  it.runIf(HAVE_DATA)('sources the alert input from the ACCEPTED Honda native resolver + provenance', async () => {
    const savedEnv = process.env.BRAIN_PROFILES_ROOT
    let honda: number | undefined
    let periodStart = ''
    process.env.BRAIN_PROFILES_ROOT = REAL_ROOT
    try {
      honda = resolveNativeMetricValues('serra-honda').get('appt.no_show_rate')
      const ap = readAppointments('serra-honda')
      expect(ap.available).toBe(true)
      if (ap.available) periodStart = ap.provenance.period.start ?? ''
    } finally {
      if (savedEnv === undefined) delete process.env.BRAIN_PROFILES_ROOT
      else process.env.BRAIN_PROFILES_ROOT = savedEnv
    }
    // Value + period come from the governed accepted appointments delivery, not hard-code.
    expect(honda).toBeCloseTo(4 / 18, 6)
    expect(periodStart).toBe('2026-08-17')

    const r = await runInert(honda as number, Date.now())
    expect(r.firing).toBe(1)
    expect(r.results).toEqual([expect.objectContaining({ dry_run: true, sent: false })])
    expect(r.senderCalls).toBe(0)
    expect(r.records).toBe(1)
  })
})
