import { describe, it, expect } from 'vitest'
import {
  businessHoursElapsedMs,
  evaluateLeadAlerts,
  DEFAULT_BUSINESS_HOURS,
  type BusinessHoursCfg,
} from '../server/lead-aging'

const HOUR = 3_600_000
// America/Chicago is UTC-6 in February (no DST), so local = UTC-6.
const cfg: BusinessHoursCfg = DEFAULT_BUSINESS_HOURS

describe('businessHoursElapsedMs — operator rule (linear, Mon–Sat 08:00–19:00 CT)', () => {
  it("4pm → 9am next day = 4 hours (operator's own example)", () => {
    // Wed 2026-02-04 16:00 CT = 22:00Z ; Thu 2026-02-05 09:00 CT = 15:00Z
    const start = Date.parse('2026-02-04T22:00:00Z')
    const now = Date.parse('2026-02-05T15:00:00Z')
    // Wed 16:00→19:00 = 3h, Thu 08:00→09:00 = 1h → 4h
    expect(businessHoursElapsedMs(start, now, cfg)).toBe(4 * HOUR)
  })

  it('freezes overnight (same-day 10:00 → next-day-not-reached uses only open window)', () => {
    // Wed 10:00 CT → Wed 12:00 CT = 2h
    const start = Date.parse('2026-02-04T16:00:00Z') // 10:00 CT
    const now = Date.parse('2026-02-04T18:00:00Z') // 12:00 CT
    expect(businessHoursElapsedMs(start, now, cfg)).toBe(2 * HOUR)
  })

  it('freezes Sunday but counts Saturday', () => {
    // Fri 2026-02-06 18:00 CT (00:00Z Sat) → Mon 2026-02-09 09:00 CT (15:00Z Mon)
    // Fri 18:00→19:00 = 1h ; Sat 08:00→19:00 = 11h ; Sun frozen ; Mon 08:00→09:00 = 1h → 13h
    const start = Date.parse('2026-02-07T00:00:00Z')
    const now = Date.parse('2026-02-09T15:00:00Z')
    expect(businessHoursElapsedMs(start, now, cfg)).toBe(13 * HOUR)
  })

  it('freezes a configured holiday', () => {
    const withHoliday: BusinessHoursCfg = {
      ...cfg,
      holidays: new Set(['2026-02-05']), // freeze the Thursday
    }
    const start = Date.parse('2026-02-04T22:00:00Z') // Wed 16:00 CT
    const now = Date.parse('2026-02-05T15:00:00Z') // Thu 09:00 CT (holiday)
    // Wed 16:00→19:00 = 3h ; Thu frozen → 3h
    expect(businessHoursElapsedMs(start, now, withHoliday)).toBe(3 * HOUR)
  })

  it('returns 0 when now <= start', () => {
    const t = Date.parse('2026-02-04T22:00:00Z')
    expect(businessHoursElapsedMs(t, t, cfg)).toBe(0)
  })
})

describe('evaluateLeadAlerts', () => {
  const now = Date.parse('2026-02-05T15:00:00Z') // Thu 09:00 CT

  it('flags no-status leads', () => {
    const b = evaluateLeadAlerts({
      leads: [
        { leadId: 'A', leadStatus: '', leadStatusType: '' },
        { leadId: 'B', leadStatus: 'ACTIVE_NEW_LEAD', leadStatusType: 'ACTIVE', createdUtc: '2026-02-05T14:59:00Z' },
      ],
      now,
    })
    expect(b.noStatus).toEqual(['A'])
  })

  it('flags a new lead unactioned > 5 business-min, and > 3 days separately', () => {
    const b = evaluateLeadAlerts({
      leads: [
        // created Wed 16:00 CT → 4 business-hours aged by Thu 09:00 → >5min
        { leadId: 'OLD', leadStatus: 'ACTIVE_NEW_LEAD', leadStatusType: 'ACTIVE', createdUtc: '2026-02-04T22:00:00Z' },
        // created 2 min ago (business hours) → under 5min
        { leadId: 'FRESH', leadStatus: 'ACTIVE_NEW_LEAD', leadStatusType: 'ACTIVE', createdUtc: '2026-02-05T14:58:00Z' },
        // created 4 days ago → >3 days
        { leadId: 'STALE', leadStatus: 'ACTIVE_NEW_LEAD', leadStatusType: 'ACTIVE', createdUtc: '2026-02-01T15:00:00Z' },
      ],
      now,
    })
    expect(b.unactionedOver5Min).toContain('OLD')
    expect(b.unactionedOver5Min).not.toContain('FRESH')
    expect(b.sittingOver3Days).toContain('STALE')
  })

  it('ignores non-new (already actioned) statuses for the 5-min/3-day checks', () => {
    const b = evaluateLeadAlerts({
      leads: [
        { leadId: 'WORKING', leadStatus: 'WORKING', leadStatusType: 'ACTIVE', createdUtc: '2026-02-01T15:00:00Z' },
      ],
      now,
    })
    expect(b.unactionedOver5Min).toEqual([])
    expect(b.sittingOver3Days).toEqual([])
  })
})
