import { describe, expect, it } from 'vitest'
import {
  buildCompetitorReport,
  renderCompetitorReportHtml,
} from '@/server/reports/competitor'

describe('buildCompetitorReport', () => {
  it('returns available:false honestly when no competitor data is available', () => {
    const r = buildCompetitorReport('cmpfix')
    expect(r.available).toBe(false)
    if (!r.available) expect(r.reason).toMatch(/federated|competitor|source/i)
  })

  it('never fabricates — with data present it derives observations only from real numbers', () => {
    const r = buildCompetitorReport('cmpfix', {
      us: { name: 'Serra Honda', listed_vehicles: 120, avg_price: 32000, lead_presence: ['AutoTrader'] },
      competitors: [
        { name: 'Comp A', listed_vehicles: 200, avg_price: 30000, lead_presence: ['AutoTrader', 'Cargurus'], specials: ['0% APR'] },
      ],
      dataSource: 'test',
    })
    expect(r.available).toBe(true)
    if (r.available) {
      // price gap + inventory gap + missing marketplace (Cargurus) observed
      expect(r.observations.join(' ')).toMatch(/above|below/)
      expect(r.observations.join(' ')).toMatch(/inventory depth/i)
      expect(r.observations.join(' ')).toMatch(/Cargurus/)
      const html = renderCompetitorReportHtml(r)
      expect(html).toContain('Serra Honda')
      expect(html).toContain('Comp A')
      expect(html).toContain('0% APR')
    }
  })
})
