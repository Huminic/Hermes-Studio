import { describe, it, expect } from 'vitest'
import { buildLeadSourceReport } from '../server/lead-source-report'

describe('buildLeadSourceReport', () => {
  it('assembles per-source counts across windows, 0-filling gaps, with 24h deltas', () => {
    const rows = buildLeadSourceReport({
      window24h: [
        { lead_source: 'Cars.com', opportunities: 5, sold: 1 },
        { lead_source: 'Website', opportunities: 2, sold: 0 },
      ],
      window7d: [
        { lead_source: 'Cars.com', opportunities: 20, sold: 4 },
        { lead_source: 'Website', opportunities: 9, sold: 1 },
        { lead_source: 'AutoTrader', opportunities: 3, sold: 0 },
      ],
      window30d: [
        { lead_source: 'Cars.com', opportunities: 80, sold: 12 },
        { lead_source: 'Website', opportunities: 30, sold: 5 },
        { lead_source: 'AutoTrader', opportunities: 10, sold: 2 },
      ],
      prev24h: [
        { lead_source: 'Cars.com', opportunities: 3, sold: 2 }, // leads up (5>3), sold down (1<2)
        { lead_source: 'Website', opportunities: 2, sold: 0 }, // leads even, sold even
      ],
    })

    // sorted by 30d volume desc
    expect(rows.map((r) => r.source)).toEqual(['Cars.com', 'Website', 'AutoTrader'])

    const cars = rows.find((r) => r.source === 'Cars.com')!
    expect(cars).toMatchObject({
      leads24h: 5,
      leads7d: 20,
      leads30d: 80,
      sold24h: 1,
      sold7d: 4,
      sold30d: 12,
      leadsDelta: 'up',
      soldDelta: 'down',
    })

    // AutoTrader only appears in 7d/30d → 24h counts 0, delta even (0 vs 0)
    const at = rows.find((r) => r.source === 'AutoTrader')!
    expect(at.leads24h).toBe(0)
    expect(at.leads7d).toBe(3)
    expect(at.leadsDelta).toBe('even')

    const web = rows.find((r) => r.source === 'Website')!
    expect(web.leadsDelta).toBe('even') // 2 vs 2
    expect(web.soldDelta).toBe('even') // 0 vs 0
  })

  it('never invents numbers — an empty report yields no rows', () => {
    expect(
      buildLeadSourceReport({ window24h: [], window7d: [], window30d: [], prev24h: [] }),
    ).toEqual([])
  })
})
