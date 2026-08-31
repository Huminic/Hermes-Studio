/**
 * Halo Data — versioned SUPPORT MANIFEST for the 20 Studio catalog slugs.
 *
 * The single, auditable source of truth for WHICH catalog slugs Studio can currently
 * produce, from what governed source, and — when it cannot — the exact withheld reason.
 * Pure data; no I/O. Describes the 20 curated Studio slugs ONLY; it does NOT assert
 * the full governed 295-condition catalog is executable. (M2R R1: added the previously
 * omitted `dashboard.response_time_actual_avg_min` slug so the manifest covers all 20
 * catalog slugs exactly once.)
 *
 * Current native support is EXACTLY the resolver's accepted native set (NATIVE7, ratified by
 * halo-m1-proof): gross.total_sum + the four appt.* rates + gross.reconciliation_mismatches
 * (accepted CRM Sales Gross) + dashboard.response_time_actual_avg_min (accepted Dealership
 * Performance Response Time section). The three engagement.* are pre-existing hub metrics (reader
 * exists; isolated stores hold no conversation data → no current values). Everything else is
 * withheld pending its exact governed report reader.
 *
 * M2R R1 correction 2 (truth vs runtime): resolveMetricValues emits gross.reconciliation_mismatches
 * (=0) and dashboard.response_time_actual_avg_min (210/238/317) for all three stores, and
 * halo-three-layer's currentLayer surfaces resolved values BEFORE consulting a withheld state — so a
 * "withheld" claim for either would be untrue. Both are therefore marked SUPPORTED here to match the
 * ratified runtime (no execution change; the resolver already emits them from accepted strict families).
 *
 * 295-condition anchors (`catalog295Anchor`) reference the in-worktree governed catalog
 * `docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json` (295 conditions SW-001..SW-295;
 * machine-readable). "closest/primitive/none" are labeled honestly.
 */
import { METRIC_CATALOG } from './metric-catalog'

export const HALO_SUPPORT_MANIFEST_VERSION = '1.2.0'

/**
 * The ONLY profiles Halo may ever report on — the three governed Serra SALES
 * profiles. Permanent Sales-only boundary: Service/Parts live only in the separate
 * combined Serra Service workspace and must never be reachable here. Exact-match
 * allowlist (fail-closed) — rejects service, unknown, and traversal-like inputs.
 */
export const HALO_SALES_PROFILES = ['serra-honda', 'serra-nissan', 'tony-serra-ford'] as const
export type HaloSalesProfile = (typeof HALO_SALES_PROFILES)[number]
export function isHaloSalesProfile(profile: string): profile is HaloSalesProfile {
  return (HALO_SALES_PROFILES as ReadonlyArray<string>).includes(profile)
}

export const CATALOG_295_SOURCE =
  'docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json (in-worktree; 295 conditions SW-001..SW-295; sha256 29c7ac06…)'

export type SupportState = 'supported' | 'supported-but-no-current-data' | 'withheld'
export type MetricUnit = 'ratio_0_1' | 'currency_usd' | 'count'

export type SlugSupport = {
  slug: string
  definition: string
  unit: MetricUnit
  grain: string
  sourceFamily: string
  sourceFields: ReadonlyArray<string>
  periodRule: string
  /** Anchor into the governed 295-condition catalog; 'none — …' when no exact one exists. */
  catalog295Anchor: string
  state: SupportState
  /** Exact reason when state !== 'supported'; null when supported. */
  withheldReason: string | null
}

const NATIVE_PERIOD = 'newest accepted, non-superseded delivery (period_start..period_end)'
const HUB_PERIOD = 'trailing window_days over the messaging hub'
const APPT_GRAIN = 'store × governed appointment-report period'
const DP_GRAIN = 'store × governed dealership-performance period'
// gross.total_sum is source-neutral (CRM Sales Gross precedence; Dashboard TOTAL fallback).
const SALES_GROSS_GRAIN = 'store × governed Sales-report period (CRM Sales Gross precedence; Dealership Dashboard TOTAL fallback)'
// gross.reconciliation_mismatches is CRM per-deal ONLY (Dashboard never emits it).
const CRM_GROSS_GRAIN = 'store × governed CRM Sales Gross period (per-deal rows only)'
const HUB_GRAIN = 'store × trailing window'

export const WITHHELD = {
  ROI_DIVERGENCE:
    'Dashboard vs Lead Source ROI definitions diverge for the same period (e.g. Honda 89 leads/8 sold vs ROI 110/5); needs a governed Lead Source ROI native reader.',
  ROI_DEDUP: 'needs Lead Source ROI dedup fields (no governed reader yet).',
  CAGE: 'needs a governed Enterprise Performance / CAGE native reader (report not ingested here).',
  COMM: 'needs a governed Vin Sales Communication Log reader — prior Honda exploration lacks stable IDs and is not a 3-store daily feed.',
  HUB_NO_DATA: 'hub reader exists but the three isolated stores hold no conversation data (0 threads) → no current value.',
} as const

/** One appointment rate: a SINGLE numerator flag over the appointment row count. */
const appt = (slug: string, flag: string, anchor: string): SlugSupport => ({
  slug,
  definition: `Appointments with ${flag}=Yes ÷ total appointment rows in the accepted report.`,
  unit: 'ratio_0_1',
  grain: APPT_GRAIN,
  sourceFamily: 'appointments (native)',
  sourceFields: [`${flag} (=Yes) — numerator`, 'appointment row count — denominator'],
  periodRule: NATIVE_PERIOD,
  catalog295Anchor: anchor,
  state: 'supported',
  withheldReason: null,
})

const hub = (slug: string, def: string, unit: MetricUnit, anchor: string): SlugSupport => ({
  slug,
  definition: def,
  unit,
  grain: HUB_GRAIN,
  sourceFamily: 'messaging-hub (native)',
  sourceFields: ['threads', 'messages'],
  periodRule: HUB_PERIOD,
  catalog295Anchor: anchor,
  state: 'supported-but-no-current-data',
  withheldReason: WITHHELD.HUB_NO_DATA,
})

const withheld = (
  slug: string,
  def: string,
  unit: MetricUnit,
  family: string,
  reason: string,
  anchor: string,
): SlugSupport => ({
  slug,
  definition: def,
  unit,
  grain: 'store × governed period',
  sourceFamily: family,
  sourceFields: [],
  periodRule: NATIVE_PERIOD,
  catalog295Anchor: anchor,
  state: 'withheld',
  withheldReason: reason,
})

const ENTRIES: ReadonlyArray<SlugSupport> = [
  // ── Supported native (exactly 7 — NATIVE7) ───────────────────────────────
  {
    slug: 'gross.total_sum',
    definition:
      'Total gross for the period. Current precedence source is per-deal CRM Sales Gross (accepted native); the Dealership Summary TOTAL (Front + Back Gross) reconciles to it and is the fallback.',
    unit: 'currency_usd',
    grain: SALES_GROSS_GRAIN,
    sourceFamily: 'crm_sales_gross (native — precedence) / dealership_performance (native — reconciling fallback)',
    sourceFields: ['CRM Sales Gross per-deal Total Gross (precedence)', 'Dealership Summary Front Gross + Back Gross (fallback)'],
    periodRule: NATIVE_PERIOD,
    catalog295Anchor: 'SW-049 (trend primitive; composites SW-004/SW-112)',
    state: 'supported',
    withheldReason: null,
  },
  {
    slug: 'gross.reconciliation_mismatches',
    definition: 'Count of accepted CRM Sales Gross per-deal rows where abs((Front Gross + Back Gross) − Total Gross) > $0.50 (the reader\'s exact dollar tolerance).',
    unit: 'count',
    grain: CRM_GROSS_GRAIN,
    sourceFamily: 'crm_sales_gross (native — accepted per-deal)',
    sourceFields: ['Front Gross', 'Back Gross', 'Total Gross (per-deal)'],
    periodRule: NATIVE_PERIOD,
    catalog295Anchor: 'none — primitive / no direct anchor',
    state: 'supported',
    withheldReason: null,
  },
  {
    slug: 'dashboard.response_time_actual_avg_min',
    definition: 'Dashboard "Avg Actual (Min)" value (minutes) parsed from the accepted Dealership Performance Response Time section (NOT a first-response-time metric).',
    unit: 'count',
    grain: DP_GRAIN,
    sourceFamily: 'dealership_performance (native — accepted; Response Time section)',
    sourceFields: ['Avg Actual (Min)'],
    periodRule: NATIVE_PERIOD,
    catalog295Anchor: 'SW-024/SW-026 (speed-to-lead primitives; not an exact accepted SW condition)',
    state: 'supported',
    withheldReason: null,
  },
  appt('appt.show_rate', 'Is Show', 'SW-032 (composite SW-113/SW-114)'),
  appt('appt.no_show_rate', 'Is No Show', 'SW-041'),
  appt('appt.confirmed_rate', 'Is Confirmed', 'SW-042'),
  appt('appt.cancel_rate', 'Is Cancelled', 'none — primitive / no direct supplied condition'),

  // ── Pre-existing hub (3) — supported reader, no current data in isolated stores ──
  hub('engagement.reply_rate', 'Replied contacts ÷ touched contacts in the window.', 'ratio_0_1', 'related: SW-138/SW-140/SW-234 (no exact direct anchor)'),
  hub('engagement.conversations', 'Distinct contacts with ≥1 real inbound reply.', 'count', 'none — no exact direct anchor'),
  hub('engagement.resurrections', 'Contacts silent after first touch who replied after the 24h follow-up.', 'count', 'none — no exact direct anchor'),

  // ── Withheld pending their exact report readers (10) ──────────────────────
  withheld('roi.total_leads', 'Total leads across lead sources in the period.', 'count', 'Lead Source ROI (native — absent)', WITHHELD.ROI_DIVERGENCE, 'SW-001 (source-volume trend primitive)'),
  withheld('roi.sold_from_leads', 'Leads that reached sold in the period.', 'count', 'Lead Source ROI (native — absent)', WITHHELD.ROI_DIVERGENCE, 'SW-006 (source close-rate primitive)'),
  withheld('roi.duplicate_rate', 'Share of leads flagged as duplicates.', 'ratio_0_1', 'Lead Source ROI (native — absent)', WITHHELD.ROI_DEDUP, 'SW-002'),
  // gross.reconciliation_mismatches and dashboard.response_time_actual_avg_min are SUPPORTED (above) —
  // resolved from accepted strict families and surfaced by the runtime (M2R R1 correction 2).
  withheld('cage.total_comms', 'Total rep communications in the period.', 'count', 'Enterprise Performance / CAGE (native — absent)', WITHHELD.CAGE, 'SW-019/SW-022 (activity primitives)'),
  withheld('cage.deals_from_leads', 'Deals attributed to leads (rep-reported).', 'count', 'Enterprise Performance / CAGE (native — absent)', WITHHELD.CAGE, 'SW-033/SW-035 (funnel inputs)'),
  withheld('cage.rep_count', 'Distinct reps active in the period.', 'count', 'Enterprise Performance / CAGE (native — absent)', WITHHELD.CAGE, 'none — no exact direct anchor'),
  withheld('comm.escalation_keyword_screen', 'Messages containing escalation keywords.', 'count', 'Vin Sales Communication Log (native — absent)', WITHHELD.COMM, 'SW-073/SW-074 (also SW-131/SW-290)'),
  withheld('comm.template_overuse', 'Message bodies reused five or more times.', 'count', 'Vin Sales Communication Log (native — absent)', WITHHELD.COMM, 'SW-021 (also SW-142/SW-289)'),
  withheld('comm.inbound_high_intent_keywords', 'Inbound messages with high-intent language.', 'count', 'Vin Sales Communication Log (native — absent)', WITHHELD.COMM, 'SW-077/SW-141/SW-214'),
  withheld('comm.multi_rep_within_24h', 'Customers contacted by two or more reps within 24h.', 'count', 'Vin Sales Communication Log (native — absent)', WITHHELD.COMM, 'SW-197 (closest supplied condition — not exact)'),
]

export const HALO_SUPPORT_MANIFEST: Readonly<Record<string, SlugSupport>> = Object.freeze(
  Object.fromEntries(ENTRIES.map((e) => [e.slug, e])),
)

export function getSlugSupport(slug: string): SlugSupport | undefined {
  return HALO_SUPPORT_MANIFEST[slug]
}

/** The full manifest as an array, in catalog order. */
export function listSlugSupport(): ReadonlyArray<SlugSupport> {
  return METRIC_CATALOG.map((m) => HALO_SUPPORT_MANIFEST[m.id]).filter(Boolean) as SlugSupport[]
}
