/**
 * Gate 5A — baseline verification, definition compatibility, and three-dealer peer ranking (pure).
 *
 * Gate 5A audits the ALREADY-committed evaluated corpus (17 metrics × 3 governed rooftops = 51 cells).
 * It invents nothing: every value, baseline, variance, rating, and rank is already committed in the
 * spine / comm / content evaluation ledgers. Gate 5A INDEPENDENTLY re-derives variance, rating, and a
 * direction-aware peer rank (reusing the canonical evaluator helpers) and fails closed on any mismatch,
 * then records verified industry benchmarks and their per-metric DEFINITION COMPATIBILITY.
 *
 * Governing facts (operator-supplied, controller-verified 2026-09-01):
 *   - Every comparison basis for an evaluated metric is a Duane-supplied OPERATIONAL TARGET, labeled as
 *     such. An operational target is a valid comparison basis; it is NEVER an industry benchmark.
 *   - No verified industry benchmark maps as a variance basis this gate. All three candidate mappings
 *     are REJECTED (reference-only) for proven definition incompatibility:
 *       · SW-032 ← Foureyes 59% show — SW-032 denominator is "total appointment rows", which the
 *         committed supporting data proves includes cancelled (4) and rescheduled (7); Foureyes show =
 *         shows / appointments SET. Denominators differ → reference-only.
 *       · SW-031 ← Foureyes 40% appointment-set — SW-031 denominator is leads; Foureyes set =
 *         appointments set / opportunities with established CONTACT. Denominators differ → reference-only.
 *       · SW-011 ← Pied Piper ILE — SW-011 is a median business-hours response time; ILE is a
 *         response-effectiveness composite (24h answer, no median, no business-hours filter) → incompatible.
 *   - Because no benchmark is definition-compatible, no benchmark number enters any variance. Benchmark
 *     top-level `value` stays null in the registry (the fabrication guard); verified figures live in
 *     `verified_metrics`, reference-only.
 *
 * This module is PURE (no I/O). The generator reads the committed cells and applies these functions.
 */
import type { Baseline } from '@/server/reports/evaluator/types'
import {
  confidenceLabel,
  rankByDirection,
  rating,
  signedVariance,
} from '@/server/reports/evaluator/metrics'

/** The three governed Sales rooftops. */
export const ROOFTOPS: Record<string, string> = {
  '21043': 'Serra Honda of Sylacauga',
  '21044': 'Serra Nissan of Sylacauga',
  '21047': 'Tony Serra Ford',
}
export const ROOFTOP_IDS = ['21043', '21044', '21047'] as const

/** The 17 evaluated metric IDs (10 spine + 2 comm + 5 content). */
export const EVALUATED_IDS = [
  'SW-011',
  'SW-012',
  'SW-015',
  'SW-021',
  'SW-022',
  'SW-031',
  'SW-032',
  'SW-033',
  'SW-041',
  'SW-045',
  'SW-046',
  'SW-090',
  'SW-133',
  'SW-142',
  'SW-145',
  'SW-149',
  'SW-150',
] as const

// ─────────────────────────────────────────────────────────────────────────────
// Verified industry benchmarks (operator-supplied primary-source facts, verified 2026-09-01).
// ALL are reference-only this gate. No benchmark maps as a variance basis (proven incompatible).
// ─────────────────────────────────────────────────────────────────────────────

export const BENCHMARK_VERIFIED_DATE = '2026-09-01' as const

export type BenchmarkMetricFigure = {
  key: string
  label: string
  value: number
  unit: string
  range?: [number, number]
  definition: string
}
export type VerifiedBenchmark = {
  id: string
  publisher: string
  title: string
  url: string
  support_url?: string
  publication_date: string
  observed_period: string
  sample: string
  population: string
  verified_date: string
  usage: 'reference_only'
  metrics: Array<BenchmarkMetricFigure>
  note: string
}

export const VERIFIED_BENCHMARKS: ReadonlyArray<VerifiedBenchmark> = [
  {
    id: 'IB-FOUREYES-FUNNEL-Q1-2026',
    publisher: 'Foureyes',
    title: 'Q1 2026 dealership close-rate / funnel study',
    url: 'https://www.foureyes.io/blog/dealership-close-rates-by-metro',
    support_url:
      'https://support.foureyes.io/en/articles/8504360-keep-your-eyes-on-the-prize-with-sales-process-performance',
    publication_date: '2026',
    observed_period: 'Q1 2026',
    sample: '2.6M leads; 1,150+ dealers; 48 markets',
    population: 'US dealers across 48 metros',
    verified_date: BENCHMARK_VERIFIED_DATE,
    usage: 'reference_only',
    metrics: [
      {
        key: 'close',
        label: 'Overall close rate',
        value: 0.185,
        unit: 'ratio_0_1',
        range: [0.145, 0.301],
        definition: 'Lead-to-sale close rate.',
      },
      {
        key: 'contact',
        label: 'Contact rate',
        value: 0.69,
        unit: 'ratio_0_1',
        range: [0.47, 0.79],
        definition: 'Contacted opportunities / total opportunities.',
      },
      {
        key: 'appointment_set',
        label: 'Appointment-set rate',
        value: 0.4,
        unit: 'ratio_0_1',
        range: [0.3, 0.59],
        definition:
          'Appointments set / opportunities with established contact.',
      },
      {
        key: 'appointment_show',
        label: 'Appointment-show rate',
        value: 0.59,
        unit: 'ratio_0_1',
        range: [0.41, 0.74],
        definition: 'Appointment shows / appointments set.',
      },
    ],
    note: 'show-to-sale is defined by the publisher as sales-from-appointment / appointment-shows; no single headline value is transcribed here. All figures reference-only.',
  },
  {
    id: 'IB-FOUREYES-APPT-H2-2023',
    publisher: 'Foureyes',
    title: 'H2 2023 dealership appointment-rate study',
    url: 'https://www.foureyes.io/blog/dealership-data-study-appointment-rates',
    publication_date: '2023',
    observed_period: 'H2 2023',
    sample: '~700 US dealers',
    population: 'US dealers, by lead type / vehicle condition',
    verified_date: BENCHMARK_VERIFIED_DATE,
    usage: 'reference_only',
    metrics: [
      {
        key: 'internet_phone_new_contact',
        label: 'Internet+Phone new — contact',
        value: 0.63,
        unit: 'ratio_0_1',
        definition: 'Contacted opportunities / total (Internet+Phone, new).',
      },
      {
        key: 'internet_phone_new_set',
        label: 'Internet+Phone new — set',
        value: 0.42,
        unit: 'ratio_0_1',
        definition:
          'Appointments set / contacted opportunities (Internet+Phone, new).',
      },
      {
        key: 'internet_phone_new_show',
        label: 'Internet+Phone new — show',
        value: 0.58,
        unit: 'ratio_0_1',
        definition: 'Shows / appointments set (Internet+Phone, new).',
      },
      {
        key: 'internet_phone_new_show_to_sale',
        label: 'Internet+Phone new — show-to-sale',
        value: 0.41,
        unit: 'ratio_0_1',
        definition: 'Sales-from-appointment / shows (Internet+Phone, new).',
      },
      {
        key: 'used_contact',
        label: 'Used — contact',
        value: 0.67,
        unit: 'ratio_0_1',
        definition: 'Contacted opportunities / total (Used).',
      },
      {
        key: 'used_set',
        label: 'Used — set',
        value: 0.48,
        unit: 'ratio_0_1',
        definition: 'Appointments set / contacted opportunities (Used).',
      },
      {
        key: 'used_show',
        label: 'Used — show',
        value: 0.54,
        unit: 'ratio_0_1',
        definition: 'Shows / appointments set (Used).',
      },
      {
        key: 'used_show_to_sale',
        label: 'Used — show-to-sale',
        value: 0.4,
        unit: 'ratio_0_1',
        definition: 'Sales-from-appointment / shows (Used).',
      },
    ],
    note: 'Dated secondary reference. Use ONLY when exact compatibility (lead type, vehicle condition, denominator) is proven. Not mapped.',
  },
  {
    id: 'IB-FOUREYES-BENCH-2026',
    publisher: 'Foureyes',
    title: '2026 Automotive Dealer Benchmarks Report',
    url: 'https://www.foureyes.io/blog/2026-automotive-dealer-benchmarks-report',
    publication_date: '2026',
    observed_period: '2025',
    sample: '22,900+ dealer sites (non-sales/service filtered)',
    population: 'US franchise + independent dealers',
    verified_date: BENCHMARK_VERIFIED_DATE,
    usage: 'reference_only',
    metrics: [
      {
        key: 'qualified_leads_mishandled',
        label: 'Qualified leads mishandled',
        value: 0.427,
        unit: 'ratio_0_1',
        definition: 'Share of qualified leads mishandled.',
      },
      {
        key: 'never_logged_to_crm',
        label: 'Leads never logged to CRM',
        value: 0.152,
        unit: 'ratio_0_1',
        definition: 'Share of leads never logged to the CRM.',
      },
      {
        key: 'returning_sales_leads_not_answered_24h',
        label: 'Returning sales leads not answered within 24h',
        value: 0.628,
        unit: 'ratio_0_1',
        definition:
          'Share of returning sales leads not answered within 24 hours.',
      },
      {
        key: 'buying_leads_closed_within_3d',
        label: 'Buying leads closed within 3 days',
        value: 0.612,
        unit: 'ratio_0_1',
        definition: 'Share of buying leads that closed within 3 days.',
      },
      {
        key: 'sales_leads_eventually_bought',
        label: 'Sales leads that eventually bought',
        value: 0.117,
        unit: 'ratio_0_1',
        definition: 'Share of sales leads that eventually bought.',
      },
    ],
    note: 'Reference-only unless an exact definition match is proven. Not mapped.',
  },
  {
    id: 'IB-PIEDPIPER-ILE-2026',
    publisher: 'Pied Piper',
    title: '2026 Internet Lead Effectiveness (ILE) study',
    url: 'https://www.piedpiperpsi.com/press/press-release-infiniti-dealers-rank-highest-in-2026-web-lead-response-study-ai-and-automation-drive-industry-improvement-512.htm',
    publication_date: '2026',
    observed_period: '2026',
    sample: '3,290 dealer sites',
    population: 'US dealer websites',
    verified_date: BENCHMARK_VERIFIED_DATE,
    usage: 'reference_only',
    metrics: [
      {
        key: 'composite',
        label: 'ILE composite score',
        value: 71,
        unit: 'index_0_100',
        definition: 'Composite web-lead response effectiveness index.',
      },
      {
        key: 'answered_within_24h_typical',
        label: 'Typical inquiries answered within 24h',
        value: 0.78,
        unit: 'ratio_0_1',
        definition: 'Share of typical inquiries answered within 24 hours.',
      },
      {
        key: 'answered_complex',
        label: 'Complex inquiries answered',
        value: 0.51,
        unit: 'ratio_0_1',
        definition: 'Share of complex inquiries answered.',
      },
      {
        key: 'multichannel',
        label: 'Multichannel response',
        value: 0.62,
        unit: 'ratio_0_1',
        definition: 'Share responding on multiple channels.',
      },
    ],
    note: 'Response-effectiveness composite (24h answer). NOT a median and NOT business-hours filtered → incompatible with SW-011. Not mapped.',
  },
  {
    id: 'IB-NADA-DATA-2025',
    publisher: 'NADA',
    title:
      "NADA Data 2025 — annual financial profile of America's franchised new-car dealerships",
    url: 'https://www.nada.org/media/4695',
    publication_date: '2025',
    observed_period: '2024-2025',
    sample: 'NADA member franchised dealers',
    population: 'US franchised new-car dealers',
    verified_date: BENCHMARK_VERIFIED_DATE,
    usage: 'reference_only',
    metrics: [],
    note: 'Annual national aggregate; not period-compatible with a single dealer-week. Reference-only; no per-metric numeric mapping.',
  },
]

/** A candidate benchmark→metric mapping and its DEFINITION-COMPATIBILITY verdict.
 *  `compatible` is a genuine boolean (all current verdicts are false) so accepted/rejected
 *  partitions in the generator are real runtime filters, not static tautologies. */
export type MappingVerdict = {
  metric_id: string
  benchmark_id: string
  benchmark_metric_key: string
  benchmark_value: number
  compatible: boolean
  decision: string
  reason: string
}

/** Every candidate mapping the operator named — all REJECTED (reference-only) for proven mismatch. */
export const MAPPING_VERDICTS: ReadonlyArray<MappingVerdict> = [
  {
    metric_id: 'SW-032',
    benchmark_id: 'IB-FOUREYES-FUNNEL-Q1-2026',
    benchmark_metric_key: 'appointment_show',
    benchmark_value: 0.59,
    compatible: false,
    decision: 'reference_only',
    reason:
      'SW-032 denominator is "total appointment rows in period", which the committed supporting data proves includes cancelled (4) and rescheduled (7) appointments (23 appointments: 14 confirmed, 13 shown, 6 no-show, 4 cancelled, 7 rescheduled). Foureyes show = appointment shows / appointments SET. The denominators are not the same population, so the mapping is reference-only and NOT used as a variance basis.',
  },
  {
    metric_id: 'SW-031',
    benchmark_id: 'IB-FOUREYES-FUNNEL-Q1-2026',
    benchmark_metric_key: 'appointment_set',
    benchmark_value: 0.4,
    compatible: false,
    decision: 'reference_only',
    reason:
      'SW-031 denominator is leads_total (appointments set / leads, store aggregate). Foureyes appointment-set = appointments set / opportunities with established CONTACT. Denominator differs (leads vs contacted opportunities); reference-only, NOT mapped.',
  },
  {
    metric_id: 'SW-011',
    benchmark_id: 'IB-PIEDPIPER-ILE-2026',
    benchmark_metric_key: 'composite',
    benchmark_value: 71,
    compatible: false,
    decision: 'reference_only',
    reason:
      'SW-011 is the median of business-hours Actual Response Time (minutes). Pied Piper ILE is a response-effectiveness composite (24h answer presence/speed/quality) — not a median and not business-hours filtered. Incompatible; reference-only, NOT mapped.',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Independent verification helpers (reuse the canonical evaluator functions).
// ─────────────────────────────────────────────────────────────────────────────

/** A committed evaluated cell (subset used by Gate 5A). */
export type EvaluatedCell = {
  metric_id: string
  dealer_id: string
  status: string
  value: number
  unit: string
  numerator: number
  denominator: number
  baseline: Baseline
  variance: number
  rating: string
  rank: number
  reporting_period: { start: string; end: string; timezone: string }
  formula: string
  source_family: string | null
}

/** Format a native variance for display, unit-aware. */
export function displayVariance(nativeVariance: number, unit: string): string {
  const sign = nativeVariance > 0 ? '+' : nativeVariance < 0 ? '' : ''
  if (unit === 'minutes') return `${sign}${round(nativeVariance, 2)} min`
  if (unit.startsWith('ratio'))
    return `${sign}${round(nativeVariance * 100, 1)} pp`
  return `${sign}${round(nativeVariance, 4)}`
}

function round(x: number, dp: number): number {
  const f = 10 ** dp
  return Math.round(x * f) / f
}

/** Independently recompute variance/rating/rank for a cell and check they match the committed values. */
export function verifyCell(
  cell: EvaluatedCell,
  peersInCohort: Array<number>,
): { ok: boolean; failures: Array<string> } {
  const failures: Array<string> = []
  const b = cell.baseline
  if (b.basis !== 'operational_target')
    failures.push('comparison_basis_not_operational_target')
  if (b.value === null || !Number.isFinite(b.value))
    failures.push('baseline_value_not_numeric')
  else {
    const wantVar = signedVariance(cell.value, b)
    if (wantVar === null || !close(cell.variance, wantVar))
      failures.push('variance_mismatch')
    if (cell.rating !== rating(cell.value, b)) failures.push('rating_mismatch')
    if (b.direction === null) failures.push('direction_missing')
    else if (
      cell.rank !== rankByDirection(cell.value, peersInCohort, b.direction)
    )
      failures.push('rank_mismatch')
  }
  return { ok: failures.length === 0, failures }
}

function close(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9
}

/** Confidence label independently recomputed from the denominator. */
export function confidenceFor(denominator: number): string {
  return confidenceLabel(denominator)
}

// ─────────────────────────────────────────────────────────────────────────────
// Customer-safe projection (name metric + public source; no internal paths/titles/controls/PII).
// ─────────────────────────────────────────────────────────────────────────────

/** Tokens that must NEVER reach the customer projection. */
export const CUSTOMER_FORBIDDEN =
  /\b(spine-ledger|comm-evaluation|content-evaluation|baseline-registry|docs\/halo|src\/|scripts\/|\.json|\.ts|VinSolutions|Dashboard|Custom Reporting|Desk Log|Deal Performance|DMS|Sales Flat|quarantin|hold|blocker_class|frozen_e1|rep_token|Is Show)\b/i
const NAME_PAIR = /\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/g
const ALLOWED_PROPER = new Set([
  'Serra',
  'Honda',
  'Nissan',
  'Ford',
  'Tony',
  'Sylacauga',
  'Pied',
  'Piper',
])

/** Fail-closed: a customer projection string exposes no internal path/title/control/PII/person name. */
export function assertProjectionSafe(label: string, str: string): void {
  if (!str.trim()) throw new Error(`Gate 5A: empty customer string (${label})`)
  if (CUSTOMER_FORBIDDEN.test(str))
    throw new Error(
      `Gate 5A: customer projection exposes an internal term (${label}): "${str}"`,
    )
  const PII = /\b(\d{3}-\d{2}-\d{4}|@[a-z0-9.-]+\.[a-z]{2,})\b/i
  if (PII.test(str))
    throw new Error(
      `Gate 5A: customer projection contains PII (${label}): "${str}"`,
    )
  for (const m of str.matchAll(NAME_PAIR))
    if (!ALLOWED_PROPER.has(m[1]) || !ALLOWED_PROPER.has(m[2]))
      throw new Error(
        `Gate 5A: customer projection may contain a person name (${label}): "${m[0]}"`,
      )
}
