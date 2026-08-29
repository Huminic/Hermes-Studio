/**
 * Halo Data — three-store report-card assembler (M2, isolated dev).
 *
 * Single semantic source: the v1.1.0 support manifest + the three-layer evaluator.
 * For every catalog slug it presents current / industry / baseline states, plus
 * provenance (source + governed period + checksum) and unit, a coverage summary,
 * explicit limitations, and a grounded deterministic narrative. Missing≠zero and
 * withheld/no-current states are explicit. SALES-ONLY: any Service/Parts card is a
 * hard error (they live only in the separate Serra Service workspace). Reads only
 * the given profile's governed data (tenant isolation via BRAIN_PROFILES_ROOT).
 */
import { METRIC_CATALOG, type CatalogMetric } from '../watchdog/metric-catalog'
import {
  HALO_SALES_PROFILES,
  HALO_SUPPORT_MANIFEST,
  HALO_SUPPORT_MANIFEST_VERSION,
  isHaloSalesProfile,
  type MetricUnit,
} from '../watchdog/halo-support-manifest'
import type { MetricValues } from '../watchdog/alert-engine'
import { resolveMetricValues } from '../watchdog/metric-values'
import {
  evaluateThreeLayers,
  type BaselineLayer,
  type CurrentLayer,
  type IndustryLayer,
} from './halo-three-layer'
import { readAppointments, readDealershipPerformance } from '../ingest-native-metrics'
import { buildHaloNarrative } from './halo-narrative'

const SERVICE_PARTS_RE = /service|parts/i

/** Studio convention (matches /api/customer/dashboard): window_days ∈ {7,30,90}, else 30. */
export const HALO_ALLOWED_WINDOWS = [7, 30, 90] as const
export function normalizeHaloWindowDays(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  return (HALO_ALLOWED_WINDOWS as ReadonlyArray<number>).includes(n) ? n : 30
}

/** Thrown when a non-governed-Sales profile is requested (fail-closed). */
export class HaloProfileNotAllowedError extends Error {
  constructor(profile: string) {
    super(`Halo is Sales-only: "${profile}" is not one of the governed Sales profiles [${HALO_SALES_PROFILES.join(', ')}].`)
    this.name = 'HaloProfileNotAllowedError'
  }
}

function formatValue(v: number, unit: MetricUnit): string {
  if (unit === 'currency_usd') {
    return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  if (unit === 'ratio_0_1') return `${(v * 100).toFixed(1)}%`
  return String(Math.round(v))
}

export type CardProvenance =
  | { source: string; period?: { start: string | null; end: string | null }; checksum?: string }
  | null

export type HaloCard = {
  slug: string
  label: string
  category: string
  unit: MetricUnit
  /** Formatted current value, or null when no current value. */
  display: string | null
  current: CurrentLayer
  industry: IndustryLayer
  baseline: BaselineLayer
  provenance: CardProvenance
}

export type HaloCoverage = {
  total: number
  current_value: number
  no_current_data: number
  withheld: number
}

export type HaloReportCard = {
  profile: string
  sales_only: true
  manifest_version: string
  window_days: number
  /** This slice ships a DETERMINISTIC, evidence-grounded narrative — NOT final M2
   *  AI-narrative acceptance. Injectable evidence-constrained AI narration is the
   *  next M2 increment (layers on top; grounding guarantees preserved). */
  narrative_mode: 'deterministic_grounded'
  cards: HaloCard[]
  coverage: HaloCoverage
  limitations: string[]
  narrative: string
}

function buildLimitations(cards: ReadonlyArray<HaloCard>, coverage: HaloCoverage): string[] {
  const out: string[] = [
    'Sales-only: Service and Parts are excluded (they belong only to the separate combined Serra Service workspace).',
  ]
  if (coverage.withheld > 0) {
    out.push(
      `${coverage.withheld} measure(s) withheld pending governed readers (ROI → Lead Source ROI; comm.* → Vin Sales Communication Log; cage.* → Enterprise Performance/CAGE; gross.reconciliation_mismatches → per-deal CRM Sales Gross).`,
    )
  }
  if (coverage.no_current_data > 0) {
    out.push(`${coverage.no_current_data} measure(s) have no current value this period (empty/absent governed source).`)
  }
  out.push('Industry references are directional and NON-SCORING where no definition-compatible standard exists; benchmarks are never scored.')
  const baseStates = new Set(cards.map((c) => c.baseline.state))
  if (baseStates.has('insufficient_history')) out.push('Dealer baseline: insufficient history (fewer than 3 governed periods) — non-scoring.')
  if (baseStates.has('zero_variance')) out.push('Dealer baseline: zero variance across periods — non-scoring.')
  return out
}

export function buildHaloReportCard(
  profile: string,
  windowDays: number,
  now: number = Date.now(),
  historyBySlug?: Map<string, ReadonlyArray<number>>,
): HaloReportCard {
  // FAIL-CLOSED Sales-domain gate — before any data is read. Rejects service,
  // unknown, and traversal-like profiles so no report can be labeled sales_only.
  if (!isHaloSalesProfile(profile)) throw new HaloProfileNotAllowedError(profile)
  const wd = normalizeHaloWindowDays(windowDays)

  const values: MetricValues = resolveMetricValues(profile, wd, now)
  const layers = evaluateThreeLayers({ values, historyBySlug })

  // Provenance sources (availability-safe readers; per-profile / tenant-isolated).
  const dp = readDealershipPerformance(profile)
  const ap = readAppointments(profile)
  const provenanceFor = (slug: string, hasValue: boolean): CardProvenance => {
    if (!hasValue) return null
    if (slug === 'gross.total_sum' && dp.available) {
      return { source: 'dealership_performance', period: dp.provenance.period, checksum: dp.provenance.checksum }
    }
    if (slug.startsWith('appt.') && ap.available) {
      return { source: 'appointments', period: ap.provenance.period, checksum: ap.provenance.checksum }
    }
    if (slug.startsWith('engagement.')) return { source: 'messaging-hub window' }
    return null
  }

  const metaFor = (slug: string): CatalogMetric | undefined => METRIC_CATALOG.find((m) => m.id === slug)

  const cards: HaloCard[] = layers.map((l) => {
    const meta = metaFor(l.slug)
    const unit = HALO_SUPPORT_MANIFEST[l.slug]?.unit ?? 'count'
    const hasValue = l.current.state === 'value'
    const display = hasValue && l.current.state === 'value' ? formatValue(l.current.value, unit) : null
    return {
      slug: l.slug,
      label: meta?.label ?? l.slug,
      category: meta?.category ?? 'Unknown',
      unit,
      display,
      current: l.current,
      industry: l.industry,
      baseline: l.baseline,
      provenance: provenanceFor(l.slug, hasValue),
    }
  })

  // Hard Sales-only guard: no Service/Parts may ever appear on these Sales profiles.
  const violations = cards.filter((c) => SERVICE_PARTS_RE.test(c.category) || SERVICE_PARTS_RE.test(c.slug))
  if (violations.length > 0) {
    throw new Error(`Sales-only violation: Service/Parts card(s) present: ${violations.map((c) => c.slug).join(', ')}`)
  }

  const coverage: HaloCoverage = {
    total: cards.length,
    current_value: cards.filter((c) => c.current.state === 'value').length,
    no_current_data: cards.filter((c) => c.current.state === 'no_current_data').length,
    withheld: cards.filter((c) => c.current.state === 'withheld').length,
  }

  const limitations = buildLimitations(cards, coverage)
  const narrative = buildHaloNarrative({ profile, windowDays: wd, cards, coverage, limitations })

  return {
    profile,
    sales_only: true,
    manifest_version: HALO_SUPPORT_MANIFEST_VERSION,
    window_days: wd,
    narrative_mode: 'deterministic_grounded',
    cards,
    coverage,
    limitations,
    narrative,
  }
}
