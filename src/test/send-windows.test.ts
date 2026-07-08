import { describe, expect, it } from 'vitest'
import {
  windowState,
  immediateWindowState,
  followupWindowState,
  DEFAULT_IMMEDIATE_WINDOWS,
  DEFAULT_FOLLOWUP_WINDOWS,
  type SendWindow,
} from '../server/send-windows'

const CT = 'America/Chicago'

/** ms for a wall-clock in America/Chicago on a summer (CDT, -05:00) date. */
function ctSummer(hhmm: string): number {
  return Date.parse(`2026-07-08T${hhmm}:00-05:00`)
}
/** ms for a wall-clock in America/Chicago on a winter (CST, -06:00) date. */
function ctWinter(hhmm: string): number {
  return Date.parse(`2026-01-08T${hhmm}:00-06:00`)
}

// Immediate = morning pre-open catch (08:00–09:00) + evening after-hours 6–8pm.
const IMMEDIATE: SendWindow[] = [
  { start: '08:00', end: '09:00' },
  { start: '18:00', end: '20:00' },
]

// How the catch-up scripts actually call the module in production: serra-honda's
// studio config carries business_hours.tz = America/Chicago, so the window tz
// resolves to Central. Tests feed CT wall-clock, so they must pass this shape.
const CT_CFG = { business_hours: { tz: CT, start: '08:00', end: '21:00' } }

describe('windowState', () => {
  it('is open inside a window (evening 6–8pm)', () => {
    expect(windowState(IMMEDIATE, CT, ctSummer('19:00')).open).toBe(true)
  })
  it('is open inside the morning window', () => {
    expect(windowState(IMMEDIATE, CT, ctSummer('08:30')).open).toBe(true)
  })
  it('is closed between windows (business hours) with nextOpen = evening 18:00', () => {
    const s = windowState(IMMEDIATE, CT, ctSummer('09:30'))
    expect(s.open).toBe(false)
    expect(s.nextOpenMs).toBe(ctSummer('18:00'))
  })
  it('is closed at night (post-20:00) with nextOpen = 08:00 next day', () => {
    const s = windowState(IMMEDIATE, CT, ctSummer('22:00'))
    expect(s.open).toBe(false)
    expect(s.nextOpenMs).toBe(Date.parse('2026-07-09T08:00:00-05:00'))
  })
  it('is closed pre-dawn (before 08:00) with nextOpen = 08:00 same day', () => {
    const s = windowState(IMMEDIATE, CT, ctSummer('02:00'))
    expect(s.open).toBe(false)
    expect(s.nextOpenMs).toBe(ctSummer('08:00'))
  })
  it('treats window start as inclusive and end as exclusive', () => {
    expect(windowState(IMMEDIATE, CT, ctSummer('08:00')).open).toBe(true)
    expect(windowState(IMMEDIATE, CT, ctSummer('09:00')).open).toBe(false)
    expect(windowState(IMMEDIATE, CT, ctSummer('18:00')).open).toBe(true)
    expect(windowState(IMMEDIATE, CT, ctSummer('20:00')).open).toBe(false)
  })
  it('is timezone-aware across DST (winter CST evening is open)', () => {
    expect(windowState(IMMEDIATE, CT, ctWinter('19:00')).open).toBe(true)
    expect(windowState(IMMEDIATE, CT, ctWinter('03:00')).open).toBe(false)
  })
})

describe('immediateWindowState — A2P/after-hours defaults (6–8pm + 8am)', () => {
  it('defaults are exactly 08:00-09:00 + 18:00-20:00', () => {
    expect(DEFAULT_IMMEDIATE_WINDOWS).toEqual([
      { start: '08:00', end: '09:00' },
      { start: '18:00', end: '20:00' },
    ])
  })
  it('off-hours (20:00 → 08:00, incl. TCPA quiet hours) are NEVER inside the immediate window', () => {
    for (const t of ['20:00', '20:30', '22:30', '00:00', '03:00', '06:00', '07:59']) {
      expect(immediateWindowState(CT_CFG, ctSummer(t)).open).toBe(false)
    }
  })
  it('business hours (09:00-18:00) are NOT inside the immediate window', () => {
    for (const t of ['09:00', '12:00', '15:00', '17:59']) {
      expect(immediateWindowState(CT_CFG, ctSummer(t)).open).toBe(false)
    }
    expect(immediateWindowState(CT_CFG, ctSummer('18:00')).open).toBe(true)
  })
  it('overnight arrival resolves nextOpen to 08:00', () => {
    const s = immediateWindowState(CT_CFG, ctSummer('23:15'))
    expect(s.open).toBe(false)
    expect(s.nextOpenMs).toBe(Date.parse('2026-07-09T08:00:00-05:00'))
  })
  it('inherits business_hours.tz when send_windows.tz is absent', () => {
    expect(immediateWindowState(CT_CFG, ctSummer('19:00')).open).toBe(true)
  })
  it('falls back to the platform default tz (America/New_York) when no tz configured', () => {
    // undefined cfg => NY tz. 19:00 EDT is inside the 18:00-20:00 window.
    const eastEvening = Date.parse('2026-07-08T19:00:00-04:00')
    expect(immediateWindowState(undefined, eastEvening).open).toBe(true)
    // 19:00 CDT == 20:00 EDT => NOT inside (end exclusive) under the NY fallback.
    expect(immediateWindowState(undefined, ctSummer('19:00')).open).toBe(false)
  })
  it('honors an explicit send_windows override', () => {
    const cfg = {
      send_windows: { tz: CT, immediate: [{ start: '18:00', end: '22:00' }] },
    }
    expect(immediateWindowState(cfg, ctSummer('21:30')).open).toBe(true)
    expect(immediateWindowState(cfg, ctSummer('08:30')).open).toBe(false)
  })
})

describe('followupWindowState — A2P daytime', () => {
  it('default is the full A2P window 08:00-21:00', () => {
    expect(DEFAULT_FOLLOWUP_WINDOWS).toEqual([{ start: '08:00', end: '21:00' }])
  })
  it('is open across the daytime and closed in quiet hours', () => {
    expect(followupWindowState(CT_CFG, ctSummer('12:00')).open).toBe(true)
    expect(followupWindowState(CT_CFG, ctSummer('08:00')).open).toBe(true)
    expect(followupWindowState(CT_CFG, ctSummer('20:59')).open).toBe(true)
    expect(followupWindowState(CT_CFG, ctSummer('21:00')).open).toBe(false)
    expect(followupWindowState(CT_CFG, ctSummer('07:00')).open).toBe(false)
    expect(followupWindowState(CT_CFG, ctSummer('23:00')).open).toBe(false)
  })
})
