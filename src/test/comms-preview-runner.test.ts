import { describe, it, expect, vi } from 'vitest'
import { writePreviewArtifacts, type PreviewInput } from '../server/comms-preview'

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
    staleStatus: [],
  },
}

describe('writePreviewArtifacts', () => {
  it('writes the six preview artifacts from an injected bundle input', () => {
    const written = new Map<string, string>()
    const { files } = writePreviewArtifacts({
      bundle: input,
      outDir: '/tmp/preview',
      rawCounts: { profile: 'serra-nissan', reportWindow: { start: 's', end: 'e' } },
      writeFile: (p, c) => written.set(p, c),
    })

    expect(files.sort()).toEqual(
      [
        '/tmp/preview/serra-nissan-alerts.json',
        '/tmp/preview/serra-nissan-daily-management.json',
        '/tmp/preview/serra-nissan-lead-source.json',
        '/tmp/preview/serra-nissan-preview.txt',
        '/tmp/preview/serra-nissan-raw-counts.json',
        '/tmp/preview/serra-nissan-text-report.txt',
      ].sort(),
    )
    expect(written.size).toBe(6)

    // The four JSON artifacts parse; the two text artifacts read as expected.
    const daily = JSON.parse(written.get('/tmp/preview/serra-nissan-daily-management.json')!)
    expect(daily.title).toBe('Daily AI Management Report')
    const leadSource = JSON.parse(written.get('/tmp/preview/serra-nissan-lead-source.json')!)
    expect(leadSource[0].source).toBe('Cars.com')
    const alerts = JSON.parse(written.get('/tmp/preview/serra-nissan-alerts.json')!)
    expect(alerts.staleStatus).toEqual([])
    const raw = JSON.parse(written.get('/tmp/preview/serra-nissan-raw-counts.json')!)
    expect(raw.reportWindow.start).toBe('s')
    expect(written.get('/tmp/preview/serra-nissan-text-report.txt')).toContain('14 new leads today')
    expect(written.get('/tmp/preview/serra-nissan-preview.txt')).toContain('Nightly Text Report')
  })
})

// Prove the preview path can never send: if its module graph pulled in a send
// module, that module's mock factory would run and flip the flag. We import the
// server module AND the runner script; both must leave every flag false. This is
// a behavioural graph check (no source-text/regex reading).
const sendLoaded = vi.hoisted(() => ({ automations: false, adapters: false }))
vi.mock('@/server/automations', () => {
  sendLoaded.automations = true
  return {}
})
vi.mock('@/server/messaging-adapters', () => {
  sendLoaded.adapters = true
  return {}
})

describe('comms-preview no-send module graph', () => {
  it('imports neither sendAutomationNow (automations) nor dispatchSms/dispatchOutbound (messaging-adapters) nor the TextMagic send path', async () => {
    await import('../server/comms-preview')
    await import('../../scripts/comms-preview')
    expect(sendLoaded).toEqual({ automations: false, adapters: false })
  })
})
