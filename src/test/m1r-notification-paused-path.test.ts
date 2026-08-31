import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  createPausedMetricAlert,
  listMetricAlerts,
  listNotifications,
} from '../server/watchdog/notifications-store'
import { evaluateProfileAlerts } from '../server/watchdog/alert-engine'
import { dispatchFiringAlerts, type AlertSender } from '../server/watchdog/alert-dispatch'
import { resolveNativeMetricValues } from '../server/watchdog/metric-values'
import { m1rNotificationExamples, toPausedMetricAlertInput } from '../server/watchdog/m1r-notification-examples'

const NOW_MS = Date.parse('2026-08-31T12:00:00Z')
const NOW = new Date(NOW_MS)
const ANALYTICS = '/srv/ingest-dev/analytics'
const HAVE = fs.existsSync(`${ANALYTICS}/serra-honda/brain/brain.db`)

describe.runIf(HAVE)('M1R paused notification path — real store + real notifications store (isolated)', () => {
  const savedRoot = process.env.BRAIN_PROFILES_ROOT
  let notifRoot = ''
  beforeAll(() => {
    process.env.BRAIN_PROFILES_ROOT = ANALYTICS // readers resolve current values from the accepted store
    notifRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'm1r-notif-'))
  })
  afterAll(() => {
    if (savedRoot === undefined) delete process.env.BRAIN_PROFILES_ROOT
    else process.env.BRAIN_PROFILES_ROOT = savedRoot
    try { fs.rmSync(notifRoot, { recursive: true, force: true }) } catch { /* noop */ }
  })

  const PROFILES = ['serra-honda', 'serra-nissan', 'tony-serra-ford']

  it('registers only BOUND examples as PAUSED; listMetricAlerts excludes them; listNotifications shows them', () => {
    for (const profile of PROFILES) {
      const examples = m1rNotificationExamples(profile, NOW)
      let registered = 0
      let drafts = 0
      for (const ex of examples) {
        const input = toPausedMetricAlertInput(ex)
        if (input) {
          const res = createPausedMetricAlert(input, NOW_MS, { profileRoot: notifRoot })
          expect(res.ok).toBe(true)
          registered++
        } else {
          drafts++ // unbound (#3) stays an unavailable draft — NOT registered, NOT fabricated
        }
      }
      expect(registered).toBe(3) // #1 appt.show_rate, #2 response time, #4 gross reconciliation
      expect(drafts).toBe(1) // #3 high-intent inbound (comm quarantined)

      // The dashboard's ACTIVE list (what the Watchdog engine evaluates) excludes paused.
      const active = listMetricAlerts(profile, { profileRoot: notifRoot })
      expect(active).toHaveLength(0)

      // The full notifications list shows them as paused, with metric + threshold.
      const all = listNotifications(profile, { profileRoot: notifRoot })
      expect(all).toHaveLength(3)
      for (const n of all) {
        expect(n.status).toBe('paused')
        expect(n.metric_id).toBeTruthy()
        expect(n.rule_type).toBe('threshold')
        expect(typeof n.threshold === 'number').toBe(true)
      }
    }
  })

  it('evaluation + dispatch produce ZERO sends (paused never fires; sender never called even with send:true)', async () => {
    for (const profile of PROFILES) {
      const values = resolveNativeMetricValues(profile)
      const decisions = evaluateProfileAlerts(profile, { values, now: NOW_MS }, { profileRoot: notifRoot })
      expect(decisions).toHaveLength(0) // no ACTIVE alerts → nothing evaluated
      const sender = vi.fn(async () => ({ ok: true as const }))
      const results = await dispatchFiringAlerts(profile, decisions, { now: NOW_MS, send: true, sender: sender as unknown as AlertSender, profileRoot: notifRoot })
      expect(results).toHaveLength(0) // nothing firing → nothing dispatched
      expect(sender).not.toHaveBeenCalled() // zero sends
    }
  })

  it('displayed model carries dealer, metric, current value, threshold, recipient role, status, and data-through age', () => {
    const RT_ACTUAL: Record<string, number> = { 'serra-honda': 210, 'serra-nissan': 238, 'tony-serra-ford': 317 }
    for (const profile of PROFILES) {
      const [d1, d2, d3, d4] = m1rNotificationExamples(profile, NOW)
      for (const d of [d1, d2, d3, d4]) {
        expect(d.dealer.length).toBeGreaterThan(0)
        expect(d.recipientRole.length).toBeGreaterThan(0)
        expect(d.status).toBe('paused')
        expect(d.sendState).toMatch(/never/)
      }
      // BOUND defs show their own source family's Aug-30 date; UNBOUND #3 is missing (no bleed)
      for (const d of [d1, d2, d4]) {
        expect(d.dataThroughLabel).toBe('Aug 30, 2026')
        expect(d.ageLabel).toMatch(/Data through Aug 30, 2026 · updated (today|yesterday|\d+ days ago)/)
      }
      expect(d3.freshnessState).toBe('missing')
      expect(d3.dataThroughLabel).toBeNull()
      // bound examples carry a real current value + threshold
      expect(d1.currentValue).not.toBeNull(); expect(d1.threshold).toBe(0.5)
      expect(d2.currentValue).toBe(RT_ACTUAL[profile]); expect(d2.metric_id).toBe('dashboard.response_time_actual_avg_min')
      expect(d4.currentValue).toBe(0); expect(d4.threshold).toBe(0)
      // unbound draft: visible as unavailable, no fabricated value, not registrable
      expect(d3.metric_id).toBeNull(); expect(d3.currentValue).toBeNull(); expect(d3.bound).toBe(false)
      expect(toPausedMetricAlertInput(d3)).toBeNull()
    }
  })
})
