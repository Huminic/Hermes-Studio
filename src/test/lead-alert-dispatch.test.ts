import { describe, it, expect, vi } from 'vitest'
import { dispatchLeadAlerts, type AlertLead } from '../server/lead-alert-dispatch'
import { DEFAULT_BUSINESS_HOURS, type BusinessHoursCfg } from '../server/lead-aging'

const cfg: BusinessHoursCfg = { ...DEFAULT_BUSINESS_HOURS } // Chicago, 08–19, Mon–Sat
const MON_10AM = Date.parse('2026-09-28T15:00:00Z') // Monday 10:00 CDT (in business hours)
const DAY = 24 * 60 * 60_000

const leads: AlertLead[] = [
  { leadId: 'A', leadStatus: '', leadStatusType: '', createdUtc: null, source: 'Website', firstName: 'Amy' },
  {
    leadId: 'B',
    leadStatus: 'ACTIVE_NEW_LEAD',
    leadStatusType: 'ACTIVE',
    createdUtc: new Date(MON_10AM - 2 * DAY).toISOString(),
    source: 'Cars.com',
    firstName: 'Bob',
  },
  {
    leadId: 'C',
    leadStatus: 'ACTIVE_NEW_LEAD',
    leadStatusType: 'ACTIVE',
    createdUtc: new Date(MON_10AM - 5 * DAY).toISOString(),
    source: 'AutoTrader',
    firstName: null,
  },
]

function markerSet() {
  const seen = new Set<string>()
  return {
    seen,
    wasAlerted: (k: string) => seen.has(k),
    markAlerted: (k: string) => void seen.add(k),
  }
}

describe('dispatchLeadAlerts (N3.4)', () => {
  it('GATING: does not send when alerts are disabled and never fetches', async () => {
    const sendEmail = vi.fn().mockResolvedValue({ ok: true })
    const fetchLeads = vi.fn().mockResolvedValue(leads)
    const m = markerSet()
    const res = await dispatchLeadAlerts({
      profile: 'serra-ford',
      storeName: 'Tony Serra Ford',
      agentName: 'Georgia',
      emails: ['gm@x.com'],
      alertsEnabled: false,
      businessHours: cfg,
      deps: { fetchLeads, sendEmail, ...m, now: MON_10AM },
    })
    expect(res.sent).toBe(false)
    expect(res.skipped).toBe('alerts disabled')
    expect(sendEmail).not.toHaveBeenCalled()
    expect(fetchLeads).not.toHaveBeenCalled()
  })

  it('GATING: does not send with no recipients', async () => {
    const sendEmail = vi.fn().mockResolvedValue({ ok: true })
    const res = await dispatchLeadAlerts({
      profile: 'serra-ford',
      storeName: 'Tony Serra Ford',
      agentName: 'Georgia',
      emails: [],
      alertsEnabled: true,
      businessHours: cfg,
      deps: { fetchLeads: async () => leads, sendEmail, ...markerSet(), now: MON_10AM },
    })
    expect(res.sent).toBe(false)
    expect(res.skipped).toBe('no recipients')
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('GATING: does not send outside business hours (and never fetches)', async () => {
    const sendEmail = vi.fn().mockResolvedValue({ ok: true })
    const fetchLeads = vi.fn().mockResolvedValue(leads)
    const res = await dispatchLeadAlerts({
      profile: 'serra-ford',
      storeName: 'Tony Serra Ford',
      agentName: 'Georgia',
      emails: ['gm@x.com'],
      alertsEnabled: true,
      businessHours: cfg,
      deps: { fetchLeads, sendEmail, ...markerSet(), now: Date.parse('2026-09-28T06:00:00Z') }, // 01:00 CT
    })
    expect(res.sent).toBe(false)
    expect(res.skipped).toBe('outside business hours')
    expect(fetchLeads).not.toHaveBeenCalled()
  })

  it('ADDRESSING: emails the management audience with the subject + a table of leads', async () => {
    const sendEmail = vi.fn().mockResolvedValue({ ok: true })
    const res = await dispatchLeadAlerts({
      profile: 'serra-ford',
      storeName: 'Tony Serra Ford',
      agentName: 'Georgia',
      emails: ['gm@serra.example', 'owner@serra.example'],
      alertsEnabled: true,
      businessHours: cfg,
      deps: { fetchLeads: async () => leads, sendEmail, ...markerSet(), now: MON_10AM },
    })
    expect(res.sent).toBe(true)
    expect(res.alerted.length).toBe(3) // A (no status) + B + C, C counted once
    expect(sendEmail).toHaveBeenCalledTimes(1)
    const arg = sendEmail.mock.calls[0][0]
    expect(arg.to).toEqual(['gm@serra.example', 'owner@serra.example'])
    expect(arg.subject).toBe('Lead alert — Tony Serra Ford: 3 leads need attention')
    expect(arg.html).toContain('Cars.com')
    expect(arg.html).toContain('Bob')
    expect(arg.html).toContain('Lead C') // null firstName → fallback id
  })

  it('DEDUP: a lead alerts once per bucket per day (second run sends nothing)', async () => {
    const sendEmail = vi.fn().mockResolvedValue({ ok: true })
    const m = markerSet()
    const first = await dispatchLeadAlerts({
      profile: 'serra-ford',
      storeName: 'Tony Serra Ford',
      agentName: 'Georgia',
      emails: ['gm@x.com'],
      alertsEnabled: true,
      businessHours: cfg,
      deps: { fetchLeads: async () => leads, sendEmail, ...m, now: MON_10AM },
    })
    expect(first.sent).toBe(true)
    const second = await dispatchLeadAlerts({
      profile: 'serra-ford',
      storeName: 'Tony Serra Ford',
      agentName: 'Georgia',
      emails: ['gm@x.com'],
      alertsEnabled: true,
      businessHours: cfg,
      deps: { fetchLeads: async () => leads, sendEmail, ...m, now: MON_10AM + 3_600_000 },
    })
    expect(second.sent).toBe(false)
    expect(second.skipped).toBe('nothing new')
    expect(sendEmail).toHaveBeenCalledTimes(1) // only the first run emailed
  })
})
