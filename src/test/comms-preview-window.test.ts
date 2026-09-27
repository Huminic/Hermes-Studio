import { describe, it, expect } from 'vitest'
import { computeReportWindow } from '../../scripts/comms-preview'
import { DEFAULT_BUSINESS_HOURS, type BusinessHoursCfg } from '../server/lead-aging'

const cfg: BusinessHoursCfg = { ...DEFAULT_BUSINESS_HOURS } // Chicago, 08–19, Mon–Sat

/** Format a ms instant as "YYYY-MM-DD HH:mm" in the store tz. */
function fmt(ms: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: cfg.tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(ms))
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}`
}

describe('computeReportWindow (N3.2 weekend-aware morning window)', () => {
  it('MONDAY morning covers Saturday CLOSE → Monday OPEN (Sunday skipped)', () => {
    const { start, end } = computeReportWindow({
      date: '2026-09-28', // Monday
      window: 'morning',
      cfg,
      now: Date.parse('2026-09-28T13:00:00Z'),
    })
    expect(fmt(start)).toBe('2026-09-26 19:00') // Saturday close
    expect(fmt(end)).toBe('2026-09-28 08:00') // Monday open
  })

  it('TUESDAY morning covers Monday CLOSE → Tuesday OPEN', () => {
    const { start, end } = computeReportWindow({
      date: '2026-09-29', // Tuesday
      window: 'morning',
      cfg,
      now: Date.parse('2026-09-29T13:00:00Z'),
    })
    expect(fmt(start)).toBe('2026-09-28 19:00') // Monday close
    expect(fmt(end)).toBe('2026-09-29 08:00') // Tuesday open
  })

  it('a holiday on the previous day is skipped like Sunday', () => {
    const withHoliday: BusinessHoursCfg = {
      ...cfg,
      holidays: new Set(['2026-09-28']), // Monday is a holiday
    }
    const { start } = computeReportWindow({
      date: '2026-09-29', // Tuesday; Monday frozen ⇒ fall back to Saturday close
      window: 'morning',
      cfg: withHoliday,
      now: Date.parse('2026-09-29T13:00:00Z'),
    })
    expect(fmt(start)).toBe('2026-09-26 19:00') // Saturday close
  })

  it('WRAPUP covers report-day OPEN → now', () => {
    const now = Date.parse('2026-09-28T23:00:00Z')
    const { start, end } = computeReportWindow({
      date: '2026-09-28',
      window: 'wrapup',
      cfg,
      now,
    })
    expect(fmt(start)).toBe('2026-09-28 08:00') // report-day open
    expect(end).toBe(now)
  })
})
