import { describe, expect, it } from 'vitest'
import {
  buildStorePerformanceTrend,
  renderStorePerformanceTrendHtml,
  type StorePerformanceTrendReport,
} from '@/server/reports/store-performance-trend'

describe('buildStorePerformanceTrend', () => {
  it('returns available:false honestly with <2 periods of history', () => {
    const r = buildStorePerformanceTrend('sptfix-none')
    expect(r.available).toBe(false)
    if (!r.available) expect(r.reason).toMatch(/history|period/i)
  })

  it('renders a trend table with period-over-period arrows', () => {
    const report: StorePerformanceTrendReport = {
      profile: 'p',
      generated_at: 1_700_000_000_000,
      available: true,
      points: [
        { period: '2026-05-01', leads: 200, appts_set: 40, appts_shown: 25, sold: 18, gross: 54000, close_rate: 9, appt_set_rate: 20 },
        { period: '2026-06-01', leads: 240, appts_set: 60, appts_shown: 38, sold: 25, gross: 80000, close_rate: 10.4, appt_set_rate: 25 },
      ],
    }
    const html = renderStorePerformanceTrendHtml(report)
    expect(html).toContain('2026-05-01')
    expect(html).toContain('2026-06-01')
    expect(html).toContain('$80,000')
    expect(html).toContain('▲') // sold/gross rose period-over-period
  })
})
