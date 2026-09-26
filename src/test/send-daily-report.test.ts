import { describe, it, expect, vi } from 'vitest'
import { renderDailyManagementEmail } from '../server/lead-notifications'
import { buildDailyManagementReport } from '../server/daily-management-report'
import { sendDailyReport, type SendFn } from '../../scripts/send-daily-report'

const report = buildDailyManagementReport({
  date: '2026-09-24',
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

describe('renderDailyManagementEmail (N2.1 report design)', () => {
  it('renders the subject, KPI tiles, needs-attention rows, AI coverage and a single omission footnote', () => {
    const { subject, html, text } = renderDailyManagementEmail({
      storeName: 'Tony Serra Ford',
      agentName: 'Georgia',
      date: '2026-09-24',
      generatedAt: '2026-09-24T13:00:00.000Z',
      tiles: {
        leadsDuringDay: 8,
        leadsAfterHours: 3,
        aiTextsSent: 40,
        afterHoursCalls: 2,
        needsAttentionCount: 2,
        newLeadsDelta: { text: '2 vs prior 24h', direction: 'up' },
      },
      coverage: {
        afterHoursLeadsHandled: 3,
        avgTimeToTextMin: 12,
        businessHoursTexts: 30,
        activeLeads30d: 120,
      },
      needsAttention: [
        { leadId: 'L1', firstName: 'Jane', source: 'Cars.com', hoursWaiting: 4, status: 'ACTIVE_NEW_LEAD', leadType: 'INTERNET' },
        { leadId: 'L2', firstName: null, source: 'Website', hoursWaiting: 30, status: 'ACTIVE_NEW_LEAD', leadType: 'PHONE' },
      ],
      footnote: report.footnote,
      cta: { label: 'Open VinSolutions', url: 'https://apps.vinsolutions.com/' },
    })
    expect(subject).toBe('Daily AI Management Report — Tony Serra Ford — 2026-09-24')
    // tiles: total new leads (8+3), texts, needs attention
    expect(html).toContain('11') // 8 + 3 new leads
    expect(html).toContain('New leads')
    expect(html).toContain('Needs attention')
    // needs-attention rows: named + fallback id
    expect(html).toContain('Jane')
    expect(html).toContain('Lead L2')
    expect(html).toContain('Cars.com')
    // AI coverage row identity is the agent
    expect(html).toContain('Georgia')
    // CTA
    expect(html).toContain('Open VinSolutions')
    // omission footnote appears exactly once; "Sales only" is not duplicated by the generated line
    expect(html.split('intentionally omitted').length - 1).toBe(1)
    expect(html.split('Sales only').length - 1).toBe(1)
    expect(html).toContain('Generated 2026-09-24T13:00:00.000Z')
    expect(text).toContain('New leads: 11')
  })
})

describe('sendDailyReport', () => {
  const rawCounts = {
    generatedAt: '2026-09-24T13:00:00.000Z',
    businessHours: { tz: 'America/Chicago', startHour: 8, endHour: 19 },
    reportWindow: { start: '2026-09-23T13:00:00.000Z', end: '2026-09-24T13:00:00.000Z' },
    dailyManagement: {
      leadsDuringDay: 8,
      leadsAfterHours: 3,
      afterHoursInboundCalls: { value: 2 },
      textsSentOnBehalf: 40,
      businessHoursTextCount: 30,
      afterHoursAvgTimeToTextMin: { value: 12 },
      activeLeads30d: 120,
    },
    leadSource: { window24h: { opportunities: 7 }, prev24h: { opportunities: 5 } },
  }
  const alerts = {
    noStatus: [],
    unactionedOver5Min: ['L1'],
    sittingOver3Days: ['L2'],
    staleStatus: [],
    details: {
      noStatus: [],
      unactionedOver5Min: [
        { leadId: 'L1', firstName: 'Jane', source: 'Cars.com', createdUtc: '2026-09-24T11:30:00.000Z', leadStatus: 'ACTIVE_NEW_LEAD', leadType: 'INTERNET' },
      ],
      sittingOver3Days: [
        { leadId: 'L2', firstName: 'Bob', source: 'Website', createdUtc: '2026-09-20T09:00:00.000Z', leadStatus: 'ACTIVE_NEW_LEAD', leadType: 'PHONE' },
      ],
    },
  }
  const artifacts: Record<string, string> = {
    'out/serra-ford-daily-management.json': JSON.stringify(report),
    'out/serra-ford-raw-counts.json': JSON.stringify(rawCounts),
    'out/serra-ford-alerts.json': JSON.stringify(alerts),
  }
  const readFile = (p: string) => {
    const key = Object.keys(artifacts).find((k) => p.endsWith(k))
    if (!key) throw new Error(`unexpected read ${p}`)
    return artifacts[key]
  }

  it('DRY-RUN (no --send): writes the html preview and calls NO send function', async () => {
    const written = new Map<string, string>()
    const sender = vi.fn<SendFn>()
    const out = await sendDailyReport({
      profile: 'serra-ford',
      fromDir: 'out',
      to: ['gm@store.com'],
      storeName: 'Tony Serra Ford',
      send: false,
      deps: { readFile, writeFile: (p, c) => written.set(p, c), sender },
    })
    expect(sender).not.toHaveBeenCalled()
    expect(out.sent).toBe(false)
    expect(out.htmlPath.endsWith('serra-ford-email.html')).toBe(true)
    expect(written.get(out.htmlPath)).toContain('Tony Serra Ford')
    expect(written.get(out.htmlPath)).toContain('See what your team')
    // needs-attention identities came from alerts.json details
    expect(out.html).toContain('Jane')
    expect(out.html).toContain('Bob')
    // used the generatedAt from raw-counts.json
    expect(out.html).toContain('Generated 2026-09-24T13:00:00.000Z')
  })

  it('--send: calls the injected sender exactly once with the rendered email', async () => {
    const sender = vi.fn<SendFn>().mockResolvedValue({ ok: true, email_id: 'em_1' })
    const out = await sendDailyReport({
      profile: 'serra-ford',
      fromDir: 'out',
      to: ['gm@store.com', 'sales@store.com'],
      storeName: 'Tony Serra Ford',
      send: true,
      deps: { readFile, writeFile: () => {}, sender },
    })
    expect(sender).toHaveBeenCalledTimes(1)
    const arg = sender.mock.calls[0][0]
    expect(arg.to).toEqual(['gm@store.com', 'sales@store.com'])
    expect(arg.subject).toBe('Daily AI Management Report — Tony Serra Ford — 2026-09-24')
    expect(out.sent).toBe(true)
    expect(out.result).toEqual({ ok: true, email_id: 'em_1' })
  })
})
