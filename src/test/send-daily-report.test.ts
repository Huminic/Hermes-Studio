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

describe('renderDailyManagementEmail', () => {
  it('renders subject, a two-column table of report lines, the footnote and the generated line', () => {
    const { subject, html, text } = renderDailyManagementEmail({
      report,
      storeName: 'Tony Serra Ford',
      generatedAt: '2026-09-24T13:00:00.000Z',
    })
    expect(subject).toBe('Daily AI Management Report — Tony Serra Ford — 2026-09-24')
    // report lines present as label/value pairs in the card
    expect(html).toContain('Leads in (business hours)')
    expect(html).toContain('Active leads (last 30d)')
    expect(html).toContain('120')
    // footnote + the generated line
    expect(html).toContain('intentionally omitted')
    expect(html).toContain('Sales only; generated 2026-09-24T13:00:00.000Z')
    expect(text).toContain('Leads in (business hours): 8')
    expect(text).toContain('Sales only; generated 2026-09-24T13:00:00.000Z')
  })
})

describe('sendDailyReport', () => {
  const artifacts: Record<string, string> = {
    'out/serra-ford-daily-management.json': JSON.stringify(report),
    'out/serra-ford-raw-counts.json': JSON.stringify({ generatedAt: '2026-09-24T13:00:00.000Z' }),
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
    expect(written.get(out.htmlPath)).toContain('Daily AI Management Report')
    // used the generatedAt from raw-counts.json
    expect(out.html).toContain('Sales only; generated 2026-09-24T13:00:00.000Z')
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
