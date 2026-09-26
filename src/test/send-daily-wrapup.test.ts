import { describe, it, expect, vi } from 'vitest'
import { renderWrapupEmail } from '../server/lead-notifications'
import { writePreviewArtifacts, type PreviewInput } from '../server/comms-preview'
import { buildDailyManagementReport } from '../server/daily-management-report'
import { sendDailyWrapup } from '../../scripts/send-daily-wrapup'
import type { SendFn } from '../../scripts/send-daily-report'

const report = buildDailyManagementReport({
  date: '2026-09-25',
  metrics: {
    leadsDuringDay: 12,
    leadsAfterHours: 0,
    afterHoursInboundCalls: 0,
    textsSentOnBehalf: 15,
    teamboxSent: 5,
    teamboxReceived: 4,
    afterHoursAvgTimeToTextMin: null,
    businessHoursTextCount: 15,
    leadsLeftBehind: 1,
    activeLeads30d: 90,
  },
})

describe('renderWrapupEmail', () => {
  it('renders the wrap-up tiles, source rows, needs attention and the sold/lost cohort row', () => {
    const { subject, html } = renderWrapupEmail({
      storeName: 'Serra Nissan',
      agentName: 'Caroline',
      date: '2026-09-25',
      generatedAt: '2026-09-25T23:30:00.000Z',
      tiles: {
        leadsToday: 12,
        aiTextsSent: 15,
        repliesReceived: 7,
        needsAttentionCount: 1,
        leadsDelta: { text: '3 vs yesterday', direction: 'up' },
      },
      leadsBySource: [
        { source: 'Cars.com', leads: 6 },
        { source: 'Website', leads: 4 },
      ],
      needsAttention: [
        { leadId: 'L9', firstName: 'Sam', source: 'Cars.com', hoursWaiting: 2, status: 'ACTIVE_NEW_LEAD', leadType: 'INTERNET' },
      ],
      cohort: { sold: 2, lost: 1 },
      footnote: report.footnote,
    })
    expect(subject).toBe('Daily Wrap-up — Serra Nissan — 2026-09-25')
    expect(html).toContain('Leads today')
    expect(html).toContain('Replies received')
    expect(html).toContain('leads by source')
    expect(html).toContain('Cars.com')
    expect(html).toContain('Sam')
    expect(html).toContain('Sold / lost today')
  })
})

describe('writePreviewArtifacts namePrefix (wrapup)', () => {
  const input: PreviewInput = {
    profile: 'serra-nissan',
    date: '2026-09-25',
    dailyMetrics: {
      leadsDuringDay: 1,
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
    leadSource: { window24h: [], window7d: [], window30d: [], prev24h: [] },
    textReport: { leadsToday: 1, salesLost: 0, active: 0, needsAttention: 0, leadsDelta: 'up', salesDelta: 'even', agentName: 'Caroline', rotation: 0 },
    alerts: { noStatus: [], unactionedOver5Min: [], sittingOver3Days: [], staleStatus: [] },
  }
  it('writes files with the -wrapup prefix when namePrefix is set', () => {
    const written = new Map<string, string>()
    const { files } = writePreviewArtifacts({
      bundle: input,
      outDir: '/tmp/preview',
      rawCounts: {},
      namePrefix: 'serra-nissan-wrapup',
      writeFile: (p, c) => written.set(p, c),
    })
    expect(files).toContain('/tmp/preview/serra-nissan-wrapup-daily-management.json')
    expect(files).toContain('/tmp/preview/serra-nissan-wrapup-text-report.txt')
    expect(files.every((f) => f.includes('serra-nissan-wrapup-'))).toBe(true)
  })
})

describe('sendDailyWrapup', () => {
  const raw = {
    generatedAt: '2026-09-25T23:30:00.000Z',
    businessHours: { tz: 'America/Chicago', startHour: 8, endHour: 19 },
    reportWindow: { end: '2026-09-25T23:30:00.000Z' },
    dailyManagement: {
      leadsDuringDay: 12,
      leadsAfterHours: 0,
      textsSentOnBehalf: 15,
      repliesReceived: 7,
      soldToday: 2,
      lostToday: 1,
    },
    leadSource: { window24h: { opportunities: 12 }, prev24h: { opportunities: 9 } },
  }
  const sourceRows = [
    { source: 'Cars.com', leads24h: 6, leads7d: 20, leads30d: 60, sold24h: 1, sold7d: 2, sold30d: 4, leadsDelta: 'up', soldDelta: 'up' },
    { source: 'Website', leads24h: 4, leads7d: 10, leads30d: 30, sold24h: 0, sold7d: 0, sold30d: 1, leadsDelta: 'up', soldDelta: 'even' },
  ]
  const alerts = {
    noStatus: [],
    unactionedOver5Min: ['L9'],
    sittingOver3Days: [],
    staleStatus: [],
    details: {
      noStatus: [],
      unactionedOver5Min: [
        { leadId: 'L9', firstName: 'Sam', source: 'Cars.com', createdUtc: '2026-09-25T15:00:00.000Z', leadStatus: 'ACTIVE_NEW_LEAD', leadType: 'INTERNET' },
      ],
      sittingOver3Days: [],
    },
  }
  const artifacts: Record<string, string> = {
    'out/serra-nissan-wrapup-daily-management.json': JSON.stringify(report),
    'out/serra-nissan-wrapup-raw-counts.json': JSON.stringify(raw),
    'out/serra-nissan-wrapup-lead-source.json': JSON.stringify(sourceRows),
    'out/serra-nissan-wrapup-alerts.json': JSON.stringify(alerts),
  }
  const readFile = (p: string) => {
    const key = Object.keys(artifacts).find((k) => p.endsWith(k))
    if (!key) throw new Error(`unexpected read ${p}`)
    return artifacts[key]
  }

  it('DRY-RUN: writes -wrapup-email.html, pulls today counts, calls NO sender', async () => {
    const written = new Map<string, string>()
    const sender = vi.fn<SendFn>()
    const out = await sendDailyWrapup({
      profile: 'serra-nissan',
      fromDir: 'out',
      to: ['gm@store.com'],
      storeName: 'Serra Nissan',
      send: false,
      deps: { readFile, writeFile: (p, c) => written.set(p, c), sender },
    })
    expect(sender).not.toHaveBeenCalled()
    expect(out.htmlPath.endsWith('serra-nissan-wrapup-email.html')).toBe(true)
    expect(out.subject).toBe('Daily Wrap-up — Serra Nissan — 2026-09-25')
    expect(out.html).toContain('Sam')
    expect(out.html).toContain('Cars.com')
  })

  it('--send: calls the injected sender once', async () => {
    const sender = vi.fn<SendFn>().mockResolvedValue({ ok: true, email_id: 'em_3' })
    const out = await sendDailyWrapup({
      profile: 'serra-nissan',
      fromDir: 'out',
      to: ['gm@store.com'],
      storeName: 'Serra Nissan',
      send: true,
      deps: { readFile, writeFile: () => {}, sender },
    })
    expect(sender).toHaveBeenCalledTimes(1)
    expect(out.result).toEqual({ ok: true, email_id: 'em_3' })
  })
})
