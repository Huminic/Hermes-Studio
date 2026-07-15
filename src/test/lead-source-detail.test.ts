import { describe, expect, it } from 'vitest'
import {
  buildLeadSourceDetail,
  renderLeadSourceDetailHtml,
  type LeadSourceDetailReport,
} from '@/server/reports/lead-source-detail'

describe('buildLeadSourceDetail', () => {
  it('returns available:false with an honest reason when no report is uploaded', () => {
    const r = buildLeadSourceDetail('lsdfix-none')
    expect(r.available).toBe(false)
    if (!r.available) expect(r.reason).toMatch(/upload/i)
  })

  it('renders the no-report state as HTML without fabricating data', () => {
    const html = renderLeadSourceDetailHtml(buildLeadSourceDetail('lsdfix-none2'))
    expect(html).toContain('<!doctype html>')
    expect(html).toMatch(/upload/i)
  })

  it('renders derived per-source metrics for an available report', () => {
    const report: LeadSourceDetailReport = {
      profile: 'p',
      generated_at: 1_700_000_000_000,
      available: true,
      period_start: '2026-06-01',
      total_leads: 100,
      total_sold: 12,
      total_gross: 36000,
      rows: [
        {
          lead_source: 'AutoTrader',
          total_leads: 60,
          good_leads: 40,
          customers_influenced: null,
          sold_in_timeframe: null,
          sold_from_leads: 10,
          sold_from_leads_pct: null,
          avg_days_to_sale: null,
          avg_days_to_appt_set: null,
          internet_actual_contact: 45,
          appts_set: 20,
          appts_shown: 12,
          total_gross: 30000,
          contact_rate: 75,
          appt_set_rate: 33.3,
          show_rate: 60,
          close_rate: 16.7,
          gross_per_lead: 500,
          good_lead_pct: 66.7,
        },
      ],
      opportunities: ['Cars.com: 40 leads but only 2% close (avg 15%) — worth reviewing'],
    }
    const html = renderLeadSourceDetailHtml(report)
    expect(html).toContain('AutoTrader')
    expect(html).toContain('16.7%') // close rate
    expect(html).toContain('$30,000') // gross
    expect(html).toContain('worth reviewing') // opportunity
  })
})
