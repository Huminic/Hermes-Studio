import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  createNotification,
  createMetricAlert,
  deleteNotification,
  describeMetricAlert,
  evaluateAlertRule,
  isValidEmail,
  listMetricAlerts,
  listNotifications,
  markAlertFired,
  parseRecipients,
} from '@/server/watchdog/notifications-store'

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-notif-'))
  process.env.BRAIN_PROFILES_ROOT = path.join(tmp, '.hermes', 'profiles')
})
afterEach(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})

describe('manual notifications store', () => {
  it('validates email', () => {
    expect(isValidEmail('duanekwells@gmail.com')).toBe(true)
    expect(isValidEmail('nope')).toBe(false)
    expect(isValidEmail('')).toBe(false)
  })

  it('creates + lists a notification (alert from an issue)', () => {
    const r = createNotification(
      {
        profile: 'serra-honda',
        email: 'duanekwells@gmail.com',
        query_name: 'Customer waiting on a reply',
        description: 'Emails you when a customer has waited over 4 business hours for a response.',
        source: 'comms.customer-waiting:t1',
      },
      1000,
    )
    expect(r.ok).toBe(true)
    const rows = listNotifications('serra-honda')
    expect(rows).toHaveLength(1)
    expect(rows[0].email).toBe('duanekwells@gmail.com')
    expect(rows[0].query_name).toBe('Customer waiting on a reply')
    expect(rows[0].status).toBe('active')
  })

  it('rejects invalid email / empty name', () => {
    expect(createNotification({ profile: 'p', email: 'bad', query_name: 'x', description: 'y' }, 1)).toEqual({ ok: false, error: expect.any(String) })
    expect(createNotification({ profile: 'p', email: 'a@b.co', query_name: '  ', description: 'y' }, 1)).toEqual({ ok: false, error: expect.any(String) })
  })

  it('deletes', () => {
    const r = createNotification({ profile: 'p', email: 'a@b.co', query_name: 'q', description: 'd' }, 1)
    if (!r.ok) throw new Error('setup')
    expect(deleteNotification('p', r.id)).toBe(true)
    expect(listNotifications('p')).toHaveLength(0)
  })
})

describe('metric-driven alert wizard store', () => {
  const HONDA = 'serra-honda'

  it('parses one or many recipients; rejects bad', () => {
    expect(parseRecipients('a@b.co')).toEqual({ ok: true, emails: ['a@b.co'] })
    expect(parseRecipients('a@b.co, c@d.co')).toEqual({ ok: true, emails: ['a@b.co', 'c@d.co'] })
    expect(parseRecipients('a@b.co, nope')).toEqual({ ok: false, error: expect.stringContaining('nope') })
    expect(parseRecipients('   ')).toEqual({ ok: false, error: expect.any(String) })
  })

  it('describes a threshold and a baseline alert in plain language', () => {
    expect(describeMetricAlert({ metric_label: 'Appointment show rate', rule_type: 'threshold', direction: 'below', threshold: 0.5 }))
      .toBe('Alerts when Appointment show rate falls below 0.5.')
    expect(describeMetricAlert({ metric_label: 'No-show rate', rule_type: 'baseline', direction: 'above', baseline_sigma: 2 }))
      .toMatch(/unusually high.*2σ/)
  })

  it('creates a threshold alert and lists it as a metric alert', () => {
    const r = createMetricAlert(
      { profile: HONDA, email: 'gm@serra.co', metric_id: 'appt.show_rate', metric_label: 'Appointment show rate', rule_type: 'threshold', direction: 'below', threshold: 0.5 },
      1000,
    )
    expect(r.ok).toBe(true)
    const alerts = listMetricAlerts(HONDA)
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ metric_id: 'appt.show_rate', rule_type: 'threshold', direction: 'below', threshold: 0.5, source: 'metric-alert' })
    // a manual notification is NOT returned by listMetricAlerts
    createNotification({ profile: HONDA, email: 'gm@serra.co', query_name: 'manual', description: 'd' }, 1001)
    expect(listMetricAlerts(HONDA)).toHaveLength(1)
    expect(listNotifications(HONDA)).toHaveLength(2)
  })

  it('validates rule inputs', () => {
    const base = { profile: HONDA, email: 'gm@serra.co', metric_id: 'roi.total_leads', metric_label: 'Total leads' as const }
    expect(createMetricAlert({ ...base, rule_type: 'threshold', direction: 'below' }, 1)).toEqual({ ok: false, error: expect.any(String) })
    expect(createMetricAlert({ ...base, rule_type: 'baseline', direction: 'above', baseline_sigma: 0 }, 1)).toEqual({ ok: false, error: expect.any(String) })
    expect(createMetricAlert({ ...base, email: 'bad', rule_type: 'threshold', direction: 'below', threshold: 1 }, 1)).toEqual({ ok: false, error: expect.any(String) })
  })

  it('evaluates a threshold rule (crosses / does not / missing withholds)', () => {
    const rule = { metric_label: 'Show rate', rule_type: 'threshold' as const, direction: 'below' as const, threshold: 0.5, baseline_sigma: null, last_fired_at: null }
    expect(evaluateAlertRule(rule, { value: 0.4, now: 10 })).toMatchObject({ fires: true, bound: 0.5, observed: 0.4 })
    expect(evaluateAlertRule(rule, { value: 0.6, now: 10 })).toMatchObject({ fires: false })
    // missing value is never a fabricated 0 that would trip a "falls below" alert
    expect(evaluateAlertRule(rule, { value: null, now: 10 })).toMatchObject({ fires: false })
  })

  it('evaluates a baseline rule against a per-dealer band; needs history', () => {
    const rule = { metric_label: 'No-show rate', rule_type: 'baseline' as const, direction: 'above' as const, threshold: null, baseline_sigma: 2, last_fired_at: null }
    const baseline = { mean: 0.2, stddev: 0.05 } // 2σ band top = 0.30
    expect(evaluateAlertRule(rule, { value: 0.35, now: 10, baseline })).toMatchObject({ fires: true })
    expect(evaluateAlertRule(rule, { value: 0.25, now: 10, baseline })).toMatchObject({ fires: false })
    // no baseline yet → withhold (still building history), never a false fire
    expect(evaluateAlertRule(rule, { value: 0.9, now: 10, baseline: null })).toMatchObject({ fires: false })
  })

  it('24h dedup: does not re-fire within the window, fires after', () => {
    const DAY = 24 * 60 * 60 * 1000
    const rule = { metric_label: 'X', rule_type: 'threshold' as const, direction: 'below' as const, threshold: 1, baseline_sigma: null, last_fired_at: 1000 }
    expect(evaluateAlertRule(rule, { value: 0, now: 1000 + DAY - 1 })).toMatchObject({ fires: false })
    expect(evaluateAlertRule(rule, { value: 0, now: 1000 + DAY + 1 })).toMatchObject({ fires: true })
  })

  it('markAlertFired stamps last_fired_at for dedup', () => {
    const r = createMetricAlert({ profile: HONDA, email: 'gm@serra.co', metric_id: 'appt.no_show_rate', metric_label: 'No-show rate', rule_type: 'threshold', direction: 'above', threshold: 0.3 }, 1000)
    if (!r.ok) throw new Error('setup')
    markAlertFired(HONDA, r.id, 5000)
    expect(listMetricAlerts(HONDA)[0].last_fired_at).toBe(5000)
  })
})
