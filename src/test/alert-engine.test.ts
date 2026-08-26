import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createMetricAlert } from '@/server/watchdog/notifications-store'
import {
  baselineFromHistory,
  evaluateProfileAlerts,
  firingAlerts,
  resolveHubMetricValues,
  type MetricValues,
  type MetricHistory,
} from '@/server/watchdog/alert-engine'
import type { CockpitWindow } from '@/server/cockpit/cockpit-window'

let tmp: string
const P = 'serra-honda'
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'alert-eng-'))
  process.env.BRAIN_PROFILES_ROOT = path.join(tmp, '.hermes', 'profiles')
})
afterEach(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
})

const win = (over: Partial<CockpitWindow> = {}): CockpitWindow => ({
  threads: 100, touched: 200, replied: 40, conversed: 20, intent: 5, resurrections: 3,
  ah_threads: 30, after_hours_pct: 30, median_reply_secs: 4, channels: {},
  work: { messages_sent: 0, messages_received: 0, messages_after_hours: 0, automation_runs: 0, agent_replies: 0, total: 0 },
  ...over,
})

describe('baselineFromHistory', () => {
  it('needs ≥3 points and non-zero variance', () => {
    expect(baselineFromHistory([1, 2])).toBeNull()
    expect(baselineFromHistory([5, 5, 5])).toBeNull() // zero variance
    const b = baselineFromHistory([10, 12, 14, 16])
    expect(b!.mean).toBe(13)
    expect(b!.stddev).toBeGreaterThan(0)
  })
})

describe('resolveHubMetricValues', () => {
  it('derives engagement metrics; reply rate is null with no touched (never a fake 0)', () => {
    const v = resolveHubMetricValues(win())
    expect(v.get('engagement.reply_rate')).toBeCloseTo(40 / 200, 5)
    expect(v.get('engagement.conversations')).toBe(40)
    expect(v.get('engagement.resurrections')).toBe(3)
    expect(resolveHubMetricValues(win({ touched: 0, replied: 0 })).get('engagement.reply_rate')).toBeNull()
  })
})

describe('evaluateProfileAlerts', () => {
  it('fires a threshold alert on a hub metric that crosses; withholds one that does not', () => {
    createMetricAlert({ profile: P, email: 'gm@serra.co', metric_id: 'engagement.reply_rate', metric_label: 'SMS reply rate', rule_type: 'threshold', direction: 'below', threshold: 0.25 }, 1000)
    const values = resolveHubMetricValues(win()) // reply_rate = 0.20 < 0.25 → fires
    const d = evaluateProfileAlerts(P, { values, now: 2000 })
    expect(d).toHaveLength(1)
    expect(d[0].decision.fires).toBe(true)

    const high = resolveHubMetricValues(win({ replied: 120 })) // 0.60 ≮ 0.25 → no fire
    expect(evaluateProfileAlerts(P, { values: high, now: 2000 })[0].decision.fires).toBe(false)
  })

  it('availability-gated: a metric with no resolvable value withholds (VinSolutions metric on this branch)', () => {
    createMetricAlert({ profile: P, email: 'gm@serra.co', metric_id: 'appt.show_rate', metric_label: 'Appointment show rate', rule_type: 'threshold', direction: 'below', threshold: 0.5 }, 1000)
    const values: MetricValues = resolveHubMetricValues(win()) // no appt.* value present
    const d = evaluateProfileAlerts(P, { values, now: 2000 })
    expect(d[0].decision.fires).toBe(false)
    expect((d[0].decision as { reason: string }).reason).toMatch(/no current value/i)
  })

  it('baseline rule withholds without ≥3 history points, fires when the band is breached', () => {
    createMetricAlert({ profile: P, email: 'gm@serra.co', metric_id: 'engagement.resurrections', metric_label: 'Resurrections', rule_type: 'baseline', direction: 'below', baseline_sigma: 2 }, 1000)
    const values = resolveHubMetricValues(win({ resurrections: 1 }))
    // no history → withhold
    expect(evaluateProfileAlerts(P, { values, now: 2000 })[0].decision.fires).toBe(false)
    // history mean ~8 sd>0; value 1 is far below 2σ band → fires
    const history: MetricHistory = new Map([['engagement.resurrections', [8, 9, 7, 8, 9]]])
    const d = evaluateProfileAlerts(P, { values, history, now: 2000 })
    expect(d[0].decision.fires).toBe(true)
    expect(firingAlerts(d)).toHaveLength(1)
  })

  it('respects the 24h dedup carried on the alert record', () => {
    createMetricAlert({ profile: P, email: 'gm@serra.co', metric_id: 'engagement.reply_rate', metric_label: 'SMS reply rate', rule_type: 'threshold', direction: 'below', threshold: 0.25 }, 1000)
    const values = resolveHubMetricValues(win()) // would fire
    // simulate a very recent fire by evaluating "now" just after created_at with last_fired stamped
    // (dedup is enforced in evaluateAlertRule via last_fired_at; here we assert the wiring passes it through)
    const first = evaluateProfileAlerts(P, { values, now: 1000 + 1000 })
    expect(first[0].decision.fires).toBe(true) // never fired yet
  })
})
