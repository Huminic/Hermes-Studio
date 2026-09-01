/**
 * M2B report-card model (isolated dev).
 *
 * Assembles ONE store's complete, honest report model from ACCEPTED analytics data
 * only. Reuses the governed halo report card (three-layer per catalog slug), then
 * layers on: a freshness ledger (source period + age), a coverage ledger
 * (supported / missing / withheld / unsupported with reasons, never zero-filled),
 * the native dealership_performance summary with a Front+Back vs Total gross
 * reconciliation, appointments detail, and a machine-readable evidence manifest.
 *
 * Missing is NEVER zero. ROI / CAGE / comm stay withheld (source Service/Parts
 * Lead-Intent contamination + definitional divergence). Sales-only, tenant-isolated.
 * Pure over the readers the caller's env points at (BRAIN_PROFILES_ROOT).
 */
import { METRIC_CATALOG } from '../../watchdog/metric-catalog'
import { HALO_SUPPORT_MANIFEST, isHaloSalesProfile } from '../../watchdog/halo-support-manifest'
import { buildHaloReportCard, HaloProfileNotAllowedError, type HaloReportCard } from '../halo-report-card'
import type { BaselineLayer, IndustryLayer } from '../halo-three-layer'
import { narrateHaloReportCard, type HaloAiClaim, type NarrationDeps } from '../halo-ai-narrative'
import {
  readAppointments,
  readCrmSalesGross,
  readDealershipPerformance,
  type AppointmentsMetrics,
  type DealershipPerformance,
} from '../../ingest-native-metrics'
import { buildM2BOpportunities, type Opportunity } from './opportunities'

/** Governed Sales rooftops (from SCHEMA_CONTRACT tenant registry). */
export const DEALER_REGISTRY: Record<string, { name: string; dealerId: string }> = {
  'serra-honda': { name: 'Serra Honda', dealerId: '21043' },
  'serra-nissan': { name: 'Serra Nissan', dealerId: '21044' },
  'tony-serra-ford': { name: 'Tony Serra Ford', dealerId: '21047' },
}

/** Weekly cadence: fresh <= 8d, aging <= 14d, else stale. */
export const FRESH_MAX_DAYS = 8
export const AGING_MAX_DAYS = 14

export type LedgerState = 'supported' | 'missing' | 'withheld' | 'unsupported'

export type LedgerRow = {
  slug: string
  label: string
  category: string
  unit: string
  state: LedgerState
  display: string | null
  reason: string | null
  /** Comparison layers (carried from the three-layer evaluator) for the PDF. */
  industry: IndustryLayer
  baseline: BaselineLayer
  /** Governed periods on file for this metric (1 when a current value exists). */
  periods_on_file: number
}

export type FreshnessRow = {
  family: string
  period_start: string | null
  period_end: string | null
  age_days: number | null
  freshness: 'fresh' | 'aging' | 'stale' | 'unknown'
  checksum: string
  parser_version: string | null
  accepted_rows: number
}

export type GrossReconciliation = {
  front: number
  back: number
  total: number
  computed_total: number
  delta: number
  reconciles: boolean
}

export type EvidenceSource = {
  family: string
  delivery_id: string
  checksum: string
  parser_version: string | null
  period: { start: string | null; end: string | null }
  accepted_rows: number
}

export type M2BReportModel = {
  schema_version: '1.0.0'
  profile: string
  dealer_name: string
  dealer_id: string
  sales_only: true
  generated_at_iso: string
  window_days: number
  coverage_period: { start: string | null; end: string | null }
  overall_freshness: { newest_period_end: string | null; age_days: number | null; freshness: FreshnessRow['freshness'] }
  freshness: FreshnessRow[]
  coverage_counts: { total: number; supported: number; missing: number; withheld: number; unsupported: number }
  ledger: LedgerRow[]
  scorecards: Array<{ category: string; rows: LedgerRow[] }>
  native_performance: {
    dealership_performance:
      | { available: true; summary: DealershipPerformance['summary']; reconciliation: GrossReconciliation; provenance: EvidenceSource }
      | { available: false; reason: string }
    appointments:
      | { available: true; counts: Omit<AppointmentsMetrics, 'available' | 'source' | 'provenance' | 'byStatus'>; byStatus: Record<string, number>; provenance: EvidenceSource }
      | { available: false; reason: string }
  }
  opportunities: Opportunity[]
  narrative: string
  narrative_mode: 'ai_grounded' | 'deterministic_grounded'
  narrative_provider: string
  narrative_fallback_reason: string | null
  narrative_claims: HaloAiClaim[] | null
  /** MET only when an evidence-constrained AI narrative validated (ai_grounded). */
  ai_narrative_acceptance: 'met' | 'unmet'
  evidence_manifest: {
    sources: EvidenceSource[]
    withheld_families: string[]
    coverage_counts: M2BReportModel['coverage_counts']
    generated_at_iso: string
  }
  limitations: string[]
}

function ageDays(periodEnd: string | null, now: number): number | null {
  if (!periodEnd) return null
  const end = Date.parse(`${periodEnd}T23:59:59Z`)
  if (Number.isNaN(end)) return null
  return Math.max(0, Math.floor((now - end) / 86_400_000))
}

function freshnessOf(age: number | null): FreshnessRow['freshness'] {
  if (age == null) return 'unknown'
  if (age <= FRESH_MAX_DAYS) return 'fresh'
  if (age <= AGING_MAX_DAYS) return 'aging'
  return 'stale'
}

function ledgerStateFor(card: HaloReportCard['cards'][number]): { state: LedgerState; reason: string | null } {
  if (card.current.state === 'value') return { state: 'supported', reason: null }
  if (card.current.state === 'withheld') return { state: 'withheld', reason: card.current.reason }
  // no_current_data: the metric IS supported by a reader, but no accepted source
  // for this period (missing) - never rendered as zero.
  return { state: 'missing', reason: card.current.reason }
}

/** Build one store's complete M2B report model from accepted analytics only.
 * Attempts an evidence-constrained AI narrative (halo-ai-narrative); falls back to
 * the deterministic grounded narrative and marks AI acceptance UNMET if no provider. */
export async function buildM2BReportModel(
  profile: string,
  opts: { now?: number; windowDays?: number; narration?: NarrationDeps } = {},
): Promise<M2BReportModel> {
  if (!isHaloSalesProfile(profile)) throw new HaloProfileNotAllowedError(profile)
  const now = opts.now ?? Date.now()
  const windowDays = opts.windowDays ?? 30
  const dealer = DEALER_REGISTRY[profile]

  const card = buildHaloReportCard(profile, windowDays, now)
  const narration = await narrateHaloReportCard(card, opts.narration)

  const ledger: LedgerRow[] = card.cards.map((c) => {
    const { state, reason } = ledgerStateFor(c)
    return {
      slug: c.slug,
      label: c.label,
      category: c.category,
      unit: c.unit,
      state,
      display: c.display,
      reason,
      industry: c.industry,
      baseline: c.baseline,
      periods_on_file: state === 'supported' ? 1 : 0,
    }
  })

  const coverage_counts = {
    total: ledger.length,
    supported: ledger.filter((r) => r.state === 'supported').length,
    missing: ledger.filter((r) => r.state === 'missing').length,
    withheld: ledger.filter((r) => r.state === 'withheld').length,
    unsupported: ledger.filter((r) => r.state === 'unsupported').length,
  }

  // Scorecards grouped by catalog category (stable catalog order).
  const categoryOrder: string[] = []
  for (const m of METRIC_CATALOG) if (!categoryOrder.includes(m.category)) categoryOrder.push(m.category)
  const scorecards = categoryOrder.map((category) => ({ category, rows: ledger.filter((r) => r.category === category) }))

  // Native performance detail + provenance/freshness.
  const dp = readDealershipPerformance(profile)
  const ap = readAppointments(profile)
  const freshness: FreshnessRow[] = []
  const sources: EvidenceSource[] = []

  const dpModel: M2BReportModel['native_performance']['dealership_performance'] = dp.available
    ? (() => {
        const s = dp.summary
        const front = s.frontGross ?? 0
        const back = s.backGross ?? 0
        const total = s.totalGross ?? 0
        const computed = Math.round((front + back) * 100) / 100
        const delta = Math.round((computed - total) * 100) / 100
        const src: EvidenceSource = {
          family: 'dealership_performance',
          delivery_id: dp.provenance.deliveryId,
          checksum: dp.provenance.checksum,
          parser_version: dp.provenance.parserVersion,
          period: dp.provenance.period,
          accepted_rows: dp.provenance.acceptedRows,
        }
        sources.push(src)
        const age = ageDays(dp.provenance.period.end, now)
        freshness.push({
          family: 'dealership_performance',
          period_start: dp.provenance.period.start,
          period_end: dp.provenance.period.end,
          age_days: age,
          freshness: freshnessOf(age),
          checksum: dp.provenance.checksum,
          parser_version: dp.provenance.parserVersion,
          accepted_rows: dp.provenance.acceptedRows,
        })
        return {
          available: true,
          summary: s,
          reconciliation: {
            front,
            back,
            total,
            computed_total: computed,
            delta,
            reconciles: Math.abs(delta) <= 0.01,
          },
          provenance: src,
        }
      })()
    : { available: false, reason: dp.available === false ? dp.reason : 'unavailable' }

  const apModel: M2BReportModel['native_performance']['appointments'] = ap.available
    ? (() => {
        const src: EvidenceSource = {
          family: 'appointments',
          delivery_id: ap.provenance.deliveryId,
          checksum: ap.provenance.checksum,
          parser_version: ap.provenance.parserVersion,
          period: ap.provenance.period,
          accepted_rows: ap.provenance.acceptedRows,
        }
        sources.push(src)
        const age = ageDays(ap.provenance.period.end, now)
        freshness.push({
          family: 'appointments',
          period_start: ap.provenance.period.start,
          period_end: ap.provenance.period.end,
          age_days: age,
          freshness: freshnessOf(age),
          checksum: ap.provenance.checksum,
          parser_version: ap.provenance.parserVersion,
          accepted_rows: ap.provenance.acceptedRows,
        })
        return {
          available: true,
          counts: {
            total: ap.total,
            completed: ap.completed,
            confirmed: ap.confirmed,
            show: ap.show,
            noShow: ap.noShow,
            cancelled: ap.cancelled,
            rescheduled: ap.rescheduled,
          },
          byStatus: ap.byStatus,
          provenance: src,
        }
      })()
    : { available: false, reason: ap.available === false ? ap.reason : 'unavailable' }

  // CRM Sales Gross is the PRECEDENCE source for gross.total_sum (+ per-deal
  // reconciliation) — list it in the evidence manifest/freshness when accepted so the
  // ledger's gross provenance is fully traceable (Dashboard TOTAL is the fallback).
  const crm = readCrmSalesGross(profile)
  if (crm.available) {
    const src: EvidenceSource = {
      family: 'crm_sales_gross',
      delivery_id: crm.provenance.deliveryId,
      checksum: crm.provenance.checksum,
      parser_version: crm.provenance.parserVersion,
      period: crm.provenance.period,
      accepted_rows: crm.provenance.acceptedRows,
    }
    sources.push(src)
    const age = ageDays(crm.provenance.period.end, now)
    freshness.push({
      family: 'crm_sales_gross',
      period_start: crm.provenance.period.start,
      period_end: crm.provenance.period.end,
      age_days: age,
      freshness: freshnessOf(age),
      checksum: crm.provenance.checksum,
      parser_version: crm.provenance.parserVersion,
      accepted_rows: crm.provenance.acceptedRows,
    })
  }

  const newest = freshness
    .map((f) => f.period_end)
    .filter((x): x is string => !!x)
    .sort()
    .pop() ?? card.cards.find((c) => c.provenance?.period?.end)?.provenance?.period?.end ?? null
  const newestAge = ageDays(newest, now)

  const withheld_families = Array.from(
    new Set(ledger.filter((r) => r.state === 'withheld').map((r) => HALO_SUPPORT_MANIFEST[r.slug]?.sourceFamily ?? r.category)),
  )

  const opportunities = buildM2BOpportunities({
    profile,
    dealerName: dealer.name,
    ledger,
    coverage_counts,
    dealershipPerformance: dpModel,
    appointments: apModel,
  })

  return {
    schema_version: '1.0.0',
    profile,
    dealer_name: dealer.name,
    dealer_id: dealer.dealerId,
    sales_only: true,
    generated_at_iso: new Date(now).toISOString(),
    window_days: windowDays,
    coverage_period: { start: newest ? card.cards.find((c) => c.provenance)?.provenance?.period?.start ?? null : null, end: newest },
    overall_freshness: { newest_period_end: newest, age_days: newestAge, freshness: freshnessOf(newestAge) },
    freshness,
    coverage_counts,
    ledger,
    scorecards,
    native_performance: { dealership_performance: dpModel, appointments: apModel },
    opportunities,
    narrative: narration.narrative,
    narrative_mode: narration.narrative_mode,
    narrative_provider: narration.narrative_provider,
    narrative_fallback_reason: narration.narrative_fallback_reason,
    narrative_claims: narration.narrative_claims,
    ai_narrative_acceptance: narration.narrative_mode === 'ai_grounded' ? 'met' : 'unmet',
    evidence_manifest: {
      sources,
      withheld_families,
      coverage_counts,
      generated_at_iso: new Date(now).toISOString(),
    },
    limitations: card.limitations,
  }
}
