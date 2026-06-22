/**
 * CRM-Guru canonical funnel assembler + Brain persistence.
 *
 * Verifies the metric-split: Leads from the API opportunity summary, report-only
 * metrics from the report or the literal "needs supplemental data" fallback, plus
 * provenance and the canonical-funnel Brain roundtrip.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  assembleCanonicalFunnel,
  persistCanonicalFunnel,
  loadLatestCanonicalFunnel,
  NEEDS_SUPPLEMENTAL,
  type AssembleInput,
} from '@/server/crm-guru'
import type { OpportunitySummary } from '@/server/lead-opportunities'
import type { RoiRow } from '@/server/dashboard-metrics'

const summary = (
  bySource: Array<{ lead_source: string; opportunities: number }>,
  sold = 0,
): OpportunitySummary => {
  const total = bySource.reduce((a, b) => a + b.opportunities, 0)
  return {
    raw_total: total,
    opportunities: total,
    sold,
    by_source: bySource,
    dropped: { non_sales: 0, bad: 0, duplicates: 0, no_contact: 0, unrecognized_types: [] },
  }
}

const roi = (over: Partial<RoiRow> & { lead_source: string }): RoiRow => ({
  total_leads: null,
  good_leads: null,
  customers_influenced: null,
  sold_in_timeframe: null,
  sold_from_leads: null,
  sold_from_leads_pct: null,
  avg_days_to_sale: null,
  avg_days_to_appt_set: null,
  internet_actual_contact: null,
  appts_set: null,
  appts_shown: null,
  total_gross: null,
  ...over,
})

const base: AssembleInput = {
  opportunities: null,
  roiCurrent: [],
  roiPrior: [],
  comparisonLabel: 'no prior period',
}

describe('assembleCanonicalFunnel — metric split', () => {
  it('takes Leads from the API and downstream stages from the report', () => {
    const c = assembleCanonicalFunnel({
      ...base,
      opportunities: summary([{ lead_source: 'AutoTrader', opportunities: 120 }]),
      roiCurrent: [
        roi({ lead_source: 'AutoTrader', internet_actual_contact: 80, appts_set: 40, appts_shown: 25, sold_from_leads: 12 }),
      ],
    })
    const stages = Object.fromEntries(c.funnel.lead_performance.stages.map((s) => [s.key, s]))
    expect(stages.leads.now).toBe(120) // API
    expect(stages.leads.status).toBe('sourced')
    expect(stages.contacted.now).toBe(80) // report
    expect(stages.contacted.conversion).toBeNull() // cross-source boundary
    expect(stages.appt_set.conversion).toBeCloseTo(40 / 80, 4) // report→report
    expect(c.provenance.leads_source).toBe('api')
    expect(c.provenance.metrics_source).toBe('report')
  })

  it('marks report-only metrics "needs supplemental data" when no report covers the window', () => {
    const c = assembleCanonicalFunnel({
      ...base,
      opportunities: summary([{ lead_source: 'AutoTrader', opportunities: 50 }]),
      roiCurrent: [], // no report
    })
    const stages = Object.fromEntries(c.funnel.lead_performance.stages.map((s) => [s.key, s]))
    expect(stages.leads.now).toBe(50) // still defensible from API
    expect(stages.leads.status).toBe('sourced')
    expect(stages.contacted.now).toBeNull()
    expect(stages.contacted.status).toBe('pending')
    expect(stages.sold.status).toBe('pending')
    // Every timing falls back to the literal supplemental-data text.
    for (const t of c.funnel.lead_performance.timings) {
      expect(t.status).toBe('pending')
      expect(t.source).toBe(NEEDS_SUPPLEMENTAL)
    }
    expect(c.provenance.metrics_source).toBe('needs_supplemental')
    expect(c.provenance.report_as_of).toBeNull()
  })

  it('marks Leads unavailable (never fabricated) when the API could not be read', () => {
    const c = assembleCanonicalFunnel({
      ...base,
      opportunities: null,
      roiCurrent: [roi({ lead_source: 'AutoTrader', internet_actual_contact: 80 })],
    })
    const leads = c.funnel.lead_performance.stages.find((s) => s.key === 'leads')!
    expect(leads.now).toBeNull()
    expect(leads.status).toBe('pending')
    expect(c.provenance.leads_source).toBe('unavailable')
    // Regression fix: report-sourced lead-source rows STILL surface when the API
    // is down (sold/gross/good are defensible report data); the Leads count is
    // null ("needs supplemental"), never the report's inflated raw total.
    expect(c.funnel.lead_sources).toHaveLength(1)
    expect(c.funnel.lead_sources[0].lead_source).toBe('AutoTrader')
    expect(c.funnel.lead_sources[0].total_leads).toBeNull()
  })

  it('with neither API nor report, there is nothing to show', () => {
    const c = assembleCanonicalFunnel({ ...base, opportunities: null, roiCurrent: [] })
    expect(c.funnel.lead_sources).toHaveLength(0)
    expect(c.provenance.leads_source).toBe('unavailable')
    expect(c.provenance.metrics_source).toBe('needs_supplemental')
  })

  it('surfaces capping + unrecognized lead types in provenance (never silent)', () => {
    const s = summary([{ lead_source: 'AutoTrader', opportunities: 10 }])
    s.dropped.unrecognized_types = ['CHAT', 'SHOWROOM']
    const c = assembleCanonicalFunnel({ ...base, opportunities: s, leadsCapped: true })
    expect(c.provenance.leads_capped).toBe(true)
    expect(c.provenance.unrecognized_lead_types).toEqual(['CHAT', 'SHOWROOM'])
  })

  it('builds per-source rows with the API Leads count + matched report columns + rating', () => {
    const c = assembleCanonicalFunnel({
      ...base,
      opportunities: summary([
        { lead_source: 'Repeat Customer', opportunities: 100 },
        { lead_source: 'Dead Source', opportunities: 20 },
      ]),
      roiCurrent: [
        roi({ lead_source: 'repeat customer', sold_from_leads: 30, good_leads: 90, total_gross: 30000 }),
        roi({ lead_source: 'Dead Source', sold_from_leads: 0, good_leads: 5 }),
      ],
    })
    const bySrc = Object.fromEntries(c.funnel.lead_sources.map((r) => [r.lead_source, r]))
    // API count is the Leads column; report columns attach via normalized match.
    expect(bySrc['Repeat Customer'].total_leads).toBe(100)
    expect(bySrc['Repeat Customer'].sold_from_leads).toBe(30)
    expect(bySrc['Repeat Customer'].total_gross).toBe(30000)
    expect(bySrc['Repeat Customer'].rating).toBe('good') // 30/100 >= 30/120 store rate
    expect(bySrc['Dead Source'].rating).toBe('alarm') // 20 leads, 0 sold
  })
})

describe('timing is de-blended (not weighted by raw total_leads)', () => {
  it('weights timing by sales opportunities, not raw total_leads', () => {
    const c = assembleCanonicalFunnel({
      ...base,
      opportunities: summary([
        { lead_source: 'A', opportunities: 90 },
        { lead_source: 'B', opportunities: 10 },
      ]),
      roiCurrent: [
        roi({ lead_source: 'A', avg_days_to_sale: 2, total_leads: 100, good_leads: 50 }),
        roi({ lead_source: 'B', avg_days_to_sale: 10, total_leads: 100, good_leads: 50 }),
      ],
    })
    const t = c.funnel.lead_performance.timings.find((m) => m.key === 'time_to_sale')!
    // opportunities-weighted (2*90 + 10*10)/100 = 2.8 — NOT total_leads-weighted 6.0
    expect(t.value).toBeCloseTo(2.8, 5)
  })

  it('falls back to good_leads weighting (still de-blended) when the API is unavailable', () => {
    const c = assembleCanonicalFunnel({
      ...base,
      opportunities: null,
      roiCurrent: [
        roi({ lead_source: 'A', avg_days_to_sale: 2, total_leads: 100, good_leads: 90 }),
        roi({ lead_source: 'B', avg_days_to_sale: 10, total_leads: 100, good_leads: 10 }),
      ],
    })
    const t = c.funnel.lead_performance.timings.find((m) => m.key === 'time_to_sale')!
    // good_leads-weighted (2*90 + 10*10)/100 = 2.8 — NOT total_leads-weighted 6.0
    expect(t.value).toBeCloseTo(2.8, 5)
  })
})

describe('canonical funnel Brain persistence', () => {
  let tmpHome: string
  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-guru-'))
    vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
    delete process.env.BRAIN_PROFILES_ROOT
  })
  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(tmpHome, { recursive: true, force: true })
  })

  it('persists and loads the latest snapshot', () => {
    const c = assembleCanonicalFunnel({
      ...base,
      opportunities: summary([{ lead_source: 'AutoTrader', opportunities: 77 }]),
    })
    persistCanonicalFunnel('fixture', c, { windowDays: 30 })
    const loaded = loadLatestCanonicalFunnel('fixture')
    expect(loaded).not.toBeNull()
    const leads = loaded!.funnel.lead_performance.stages.find((s) => s.key === 'leads')!
    expect(leads.now).toBe(77)
    expect(loaded!.provenance.leads_source).toBe('api')
  })

  it('returns null when no snapshot exists', () => {
    expect(loadLatestCanonicalFunnel('never-built')).toBeNull()
  })
})
