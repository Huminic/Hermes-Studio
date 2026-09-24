import { describe, it, expect } from 'vitest'
import {
  splitByBusinessHours,
  avgAfterHoursTimeToTextMin,
  buildDailyManagementReport,
} from '../server/daily-management-report'

// America/Chicago, Feb (no DST) = UTC-6.
describe('splitByBusinessHours', () => {
  it('classifies each instant as during vs after hours', () => {
    const during = Date.parse('2026-02-04T16:00:00Z') // Wed 10:00 CT
    const after = Date.parse('2026-02-05T04:00:00Z') // Wed 22:00 CT
    expect(splitByBusinessHours([during, after, during])).toEqual({ during: 2, after: 1 })
  })
})

describe('avgAfterHoursTimeToTextMin', () => {
  it('measures BUSINESS-hours minutes from after-hours inbound to first reply', () => {
    // Inbound Wed 20:00 CT (after hours) → outbound Thu 09:00 CT.
    // Business-hours elapsed = Thu 08:00→09:00 = 60 min (Wed 20:00 is past close).
    const inbound = Date.parse('2026-02-05T02:00:00Z') // Wed 20:00 CT
    const outbound = Date.parse('2026-02-05T15:00:00Z') // Thu 09:00 CT
    // A business-hours inbound pair must be EXCLUDED from this metric.
    const bizInbound = Date.parse('2026-02-04T16:00:00Z') // Wed 10:00 CT
    const bizOutbound = Date.parse('2026-02-04T16:30:00Z') // Wed 10:30 CT
    const avg = avgAfterHoursTimeToTextMin([
      { inboundMs: inbound, firstOutboundMs: outbound },
      { inboundMs: bizInbound, firstOutboundMs: bizOutbound },
    ])
    expect(avg).toBe(60)
  })

  it('returns null when no after-hours pairs qualify', () => {
    const bizInbound = Date.parse('2026-02-04T16:00:00Z')
    expect(
      avgAfterHoursTimeToTextMin([{ inboundMs: bizInbound, firstOutboundMs: bizInbound + 60_000 }]),
    ).toBeNull()
  })
})

describe('buildDailyManagementReport', () => {
  it('assembles all lines, omits appointments/per-rep, and notes the omission', () => {
    const r = buildDailyManagementReport({
      date: '2026-09-22',
      metrics: {
        leadsDuringDay: 8,
        leadsAfterHours: 3,
        afterHoursInboundCalls: 2,
        textsSentOnBehalf: 40,
        teamboxSent: 55,
        teamboxReceived: 61,
        afterHoursAvgTimeToTextMin: 12,
        businessHoursTextCount: 30,
        leadsLeftBehind: 4,
        activeLeads30d: 120,
      },
    })
    expect(r.title).toBe('Daily AI Management Report')
    const labels = r.lines.map((l) => l.label).join(' | ')
    expect(labels).not.toMatch(/appointment/i)
    expect(labels).not.toMatch(/salesperson|per-rep|team sales/i)
    expect(r.lines.find((l) => l.label.startsWith('Active leads'))!.value).toBe(120)
    expect(r.footnote).toMatch(/service excluded/i)
    expect(r.footnote).toMatch(/Appointments/)
  })

  it("renders 'n/a' for a null after-hours time-to-text", () => {
    const r = buildDailyManagementReport({
      date: '2026-09-22',
      metrics: {
        leadsDuringDay: 0,
        leadsAfterHours: 0,
        afterHoursInboundCalls: 0,
        textsSentOnBehalf: 0,
        teamboxSent: 0,
        teamboxReceived: 0,
        afterHoursAvgTimeToTextMin: null,
        businessHoursTextCount: 0,
        leadsLeftBehind: 0,
        activeLeads30d: 0,
      },
    })
    expect(r.lines.find((l) => l.label.includes('time-to-text'))!.value).toBe('n/a')
  })
})
