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
  bySource: Array<{ lead_source: string; opportunities: number; sold?: number }>,
  sold = 0,
): OpportunitySummary => {
  const total = bySource.reduce((a, b) => a + b.opportunities, 0)
  return {
    raw_total: total,
    opportunities: total,
    sold,
    by_source: bySource.map((s) => ({
      lead_source: s.lead_source,
      opportunities: s.opportunities,
      sold: s.sold ?? 0,
    })),
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
  it('takes Leads + Sold from the API, Contacted/Appts from the report (when trusted)', () => {
    const c = assembleCanonicalFunnel({
      ...base,
      trustReport: true, // exercise the report-attach path (off by default in prod)
      opportunities: summary([{ lead_source: 'AutoTrader', opportunities: 120, sold: 18 }], 18),
      roiCurrent: [
        roi({ lead_source: 'AutoTrader', internet_actual_contact: 80, appts_set: 40, appts_shown: 25, sold_from_leads: 12 }),
      ],
    })
    const stages = Object.fromEntries(c.funnel.lead_performance.stages.map((s) => [s.key, s]))
    expect(stages.leads.now).toBe(120) // API
    expect(stages.sold.now).toBe(18) // API sold (deduped), NOT report's 12
    expect(stages.contacted.now).toBe(80) // report (trusted)
    expect(stages.contacted.conversion).toBeNull() // cross-source boundary
    expect(stages.appt_set.conversion).toBeCloseTo(40 / 80, 4) // report→report
    expect(c.provenance.leads_source).toBe('api')
    expect(c.provenance.metrics_source).toBe('report')
  })

  it('Sold comes from the API even with no report; report-only stages are supplemental', () => {
    const c = assembleCanonicalFunnel({
      ...base,
      opportunities: summary([{ lead_source: 'AutoTrader', opportunities: 50, sold: 9 }], 9),
      roiCurrent: [], // no report
    })
    const stages = Object.fromEntries(c.funnel.lead_performance.stages.map((s) => [s.key, s]))
    expect(stages.leads.now).toBe(50) // API
    expect(stages.sold.now).toBe(9) // API sold
    expect(stages.sold.status).toBe('sourced')
    expect(stages.contacted.status).toBe('pending') // report-only → supplemental
    for (const t of c.funnel.lead_performance.timings) {
      expect(t.status).toBe('pending')
      expect(t.source).toBe(NEEDS_SUPPLEMENTAL)
    }
    expect(c.provenance.metrics_source).toBe('needs_supplemental')
  })

  it('production default trusts a WINDOW-CONSISTENT report (variance guardrail passes)', () => {
    // Default now = REPORT_METRICS_TRUSTED (true), GUARDED by the variance check.
    // Contacted 80 <= Leads 120 and appts 40 <= contacted 80 → consistent → shown.
    const c = assembleCanonicalFunnel({
      ...base, // no trustReport → REPORT_METRICS_TRUSTED (true) + guardrail
      opportunities: summary([{ lead_source: 'AutoTrader', opportunities: 120, sold: 18 }], 18),
      roiCurrent: [roi({ lead_source: 'AutoTrader', internet_actual_contact: 80, appts_set: 40 })],
    })
    const stages = Object.fromEntries(c.funnel.lead_performance.stages.map((s) => [s.key, s]))
    expect(stages.leads.now).toBe(120) // API
    expect(stages.sold.now).toBe(18) // API
    expect(stages.contacted.status).not.toBe('pending') // consistent report → shown
    expect(c.provenance.metrics_source).toBe('report')
  })

  it('variance guardrail SUPPRESSES an over-reading report (Contacted > live Leads) — no inflation', () => {
    // The documented ~1.8-2x over-read: report Contacted 120 vs live Leads 60.
    // Guardrail fails → report stages fall back to supplemental (never inflated).
    const c = assembleCanonicalFunnel({
      ...base, // default trusted, but guardrail must catch the mismatch
      opportunities: summary([{ lead_source: 'AutoTrader', opportunities: 60, sold: 9 }], 9),
      roiCurrent: [roi({ lead_source: 'AutoTrader', internet_actual_contact: 120, appts_set: 55 })],
    })
    const stages = Object.fromEntries(c.funnel.lead_performance.stages.map((s) => [s.key, s]))
    expect(stages.leads.now).toBe(60) // live API still shown
    expect(stages.sold.now).toBe(9)
    expect(stages.contacted.status).toBe('pending') // over-read → suppressed
    expect(stages.appt_set.status).toBe('pending')
    expect(c.provenance.metrics_source).toBe('needs_supplemental')
  })

  it('guardrail sums stages across MULTIPLE sources (small per-row, TOTAL over-reads → suppress)', () => {
    // Regression: a report split across many sources has small per-row good_leads
    // but a large TOTAL. The guard must compare the SUMMED total to live Leads,
    // not a per-row max (which would let the inflated total through).
    const c = assembleCanonicalFunnel({
      ...base,
      opportunities: summary([{ lead_source: 'Mix', opportunities: 100, sold: 12 }], 12),
      roiCurrent: [
        roi({ lead_source: 'A', good_leads: 50, appts_set: 10 }),
        roi({ lead_source: 'B', good_leads: 50, appts_set: 10 }),
        roi({ lead_source: 'C', good_leads: 50, appts_set: 10 }), // sum good_leads=150 > 100
      ],
    })
    const stages = Object.fromEntries(c.funnel.lead_performance.stages.map((s) => [s.key, s]))
    expect(stages.leads.now).toBe(100)
    expect(stages.contacted.status).toBe('pending') // summed 150 > 100 → suppressed
    expect(c.provenance.metrics_source).toBe('needs_supplemental')
  })

  it('marks Leads unavailable (never fabricated) when the API could not be read', () => {
    const c = assembleCanonicalFunnel({
      ...base,
      trustReport: true,
      opportunities: null,
      roiCurrent: [roi({ lead_source: 'AutoTrader', internet_actual_contact: 80 })],
    })
    const leads = c.funnel.lead_performance.stages.find((s) => s.key === 'leads')!
    expect(leads.now).toBeNull()
    expect(leads.status).toBe('pending')
    expect(c.provenance.leads_source).toBe('unavailable')
    // No API → no defensible per-source counts; lead_sources are API-driven.
    expect(c.funnel.lead_sources).toHaveLength(0)
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

  it('builds per-source rows: Leads + Sold from API, report gross attaches when trusted', () => {
    const c = assembleCanonicalFunnel({
      ...base,
      trustReport: true,
      opportunities: summary(
        [
          { lead_source: 'Repeat Customer', opportunities: 100, sold: 30 },
          { lead_source: 'Dead Source', opportunities: 20, sold: 0 },
        ],
        30,
      ),
      roiCurrent: [
        roi({ lead_source: 'repeat customer', good_leads: 90, total_gross: 30000 }),
        roi({ lead_source: 'Dead Source', good_leads: 5 }),
      ],
    })
    const bySrc = Object.fromEntries(c.funnel.lead_sources.map((r) => [r.lead_source, r]))
    // Leads + Sold are API; gross attaches from the (trusted) report by name.
    expect(bySrc['Repeat Customer'].total_leads).toBe(100)
    expect(bySrc['Repeat Customer'].sold_from_leads).toBe(30) // API per-source sold
    expect(bySrc['Repeat Customer'].total_gross).toBe(30000) // report (trusted)
    expect(bySrc['Repeat Customer'].rating).toBe('good') // 30/100 >= 30/120 store rate
    expect(bySrc['Dead Source'].rating).toBe('alarm') // 20 leads, 0 sold (API)
  })
})

describe('timing is de-blended (not weighted by raw total_leads)', () => {
  it('weights timing by sales opportunities, not raw total_leads', () => {
    const c = assembleCanonicalFunnel({
      ...base,
      trustReport: true,
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
      trustReport: true,
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
