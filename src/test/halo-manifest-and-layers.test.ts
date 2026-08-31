// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { METRIC_CATALOG } from '@/server/watchdog/metric-catalog'
import {
  HALO_SUPPORT_MANIFEST,
  HALO_SUPPORT_MANIFEST_VERSION,
  listSlugSupport,
} from '@/server/watchdog/halo-support-manifest'
import { evaluateThreeLayers } from '@/server/reports/halo-three-layer'

// M2R R1 correction 2: the ratified runtime NATIVE7 (halo-m1-proof) resolves these 7 native slugs; the
// manifest supported set must match runtime truth (gross.reconciliation_mismatches + response-time are
// resolved from accepted strict families, NOT withheld).
const SUPPORTED_NATIVE = ['gross.total_sum', 'gross.reconciliation_mismatches', 'dashboard.response_time_actual_avg_min', 'appt.show_rate', 'appt.no_show_rate', 'appt.confirmed_rate', 'appt.cancel_rate']
const HUB = ['engagement.reply_rate', 'engagement.conversations', 'engagement.resurrections']

describe('Halo support manifest', () => {
  it('is versioned and covers all 20 catalog slugs exactly once', () => {
    // M2R R1 truth reconciliation: catalog is 20 slugs; the manifest now covers all 20 (the previously
    // omitted dashboard.response_time_actual_avg_min was added; it is SUPPORTED — part of NATIVE7).
    expect(HALO_SUPPORT_MANIFEST_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    expect(METRIC_CATALOG.length).toBe(20)
    for (const m of METRIC_CATALOG) expect(HALO_SUPPORT_MANIFEST[m.id]).toBeTruthy()
    expect(listSlugSupport().length).toBe(20)
  })

  it('has exactly 7 supported (native), 3 supported-but-no-current-data (hub), 10 withheld', () => {
    const by = (s: string) => listSlugSupport().filter((e) => e.state === s).map((e) => e.slug)
    expect(new Set(by('supported'))).toEqual(new Set(SUPPORTED_NATIVE))
    expect(new Set(by('supported-but-no-current-data'))).toEqual(new Set(HUB))
    expect(by('withheld').length).toBe(10) // R1 correction 2: recon-mismatches + response-time are supported, not withheld
  })

  it('R1 correction 2: manifest matches runtime — recon-mismatches + response-time are SUPPORTED, not withheld', () => {
    // These two resolve to real current values (halo-m1-proof NATIVE7); currentLayer surfaces resolved
    // values before any withheld state, so a "withheld" claim would be untrue.
    expect(HALO_SUPPORT_MANIFEST['gross.reconciliation_mismatches'].state).toBe('supported')
    expect(HALO_SUPPORT_MANIFEST['dashboard.response_time_actual_avg_min'].state).toBe('supported')
    // three-layer returns a VALUE (not withheld) when the resolver emits — characterization of the gate order.
    const values = new Map<string, number | null>([['gross.reconciliation_mismatches', 0], ['dashboard.response_time_actual_avg_min', 210]])
    const rows = evaluateThreeLayers({ values })
    expect(rows.find((r) => r.slug === 'gross.reconciliation_mismatches')!.current.state).toBe('value')
    expect(rows.find((r) => r.slug === 'dashboard.response_time_actual_avg_min')!.current.state).toBe('value')
    // NEGATIVE control: a genuinely-withheld slug with NO resolved value stays withheld.
    expect(rows.find((r) => r.slug === 'roi.total_leads')!.current.state).toBe('withheld')
  })

  it('appointment entries each name a SINGLE numerator flag', () => {
    expect(HALO_SUPPORT_MANIFEST['appt.show_rate'].sourceFields[0]).toMatch(/^Is Show \(=Yes\)/)
    expect(HALO_SUPPORT_MANIFEST['appt.no_show_rate'].sourceFields[0]).toMatch(/^Is No Show \(=Yes\)/)
    expect(HALO_SUPPORT_MANIFEST['appt.confirmed_rate'].sourceFields[0]).toMatch(/^Is Confirmed \(=Yes\)/)
    expect(HALO_SUPPORT_MANIFEST['appt.cancel_rate'].sourceFields[0]).toMatch(/^Is Cancelled \(=Yes\)/)
  })

  it('CAGE comes from Enterprise Performance / CAGE, NOT the Communication Log', () => {
    for (const s of ['cage.total_comms', 'cage.deals_from_leads', 'cage.rep_count']) {
      expect(HALO_SUPPORT_MANIFEST[s].sourceFamily).toMatch(/CAGE|Enterprise Performance/)
      expect(HALO_SUPPORT_MANIFEST[s].sourceFamily).not.toMatch(/Communication Log/)
    }
    for (const s of ['comm.template_overuse', 'comm.multi_rep_within_24h']) {
      expect(HALO_SUPPORT_MANIFEST[s].sourceFamily).toMatch(/Communication Log/)
    }
  })

  it('carries the governance-supplied 295 anchors (with honest closest/primitive labels)', () => {
    expect(HALO_SUPPORT_MANIFEST['appt.show_rate'].catalog295Anchor).toMatch(/^SW-032/)
    expect(HALO_SUPPORT_MANIFEST['appt.no_show_rate'].catalog295Anchor).toBe('SW-041')
    expect(HALO_SUPPORT_MANIFEST['roi.total_leads'].catalog295Anchor).toMatch(/^SW-001/)
    expect(HALO_SUPPORT_MANIFEST['comm.multi_rep_within_24h'].catalog295Anchor).toMatch(/SW-197.*closest/i)
    expect(HALO_SUPPORT_MANIFEST['appt.cancel_rate'].catalog295Anchor).toMatch(/none/i)
  })
})

describe('Halo three-layer evaluator', () => {
  const values = new Map<string, number | null>([
    ['gross.total_sum', 12240.78],
    ['appt.show_rate', 12 / 18],
  ])

  it('separates current / industry / baseline; industry is NEVER a scoring benchmark', () => {
    const rows = evaluateThreeLayers({ values })
    expect(rows.length).toBe(20)
    for (const r of rows) {
      // No scoring verdicts anywhere in M1.
      expect(['no_benchmark', 'directional_non_scoring']).toContain(r.industry.state)
      if (r.industry.state === 'directional_non_scoring') expect(r.industry.scoring).toBe(false)
      // Baseline is insufficient_history (no history supplied), never a score or zero.
      expect(r.baseline.state).toBe('insufficient_history')
    }
  })

  it('current: value when present; withheld vs no_current_data by manifest state', () => {
    const rows = evaluateThreeLayers({ values })
    const row = (s: string) => rows.find((r) => r.slug === s)!

    expect(row('gross.total_sum').current).toMatchObject({ state: 'value', value: 12240.78, unit: 'currency_usd' })
    expect(row('appt.show_rate').current).toMatchObject({ state: 'value' })
    // withheld reader → withheld (with reason)
    expect(row('roi.total_leads').current.state).toBe('withheld')
    // hub reader exists but no data → no_current_data
    expect(row('engagement.conversations').current.state).toBe('no_current_data')
    // supported native but not in values (e.g. Nissan/Ford appt) → no_current_data
    expect(row('appt.confirmed_rate').current.state).toBe('no_current_data')
  })

  it('industry: appt.show_rate is directional/non-scoring & definition-incompatible; gross has no_benchmark', () => {
    const rows = evaluateThreeLayers({ values })
    const show = rows.find((r) => r.slug === 'appt.show_rate')!.industry
    expect(show.state).toBe('directional_non_scoring')
    if (show.state === 'directional_non_scoring') {
      expect(show.scoring).toBe(false)
      expect(show.definition_compatibility).toBe('incompatible')
      expect(show.source_url).toMatch(/^https:\/\//)
      expect(show.confidence).toBe('low')
      // Source publication/update date is distinct from OUR verification date.
      expect(show.source_published_or_updated).toBe('2026-06-04')
      expect(show.verified_on).toBe('2026-08-28')
      expect(show.source_published_or_updated).not.toBe(show.verified_on)
      expect(show.note).toMatch(/appointments SET/i)
    }
    expect(rows.find((r) => r.slug === 'gross.total_sum')!.industry.state).toBe('no_benchmark')
  })

  it('baseline: <3 → insufficient_history; ≥3 varied → band; ≥3 identical → zero_variance (distinct, non-scoring)', () => {
    const hist = new Map<string, ReadonlyArray<number>>([
      ['gross.total_sum', [1000, 2000, 3000, 4000]], // variance → band
      ['appt.show_rate', [0.5, 0.5]], // <3 → insufficient_history
      ['appt.no_show_rate', [0.3, 0.3, 0.3]], // ≥3 identical → zero_variance
    ])
    const rows = evaluateThreeLayers({ values, historyBySlug: hist })
    expect(rows.find((r) => r.slug === 'gross.total_sum')!.baseline.state).toBe('band')
    expect(rows.find((r) => r.slug === 'appt.show_rate')!.baseline).toMatchObject({
      state: 'insufficient_history',
      periods_available: 2,
      needed: 3,
    })
    const zv = rows.find((r) => r.slug === 'appt.no_show_rate')!.baseline
    expect(zv.state).toBe('zero_variance')
    if (zv.state === 'zero_variance') {
      expect(zv.periods_available).toBe(3)
      expect(zv.mean).toBeCloseTo(0.3, 6)
      expect(zv.note).toMatch(/no z-score/i)
    }
  })
})
