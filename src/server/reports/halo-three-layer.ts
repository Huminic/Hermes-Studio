/**
 * Halo Data — pure three-layer evaluator.
 *
 * For each catalog slug it emits three SEPARATE, non-blended states:
 *   - current           : the governed current value, or withheld / no_current_data
 *   - industry          : a definition-compatible reference, or explicit no_benchmark
 *   - baseline          : the dealer's own trend band, or insufficient_history
 *
 * Reuses the current resolver (`resolveMetricValues`), the support manifest, and the
 * baseline helper (`baselineFromHistory`). Pure — no DB writes, no I/O beyond the
 * resolver the caller already invoked.
 *
 * Industry epistemics (per source inspection, 2026): NO Studio slug currently has a
 * clean, definition-compatible, scoring benchmark. In particular
 * (https://www.demandlocal.com/blog/appointment-setting-show-rate-statistics/,
 * updated 2026-06-04) states there is no single universal show-rate benchmark; Foureyes
 * defines Appointment Show Rate = shows ÷ appointments SET (Studio computes shows ÷
 * appointment ROWS), and the Foureyes 2025-05-06 page is a SET-rate study, not a
 * show-rate target. So `appt.show_rate`/`appt.no_show_rate` carry a DIRECTIONAL,
 * NON-SCORING range only; everything else is `no_benchmark`.
 */
import { HALO_SUPPORT_MANIFEST, type MetricUnit } from '../watchdog/halo-support-manifest'
import { METRIC_CATALOG } from '../watchdog/metric-catalog'
import { type MetricValues } from '../watchdog/alert-engine'
import { mean as meanOf, stddev as stddevOf } from '../watchdog/baseline'
import { resolveMetricValues } from '../watchdog/metric-values'

export const BASELINE_MIN_PERIODS = 3

export type CurrentLayer =
  | { state: 'value'; value: number; unit: MetricUnit }
  | { state: 'no_current_data'; reason: string }
  | { state: 'withheld'; reason: string }

export type IndustryLayer =
  | { state: 'no_benchmark'; note: string }
  | {
      state: 'directional_non_scoring'
      scoring: false
      range: string
      source_url: string
      source_type: string
      confidence: 'low' | 'medium' | 'high'
      /** When the SOURCE was published/last updated (per the source page). */
      source_published_or_updated: string
      /** When WE last verified the source (America/New_York) — distinct from the source date. */
      verified_on: string
      definition_compatibility: 'compatible' | 'partial' | 'incompatible'
      note: string
    }

export type BaselineLayer =
  | { state: 'insufficient_history'; periods_available: number; needed: number }
  /** Enough periods but 0 variance → a z-score band cannot be computed. Non-scoring. */
  | { state: 'zero_variance'; periods_available: number; mean: number; note: string }
  | { state: 'band'; mean: number; stddev: number; periods_available: number }

export type ThreeLayer = {
  slug: string
  unit: MetricUnit
  current: CurrentLayer
  industry: IndustryLayer
  baseline: BaselineLayer
}

/** Structured industry references — non-scoring only (see epistemics above). */
const INDUSTRY_REFERENCES: Record<string, Extract<IndustryLayer, { state: 'directional_non_scoring' }>> = {
  'appt.show_rate': {
    state: 'directional_non_scoring',
    scoring: false,
    range: '50–65% (vendor-directional; source explicitly says no universal benchmark)',
    source_url: 'https://www.demandlocal.com/blog/appointment-setting-show-rate-statistics/',
    source_type: 'vendor blog (directional)',
    confidence: 'low',
    source_published_or_updated: '2026-06-04',
    verified_on: '2026-08-28',
    definition_compatibility: 'incompatible',
    note: 'Demand Local (updated 2026-06-04) explicitly states there is no single universal show-rate benchmark. Foureyes defines Appointment Show Rate = shows ÷ appointments SET (support.foureyes.io, 2025-03-14); Studio computes shows ÷ appointment ROWS — different denominator. The Foureyes 2025-05-06 page is a SET-rate study (40% internet / 75% phone), NOT a show-rate target. Do NOT cite Foureyes for a 50% target and do NOT score.',
  },
  'appt.no_show_rate': {
    state: 'directional_non_scoring',
    scoring: false,
    range: '~35–50% (DERIVED from the show-rate range; not a published sales no-show)',
    source_url: 'https://www.demandlocal.com/blog/appointment-setting-show-rate-statistics/',
    source_type: 'derived estimate',
    confidence: 'low',
    source_published_or_updated: '2026-06-04',
    verified_on: '2026-08-28',
    definition_compatibility: 'incompatible',
    note: 'Derived from the show-rate range; the ~20% figure that circulates is a SERVICE number and must not be applied to sales. Non-scoring.',
  },
}

const NO_BENCHMARK_NOTES: Record<string, string> = {
  'gross.total_sum':
    'Industry gross is a PER-UNIT figure (Haig ~$3,298 front PVR, Q4 2024); Studio gross.total_sum is a TOTAL SUM across deals — incompatible grain/denominator. No scoring benchmark.',
  'appt.confirmed_rate': 'Confirmation cadence is cited as a lever, but no sourced numeric confirmed-rate benchmark exists.',
  'appt.cancel_rate': 'Unsourced — needs a benchmark (no public sales cancel-rate figure).',
}
const DEFAULT_NO_BENCHMARK =
  'No neutral, definition-compatible external benchmark; judge against the dealer’s own trend.'

function currentLayer(slug: string, values: MetricValues): CurrentLayer {
  const support = HALO_SUPPORT_MANIFEST[slug]
  const unit = support?.unit ?? 'count'
  if (values.has(slug)) {
    const value = values.get(slug)
    if (value != null && Number.isFinite(value)) return { state: 'value', value, unit }
  }
  if (support?.state === 'withheld') {
    return { state: 'withheld', reason: support.withheldReason ?? 'no governed reader' }
  }
  return { state: 'no_current_data', reason: support?.withheldReason ?? 'no current value for this period' }
}

function industryLayer(slug: string): IndustryLayer {
  const ref = INDUSTRY_REFERENCES[slug]
  if (ref) return ref
  return { state: 'no_benchmark', note: NO_BENCHMARK_NOTES[slug] ?? DEFAULT_NO_BENCHMARK }
}

function baselineLayer(slug: string, historyBySlug?: Map<string, ReadonlyArray<number>>): BaselineLayer {
  const hist = historyBySlug?.get(slug) ?? []
  if (hist.length < BASELINE_MIN_PERIODS) {
    return { state: 'insufficient_history', periods_available: hist.length, needed: BASELINE_MIN_PERIODS }
  }
  const arr = [...hist]
  const sd = stddevOf(arr)
  const m = meanOf(arr)
  // ≥3 IDENTICAL periods is sufficient history but yields no z-score — a distinct,
  // explicit NON-SCORING state, never conflated with insufficient_history.
  if (sd === 0) {
    return {
      state: 'zero_variance',
      periods_available: arr.length,
      mean: m,
      note: 'sufficient history but zero variance across periods → no z-score band (non-scoring).',
    }
  }
  return { state: 'band', mean: m, stddev: sd, periods_available: arr.length }
}

/**
 * Pure evaluator. `values` is the resolver output; `historyBySlug` carries prior
 * governed-period values per slug (default: none → insufficient_history everywhere).
 */
export function evaluateThreeLayers(input: {
  values: MetricValues
  historyBySlug?: Map<string, ReadonlyArray<number>>
  slugs?: ReadonlyArray<string>
}): ThreeLayer[] {
  const slugs = input.slugs ?? METRIC_CATALOG.map((m) => m.id)
  return slugs.map((slug) => ({
    slug,
    unit: HALO_SUPPORT_MANIFEST[slug]?.unit ?? 'count',
    current: currentLayer(slug, input.values),
    industry: industryLayer(slug),
    baseline: baselineLayer(slug, input.historyBySlug),
  }))
}

/** Convenience: resolve the current values for a profile, then evaluate three layers. */
export function resolveHaloThreeLayers(
  profile: string,
  windowDays: number,
  now: number = Date.now(),
  historyBySlug?: Map<string, ReadonlyArray<number>>,
): ThreeLayer[] {
  const values = resolveMetricValues(profile, windowDays, now)
  return evaluateThreeLayers({ values, historyBySlug })
}
