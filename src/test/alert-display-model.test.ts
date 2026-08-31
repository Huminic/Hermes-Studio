import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveNativeMetricValues } from '../server/watchdog/metric-values'
import { getCatalogMetric } from '../server/watchdog/metric-catalog'
import {
  createMetricAlert,
  createPausedMetricAlert,
  listMetricAlerts,
  listNotifications,
} from '../server/watchdog/notifications-store'
import { buildAlertDisplay } from '../server/watchdog/alert-display-model'
import { m1rNotificationExamples, toPausedMetricAlertInput } from '../server/watchdog/m1r-notification-examples'

const NOW = new Date('2026-08-31T12:00:00Z')
const ANALYTICS = '/srv/ingest-dev/analytics'
const HAVE = fs.existsSync(`${ANALYTICS}/serra-honda/brain/brain.db`)

describe('metric catalog + resolver: dashboard.response_time_actual_avg_min', () => {
  it('is a governed catalog metric sourced from vin-report', () => {
    const m = getCatalogMetric('dashboard.response_time_actual_avg_min')
    expect(m).toBeTruthy()
    expect(m!.source).toBe('vin-report')
  })

  describe.runIf(HAVE)('resolves from the accepted Dashboard (golden 210/238/317)', () => {
    const saved = process.env.BRAIN_PROFILES_ROOT
    beforeAll(() => { process.env.BRAIN_PROFILES_ROOT = ANALYTICS })
    afterAll(() => { if (saved === undefined) delete process.env.BRAIN_PROFILES_ROOT; else process.env.BRAIN_PROFILES_ROOT = saved })
    it('golden values per store; missing remains absent (never zero)', () => {
      const expected: Record<string, number> = { 'serra-honda': 210, 'serra-nissan': 238, 'tony-serra-ford': 317 }
      for (const [p, v] of Object.entries(expected)) {
        const values = resolveNativeMetricValues(p)
        expect(values.get('dashboard.response_time_actual_avg_min')).toBe(v)
      }
    })
  })
})

describe.runIf(HAVE)('alert display read-model over real paused M1R records', () => {
  const saved = process.env.BRAIN_PROFILES_ROOT
  let notifRoot = ''
  beforeAll(() => {
    process.env.BRAIN_PROFILES_ROOT = ANALYTICS
    notifRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'm1r-disp-'))
  })
  afterAll(() => {
    if (saved === undefined) delete process.env.BRAIN_PROFILES_ROOT; else process.env.BRAIN_PROFILES_ROOT = saved
    try { fs.rmSync(notifRoot, { recursive: true, force: true }) } catch { /* noop */ }
  })

  it('registers bound examples paused; read-model shows status/metric/threshold/currentValue/role/age; unbound not inserted', () => {
    const profile = 'serra-honda'
    const examples = m1rNotificationExamples(profile, NOW)
    for (const ex of examples) {
      const input = toPausedMetricAlertInput(ex)
      if (input) expect(createPausedMetricAlert(input, NOW.getTime(), { profileRoot: notifRoot }).ok).toBe(true)
    }
    // zero active
    expect(listMetricAlerts(profile, { profileRoot: notifRoot })).toHaveLength(0)

    const records = listNotifications(profile, { profileRoot: notifRoot })
    const display = buildAlertDisplay(profile, records, NOW)
    expect(display).toHaveLength(3) // #3 unbound was never inserted
    for (const d of display) {
      expect(d.status).toBe('paused')
      expect(d.kind).toBe('metric')
      expect(d.metric_label).toBeTruthy()
      expect(typeof d.threshold === 'number').toBe(true)
      expect(d.recipientRole).toBeTruthy() // additive metadata persisted
      expect(d.dataThroughLabel).toBe('Aug 30, 2026') // correct SOURCE data-through
      expect(d.ageLabel).toContain('Data through Aug 30, 2026')
    }
    // the response-time rule resolves its fresh current value from the Dashboard
    const rt = display.find((d) => d.metric_id === 'dashboard.response_time_actual_avg_min')
    expect(rt?.currentValueResolved).toBe(true)
    expect(rt?.currentValue).toBe(210)
    // gross reconciliation resolves to 0 — a REAL zero, marked resolved (distinct from absent)
    const gr = display.find((d) => d.metric_id === 'gross.reconciliation_mismatches')
    expect(gr?.currentValueResolved).toBe(true)
    expect(gr?.currentValue).toBe(0)
  })

  it('default createMetricAlert stays ACTIVE (unchanged); only explicit paused is excluded from the active list', () => {
    const profile = 'serra-nissan'
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm1r-active-'))
    try {
      createMetricAlert({ profile, email: 'ops@dealer.example', metric_id: 'appt.show_rate', metric_label: 'Appointment show rate', rule_type: 'threshold', direction: 'below', threshold: 0.5 }, NOW.getTime(), { profileRoot: root })
      createPausedMetricAlert({ profile, email: '', metric_id: 'gross.reconciliation_mismatches', metric_label: 'Gross reconciliation mismatches', rule_type: 'threshold', direction: 'above', threshold: 0 }, NOW.getTime(), { profileRoot: root })
      const active = listMetricAlerts(profile, { profileRoot: root })
      expect(active).toHaveLength(1) // only the active one
      expect(active[0].status).toBe('active')
      const all = listNotifications(profile, { profileRoot: root })
      expect(all).toHaveLength(2) // both visible in the full list
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
