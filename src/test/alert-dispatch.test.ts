import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createMetricAlert, listMetricAlerts } from '@/server/watchdog/notifications-store'
import { evaluateProfileAlerts, resolveHubMetricValues } from '@/server/watchdog/alert-engine'
import { dispatchFiringAlerts, renderAlertEmail } from '@/server/watchdog/alert-dispatch'
import type { CockpitWindow } from '@/server/cockpit/cockpit-window'

let tmp: string
const P = 'serra-honda'
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'alert-disp-'))
  process.env.BRAIN_PROFILES_ROOT = path.join(tmp, '.hermes', 'profiles')
})
afterEach(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
})

const win: CockpitWindow = {
  threads: 100, touched: 200, replied: 40, conversed: 20, intent: 5, resurrections: 3,
  ah_threads: 30, after_hours_pct: 30, median_reply_secs: 4, channels: {},
  work: { messages_sent: 0, messages_received: 0, messages_after_hours: 0, automation_runs: 0, agent_replies: 0, total: 0 },
}

/** Create a reply-rate alert that fires (0.20 < 0.25) and return its firing decisions. */
function firingDecisions(now: number) {
  createMetricAlert({ profile: P, email: 'gm@serra.co', metric_id: 'engagement.reply_rate', metric_label: 'SMS reply rate', rule_type: 'threshold', direction: 'below', threshold: 0.25 }, 1000)
  return evaluateProfileAlerts(P, { values: resolveHubMetricValues(win), now })
}

describe('renderAlertEmail', () => {
  it('includes the message and states no action was taken', () => {
    const e = renderAlertEmail({ query_name: 'Reply rate low', description: 'watches reply rate' }, 'SMS reply rate fell below 25% (now 20%).', 'Serra Honda')
    expect(e.subject).toBe('Watchdog alert: Reply rate low')
    expect(e.text).toMatch(/fell below 25%/)
    expect(e.text).toMatch(/No action was taken/i)
    expect(e.html).toMatch(/Serra Honda/)
  })
})

describe('dispatchFiringAlerts', () => {
  it('DRY-RUN by default: sends nothing, stamps nothing', async () => {
    const decisions = firingDecisions(2000)
    const sender = vi.fn()
    const res = await dispatchFiringAlerts(P, decisions, { now: 2000, sender })
    expect(res).toHaveLength(1)
    expect(res[0]).toMatchObject({ dry_run: true, sent: false, to: 'gm@serra.co' })
    expect(sender).not.toHaveBeenCalled()
    expect(listMetricAlerts(P)[0].last_fired_at).toBeNull() // not stamped
  })

  it('send:true with a successful sender emails once and stamps dedup', async () => {
    const decisions = firingDecisions(2000)
    const sender = vi.fn().mockResolvedValue({ ok: true, email_id: 'e1' })
    const res = await dispatchFiringAlerts(P, decisions, { now: 2000, send: true, sender, dealer: 'Serra Honda' })
    expect(res[0]).toMatchObject({ dry_run: false, sent: true })
    expect(sender).toHaveBeenCalledTimes(1)
    const sent = sender.mock.calls[0][0]
    expect(sent.to).toBe('gm@serra.co')
    expect(sent.subject).toMatch(/Watchdog alert/)
    // stamped → a re-evaluation within 24h now withholds (dedup wired end-to-end)
    const alertNow = listMetricAlerts(P)[0]
    expect(alertNow.last_fired_at).toBe(2000)
    const reeval = evaluateProfileAlerts(P, { values: resolveHubMetricValues(win), now: 2000 + 60_000 })
    expect(reeval[0].decision.fires).toBe(false)
  })

  it('a failed send is NOT stamped (so it can retry)', async () => {
    const decisions = firingDecisions(2000)
    const sender = vi.fn().mockResolvedValue({ ok: false, error: 'rate limited' })
    const res = await dispatchFiringAlerts(P, decisions, { now: 2000, send: true, sender })
    expect(res[0]).toMatchObject({ dry_run: false, sent: false, error: 'rate limited' })
    expect(listMetricAlerts(P)[0].last_fired_at).toBeNull()
  })

  it('no firing alerts → nothing dispatched', async () => {
    // reply rate 0.60 does not fall below 0.25
    createMetricAlert({ profile: P, email: 'gm@serra.co', metric_id: 'engagement.reply_rate', metric_label: 'SMS reply rate', rule_type: 'threshold', direction: 'below', threshold: 0.25 }, 1000)
    const values = resolveHubMetricValues({ ...win, replied: 120 })
    const decisions = evaluateProfileAlerts(P, { values, now: 2000 })
    const res = await dispatchFiringAlerts(P, decisions, { now: 2000, send: true, sender: vi.fn() })
    expect(res).toHaveLength(0)
  })
})
