import { describe, expect, it } from 'vitest'
import {
  buildSalespersonEffectiveness,
  renderSalespersonEffectivenessHtml,
  type SalespersonEffectivenessReport,
} from '@/server/reports/salesperson-effectiveness'

describe('buildSalespersonEffectiveness', () => {
  it('returns available:false with an honest reason when no KPI report is uploaded', () => {
    const r = buildSalespersonEffectiveness('spfix-none')
    expect(r.available).toBe(false)
    if (!r.available) expect(r.reason).toMatch(/upload/i)
  })

  it('renders derived per-rep metrics and ranks by shown/sold', () => {
    const report: SalespersonEffectivenessReport = {
      profile: 'p',
      generated_at: 1_700_000_000_000,
      available: true,
      period_start: '2026-06-01',
      rows: [
        { salesperson: 'Rachel Hertenstein', internet_leads: 40, internet_actual_contact: 34, appts_set: 18, appts_shown_sold: 5, contact_rate: 85, appt_set_rate: 45, close_rate: 12.5 },
        { salesperson: 'Eddie Jones', internet_leads: 30, internet_actual_contact: 15, appts_set: 6, appts_shown_sold: 2, contact_rate: 50, appt_set_rate: 20, close_rate: 6.7 },
      ],
      totals: { leads: 70, contacted: 49, appts_set: 24, shown_sold: 7 },
    }
    const html = renderSalespersonEffectivenessHtml(report)
    expect(html).toContain('Rachel Hertenstein')
    expect(html).toContain('85%') // contact rate
    expect(html).toContain('Eddie Jones')
    // Rachel (5 shown/sold) ranks before Eddie (2) — appears earlier in the HTML
    expect(html.indexOf('Rachel Hertenstein')).toBeLessThan(html.indexOf('Eddie Jones'))
  })
})
