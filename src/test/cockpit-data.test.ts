import { describe, it, expect } from 'vitest'
import {
  buildCockpitView,
  heartbeatsFromWindow,
  parseBusinessHours,
} from '@/server/cockpit/cockpit-data'
import type { CockpitWindow } from '@/server/cockpit/cockpit-window'
import { computePackStatus, PACKS } from '@/components/customer-console/cockpit/power-packs'

const win = (over: Partial<CockpitWindow> = {}): CockpitWindow => ({
  threads: 100,
  touched: 272,
  replied: 61,
  conversed: 31,
  intent: 7,
  ah_threads: 44,
  after_hours_pct: 44,
  median_reply_secs: 3,
  channels: { sms: 61, chat: 2, video: 4, voice: 1 },
  work: { messages_sent: 428, messages_received: 120, messages_after_hours: 190, automation_runs: 311, agent_replies: 88, total: 827 },
  ...over,
})

describe('buildCockpitView (gauge math)', () => {
  it('Reach = touched / CRM leads, clamped, with a share sub', () => {
    const v = buildCockpitView(win(), { crmLeads: 414, cumulativeActions: 159549, heartbeats: {}, windowDays: 30 })
    expect(v.reach.value).toBeCloseTo(272 / 414, 5)
    expect(v.reach.display).toBe('272')
    expect(v.reach.sub).toBe('66% of 414 leads')
  })

  it('Reach value clamps to 1 when touched exceeds CRM leads', () => {
    const v = buildCockpitView(win({ touched: 500 }), { crmLeads: 414, cumulativeActions: 0, heartbeats: {}, windowDays: 30 })
    expect(v.reach.value).toBe(1)
  })

  it('Reach is availability-safe when CRM leads unavailable (null value, honest sub)', () => {
    const v = buildCockpitView(win(), { crmLeads: null, cumulativeActions: 0, heartbeats: {}, windowDays: 30 })
    expect(v.reach.value).toBeNull()
    expect(v.reach.sub).toBe('this period')
  })

  it('Night Shift = after-hours share; null when no threads', () => {
    expect(buildCockpitView(win(), { crmLeads: 1, cumulativeActions: 0, heartbeats: {}, windowDays: 30 }).night.value).toBeCloseTo(0.44, 5)
    expect(buildCockpitView(win({ threads: 0 }), { crmLeads: 1, cumulativeActions: 0, heartbeats: {}, windowDays: 30 }).night.value).toBeNull()
  })

  it('carries odometer + median reply through', () => {
    const v = buildCockpitView(win(), { crmLeads: 1, cumulativeActions: 159549, heartbeats: {}, windowDays: 30 })
    expect(v.odometer).toBe(159549)
    expect(v.median_reply_secs).toBe(3)
  })
})

describe('heartbeatsFromWindow → power-pack status (end to end)', () => {
  it('lights active packs Online, dark packs Ready', () => {
    const hb = heartbeatsFromWindow(win())
    const sms = PACKS.find((p) => p.id === 'sms')!
    const voice = PACKS.find((p) => p.id === 'voice')!
    expect(computePackStatus(sms, hb).status).toBe('online') // 61 sms
    expect(computePackStatus(voice, hb).status).toBe('online') // 1 voice
    // a store with no voice traffic → Ready
    const hbQuiet = heartbeatsFromWindow(win({ channels: { sms: 5 } }))
    expect(computePackStatus(voice, hbQuiet).status).toBe('ready')
  })
})

describe('parseBusinessHours', () => {
  it('parses HH:MM start/end + tz + closed days', () => {
    expect(parseBusinessHours({ tz: 'America/Chicago', start: '09:00', end: '19:00', closed_days: ['Sun'] })).toEqual({
      tz: 'America/Chicago',
      openH: 9,
      closeH: 19,
      closedDays: ['Sun'],
    })
  })
  it('falls back to 8-21 America/New_York on missing/invalid input', () => {
    expect(parseBusinessHours({})).toEqual({ tz: 'America/New_York', openH: 8, closeH: 21, closedDays: [] })
  })
})
