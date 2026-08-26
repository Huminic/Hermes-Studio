import { describe, it, expect } from 'vitest'
import {
  buildCockpitView,
  heartbeatsFromWindow,
  parseBusinessHours,
  trendArrow,
  storeAccent,
} from '@/server/cockpit/cockpit-data'
import type { CockpitWindow } from '@/server/cockpit/cockpit-window'
import { computePackStatus, PACKS } from '@/components/customer-console/cockpit/power-packs'

const win = (over: Partial<CockpitWindow> = {}): CockpitWindow => ({
  threads: 100,
  touched: 272,
  replied: 61,
  conversed: 31,
  intent: 7,
  resurrections: 7,
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

describe('AI Impact Board', () => {
  const byKey = (v: ReturnType<typeof buildCockpitView>) => new Map(v.impact.map((m) => [m.key, m]))

  it('produces the five top-line metrics from the window', () => {
    const m = byKey(buildCockpitView(win(), { crmLeads: 414, cumulativeActions: 0, heartbeats: {}, windowDays: 30 }))
    expect(m.get('ai_actions')).toMatchObject({ value: 827, display: '827' })
    expect(m.get('leads_touched')).toMatchObject({ value: 272 })
    expect(m.get('conversations')).toMatchObject({ value: 61 }) // threads with ≥1 real reply
  })

  it('Sales Touched + Revenue Presence are honest gaps until sourced (never a fabricated 0)', () => {
    const m = byKey(buildCockpitView(win(), { crmLeads: 1, cumulativeActions: 0, heartbeats: {}, windowDays: 30 }))
    expect(m.get('sales_touched')).toMatchObject({ value: null, display: '—', note: expect.any(String) })
    expect(m.get('revenue_presence')).toMatchObject({ value: null, display: '—' })
  })

  it('Revenue Presence = Sales Touched × GM gross when both supplied', () => {
    const m = byKey(buildCockpitView(win(), { crmLeads: 1, cumulativeActions: 0, heartbeats: {}, windowDays: 30, salesTouched: 3, gmGross: 2500 }))
    expect(m.get('sales_touched')).toMatchObject({ value: 3 })
    expect(m.get('revenue_presence')).toMatchObject({ value: 7500, display: '$7,500' })
  })

  it('WoW arrows: direction is the move, goodness is the color; null without a prior window', () => {
    const noPrev = byKey(buildCockpitView(win(), { crmLeads: 1, cumulativeActions: 0, heartbeats: {}, windowDays: 30 }))
    expect(noPrev.get('ai_actions')!.arrow).toBeNull()
    const up = byKey(buildCockpitView(win({ touched: 272 }), { crmLeads: 1, cumulativeActions: 0, heartbeats: {}, windowDays: 30, prev: win({ touched: 200 }) }))
    expect(up.get('leads_touched')!.arrow).toEqual({ dir: 'up', good: true })
    const down = byKey(buildCockpitView(win({ touched: 150 }), { crmLeads: 1, cumulativeActions: 0, heartbeats: {}, windowDays: 30, prev: win({ touched: 200 }) }))
    expect(down.get('leads_touched')!.arrow).toEqual({ dir: 'down', good: false })
  })

  it('accent defaults, maps known stores, and honors a valid config color', () => {
    expect(buildCockpitView(win(), { crmLeads: 1, cumulativeActions: 0, heartbeats: {}, windowDays: 30 }).accent).toBe('#4c8df6')
    expect(storeAccent('serra-honda')).toBe('#dc2626')
    expect(storeAccent('serra-nissan')).toBe('#c3002f')
    expect(storeAccent('tony-serra-ford')).toBe('#003478')
    expect(storeAccent('unknown-store')).toBe('#4c8df6')
    expect(storeAccent('serra-honda', '#123abc')).toBe('#123abc') // valid config override wins
    expect(storeAccent('serra-honda', 'not-a-color')).toBe('#dc2626') // invalid ignored
  })
})

describe('Night Shift & Resurrections view block', () => {
  it('carries after-hours share, count, median clock, and resurrections from the window', () => {
    const v = buildCockpitView(win(), { crmLeads: 1, cumulativeActions: 0, heartbeats: {}, windowDays: 30 })
    expect(v.night_shift).toEqual({ after_hours_pct: 44, ah_threads: 44, median_reply_secs: 3, resurrections: 7 })
  })
})

describe('Engagement Ladder', () => {
  const rung = (v: ReturnType<typeof buildCockpitView>, key: string) => v.ladder.find((r) => r.key === key)!

  it('first four rungs are real hub counts with conversion from the prior rung', () => {
    const v = buildCockpitView(win(), { crmLeads: 1, cumulativeActions: 0, heartbeats: {}, windowDays: 30 })
    expect(rung(v, 'reached').count).toBe(272)
    expect(rung(v, 'replied')).toMatchObject({ count: 61, conv: Math.round((61 / 272) * 1000) / 1000 })
    expect(rung(v, 'conversed')).toMatchObject({ count: 31, conv: Math.round((31 / 61) * 1000) / 1000 })
    expect(rung(v, 'intent')).toMatchObject({ count: 7, conv: Math.round((7 / 31) * 1000) / 1000 })
  })

  it('Walked In / Sold is an honest gap (null + note), never a fabricated 0', () => {
    const v = buildCockpitView(win(), { crmLeads: 1, cumulativeActions: 0, heartbeats: {}, windowDays: 30 })
    expect(rung(v, 'sold')).toMatchObject({ count: null, conv: null, note: expect.any(String) })
  })

  it('conversion is null when the prior rung is zero (no divide-by-zero fabrication)', () => {
    const v = buildCockpitView(win({ touched: 0, replied: 0 }), { crmLeads: 1, cumulativeActions: 0, heartbeats: {}, windowDays: 30 })
    expect(rung(v, 'replied').conv).toBeNull()
  })
})

describe('trendArrow (direction=arrow, goodness=color)', () => {
  it('up-good metric: rising is favorable, falling is not', () => {
    expect(trendArrow(10, 5, true)).toEqual({ dir: 'up', good: true })
    expect(trendArrow(5, 10, true)).toEqual({ dir: 'down', good: false })
  })
  it('inverted metric (e.g. lost leads): rising is a red up-arrow', () => {
    expect(trendArrow(10, 5, false)).toEqual({ dir: 'up', good: false })
    expect(trendArrow(5, 10, false)).toEqual({ dir: 'down', good: true })
  })
  it('flat + missing', () => {
    expect(trendArrow(5, 5, true)).toEqual({ dir: 'flat', good: true })
    expect(trendArrow(5, null, true)).toBeNull()
    expect(trendArrow(null, 5, true)).toBeNull()
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
