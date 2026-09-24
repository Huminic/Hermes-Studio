import { describe, it, expect } from 'vitest'
import { assemblePreviewBundle, renderPreviewText, type PreviewInput } from '../server/comms-preview'

const input: PreviewInput = {
  profile: 'serra-nissan',
  date: '2026-09-22',
  dailyMetrics: {
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
  leadSource: {
    window24h: [{ lead_source: 'Cars.com', opportunities: 5, sold: 1 }],
    window7d: [{ lead_source: 'Cars.com', opportunities: 20, sold: 4 }],
    window30d: [{ lead_source: 'Cars.com', opportunities: 80, sold: 12 }],
    prev24h: [{ lead_source: 'Cars.com', opportunities: 3, sold: 0 }],
  },
  textReport: {
    leadsToday: 14,
    salesLost: 2,
    active: 31,
    needsAttention: 5,
    leadsDelta: 'up',
    salesDelta: 'up',
    agentName: 'Caroline',
    rotation: 0,
  },
  alerts: {
    noStatus: ['A'],
    unactionedOver5Min: ['B', 'C'],
    sittingOver3Days: ['D'],
    staleStatus: ['E', 'F', 'G'],
  },
}

describe('assemblePreviewBundle', () => {
  it('composes all four artifacts from the injected data', () => {
    const b = assemblePreviewBundle(input)
    expect(b.dailyManagement.title).toBe('Daily AI Management Report')
    expect(b.leadSource[0].source).toBe('Cars.com')
    expect(b.leadSource[0].leadsDelta).toBe('up') // 5 vs 3
    expect(b.textReport).toContain('14 new leads today')
    expect(b.alerts.staleStatus).toHaveLength(3)
  })
})

describe('renderPreviewText', () => {
  it('renders every section with counts; no appointment/per-rep DATA lines (only the omission note)', () => {
    const bundle = assemblePreviewBundle(input)
    const txt = renderPreviewText(bundle)
    expect(txt).toContain('Daily AI Management Report')
    expect(txt).toContain('Lead Source Report')
    expect(txt).toContain('Nightly Text Report')
    expect(txt).toContain('Same status >1 week: 3')
    expect(txt).toContain('Active leads (last 30d): 120')
    // No appointment/per-rep METRIC line...
    const labels = bundle.dailyManagement.lines.map((l) => l.label).join(' | ')
    expect(labels).not.toMatch(/appointment|salesperson|per-rep/i)
    // ...but the footnote transparently states they're omitted, and service is excluded.
    expect(txt).toMatch(/intentionally omitted/)
    expect(txt).toContain('service excluded')
  })
})
