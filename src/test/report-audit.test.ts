import { describe, it, expect } from 'vitest'
import { auditMetric, auditMetrics, BENCHMARKS } from '@/server/reports/report-audit'

describe('auditMetric', () => {
  it('flags a below-target metric (higher-is-better) in tentative voice', () => {
    const f = auditMetric('appt.show_rate', 0.42)
    expect(f.status).toBe('below_target')
    expect(f.target).toBe('≥ 50%')
    expect(f.display).toBe('42%')
    expect(f.phrasing).toMatch(/below the ≥ 50% target/)
    expect(f.phrasing).toMatch(/worth a look/)
  })

  it('reports within-target when the metric meets the floor', () => {
    expect(auditMetric('appt.show_rate', 0.66).status).toBe('within_target')
  })

  it('flags an above-target metric (lower-is-better) and marks estimate', () => {
    const f = auditMetric('roi.duplicate_rate', 0.55)
    expect(f.status).toBe('above_target')
    expect(f.estimate).toBe(true)
    expect(f.phrasing).toMatch(/estimated benchmark/)
  })

  it('no external benchmark → compare-to-own-trend, never scored against an invented number', () => {
    const f = auditMetric('roi.total_leads', 320)
    expect(f.status).toBe('no_benchmark')
    expect(f.target).toBeNull()
    expect(f.phrasing).toMatch(/no fixed industry benchmark|own recent trend/i)
  })

  it('no value → no_data (honest gap, never a fabricated 0)', () => {
    const f = auditMetric('appt.show_rate', null)
    expect(f.status).toBe('no_data')
    expect(f.display).toBe('—')
    expect(f.phrasing).toMatch(/connect the source/i)
  })
})

describe('auditMetrics', () => {
  it('covers every catalog metric, grouped by category, counting covered', () => {
    const values = new Map<string, number | null>([
      ['appt.show_rate', 0.42],
      ['roi.duplicate_rate', 0.5],
      ['engagement.reply_rate', 0.18],
    ])
    const report = auditMetrics(values)
    expect(report.total).toBeGreaterThan(10)
    expect(report.covered).toBe(3)
    // categories present + a known one
    const cats = report.categories.map((c) => c.category)
    expect(cats).toContain('Appointments')
    // appt.show_rate flagged below target inside Appointments
    const appt = report.categories.find((c) => c.category === 'Appointments')!
    expect(appt.findings.find((f) => f.slug === 'appt.show_rate')!.status).toBe('below_target')
  })

  it('only the three sourced benchmarks exist (rest are compare-to-own-trend)', () => {
    expect(Object.keys(BENCHMARKS).sort()).toEqual(['appt.no_show_rate', 'appt.show_rate', 'roi.duplicate_rate'])
  })
})
