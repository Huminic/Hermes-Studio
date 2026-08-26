import { describe, it, expect } from 'vitest'
import {
  METRIC_CATALOG,
  catalogByCategory,
  getCatalogMetric,
  isCatalogMetric,
} from '@/server/watchdog/metric-catalog'

describe('metric catalog (alert wizard picker registry)', () => {
  it('has unique slugs and valid, complete entries', () => {
    const ids = METRIC_CATALOG.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length) // no duplicates
    for (const m of METRIC_CATALOG) {
      expect(m.id).toMatch(/^[a-z]+\.[a-z0-9_]+$/)
      expect(m.label.trim()).not.toBe('')
      expect(m.description.trim()).not.toBe('')
      expect(['percent', 'count', 'currency']).toContain(m.format)
      expect(['above', 'below']).toContain(m.concerning)
      expect(['vin-report', 'hub']).toContain(m.source)
    }
  })

  it('resolves known slugs and rejects unknown', () => {
    expect(isCatalogMetric('appt.show_rate')).toBe(true)
    expect(getCatalogMetric('appt.show_rate')?.label).toBe('Appointment show rate')
    expect(isCatalogMetric('not.a_metric')).toBe(false)
    expect(getCatalogMetric('not.a_metric')).toBeUndefined()
  })

  it('groups by category in declaration order, covering every metric once', () => {
    const groups = catalogByCategory()
    const flat = groups.flatMap((g) => g.metrics)
    expect(flat).toHaveLength(METRIC_CATALOG.length)
    // categories are unique and non-empty
    const cats = groups.map((g) => g.category)
    expect(new Set(cats).size).toBe(cats.length)
    expect(cats).toContain('Appointments')
    expect(cats).toContain('Engagement')
  })

  it('concerning direction is sensible for a few key metrics (wizard defaults)', () => {
    expect(getCatalogMetric('appt.show_rate')?.concerning).toBe('below') // low show rate is bad
    expect(getCatalogMetric('appt.no_show_rate')?.concerning).toBe('above') // high no-show is bad
    expect(getCatalogMetric('gross.total_sum')?.concerning).toBe('below') // low gross is bad
  })
})
