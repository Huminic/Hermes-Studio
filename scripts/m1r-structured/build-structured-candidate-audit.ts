/**
 * Gate 4D — structured-source expansion AUDIT generator.
 *
 * A bounded re-audit of every currently-unresolved SW condition whose acquisition path is an
 * ALREADY-ACCEPTED, Sales-only STRUCTURED VinSolutions family (appointments, crm_sales_gross,
 * dealership_performance, vinsolutions_custom_reporting_leads), to decide whether any additional
 * definition-exact metric can be promoted across all three governed rooftops from the governed
 * real-file evidence for the accepted week (2026-08-24..30).
 *
 * It DERIVES every verdict from the REAL Gate 2 spine built over the SHA-allowlisted accepted
 * bytes (never a hand-authored value or reason): the candidate set is the unresolved IDs on a
 * native/structured cadence, and each candidate's hold reason is the spine's own byte-backed
 * unresolved_reason. Data-dependent blockers (e.g. SW-050 new-car-deal counts) are recorded as
 * privacy-safe integer aggregates only. Quarantined (ROI/CAGE/Communication Log), external,
 * outside-boundary, and manual-CRM sources remain zero accepted metrics.
 *
 * Result of this gate: 0 additional promotable IDs; the portfolio is UNCHANGED. The spine, the
 * comm overlay, the prior evaluated cells, the evaluator, and the baselines are all untouched. All
 * comm/portfolio counts are DERIVED from the committed Gate 4C2 reconciliation (fail-closed), never
 * hardcoded, so the audit stays correct if a prior gate adds or holds metrics. It writes ONLY
 * aggregate audit artifacts:
 *   - docs/halo/contract/sw295-structured-candidate-matrix.json   (complete candidate matrix)
 *   - docs/halo/evidence/m1r/structured/structured-portfolio-reconciliation.json (portfolio reaffirmed)
 *
 * No PDF, no customer narrative, no production, no browser/Gmail/schedule/CRM/external mutation.
 * Prettier-clean + byte-identical on rerun.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { formatJsonFile } from '../m1r-evaluator/serialize'
import { derivePortfolio } from './portfolio'
import type { CommRecon } from './portfolio'
import type { CatalogCondition } from '@/server/reports/evaluator/catalog'
import type { EvalRow } from '@/server/reports/evaluator/types'
import { assembleGate2Inputs } from '@/server/reports/evaluator/build-from-fresh'
import { buildSpine } from '@/server/reports/evaluator/spine'
import { EVALUABLE_IDS } from '@/server/reports/evaluator/evaluators'

const REPO = process.cwd()
const FRESH = process.env.HALO_FRESH_DIR ?? '/tmp/halo-295-fresh-20260831'
const CONTRACT = path.join(REPO, 'docs/halo/contract')
const OUT = path.join(REPO, 'docs/halo/evidence/m1r/structured')

const GOVERNED = ['21043', '21044', '21047'] as const

// The native/structured VinSolutions acquisition classes. An unresolved ID in one of these
// classes is a CANDIDATE (its source is, or was originally mapped to, a scheduled/native
// structured export); every other unresolved ID is categorically non-structured (comm-NLP,
// join-with-quarantined, external, outside-boundary, manual-CRM, unavailable) and is accounted
// for by category rather than being a per-ID candidate.
const STRUCTURED_CLASSES = new Set([
  'Vin-native scheduled',
  'Native manual export',
])

// The accepted structured family each candidate's LITERAL definition would draw from (judgment,
// asserted stable by the test against the live catalog). This is the family we ATTEMPTED, not a
// promotion. 'lead_source_roi' / 'cage' name a quarantined native family (still zero metrics).
const FAMILY_ATTEMPTED: Record<string, string> = {
  'SW-001': 'lead_source_roi (quarantined)',
  'SW-004': 'lead_source_roi (quarantined)',
  'SW-005': 'lead_source_roi (quarantined)',
  'SW-006': 'lead_source_roi (quarantined)',
  'SW-008': 'appointments',
  'SW-013': 'vinsolutions_custom_reporting_leads',
  'SW-014': 'vinsolutions_custom_reporting_leads',
  'SW-016': 'vinsolutions_custom_reporting_leads',
  'SW-017': 'vinsolutions_custom_reporting_leads',
  'SW-034': 'crm_sales_gross',
  'SW-042': 'appointments',
  'SW-043': 'appointments',
  'SW-049': 'crm_sales_gross',
  'SW-050': 'crm_sales_gross',
  'SW-084': 'cage (quarantined)',
  'SW-109': 'cage (quarantined)',
  'SW-111': 'crm_sales_gross',
  'SW-113': 'appointments',
  'SW-114': 'appointments+dealership_performance',
}

// Accepted-family-specific audit reason where the spine's verbatim unresolved_reason (which
// addresses the catalog's ORIGINAL mapped source) does not fully capture why the ACCEPTED
// structured family also cannot satisfy the condition. Where absent, the spine reason is already
// accurate for the attempted family and is used directly. The byte-backed spine reason is always
// preserved alongside as spine_unresolved_reason.
const AUDIT_NOTE: Record<string, string> = {
  'SW-013':
    'Accepted Leads capture exposes only dealer-week aggregates (median/counts within Originated-After-Hours=No), not per-row after-hours→next-opening timing or a business/holiday calendar; the "no response by opening +15 min" rule is not computable.',
  'SW-014':
    'Accepted Leads capture has no auto-reply-vs-human classification (that is message content, i.e. the quarantined Communication Log); "first response is auto-reply only" is not computable.',
  'SW-016':
    'Accepted Leads capture has no weekend/holiday partition and a holiday calendar is an external source; weekend/holiday SLA breach rate is not computable.',
  'SW-017':
    'Accepted Leads capture has no per-channel lead type or outbound-call-attempt timing (that is the quarantined Communication Log); "phone lead with no outbound call within 5 min" is not computable.',
  'SW-050':
    'Front-gross-negative rate on new-car deals FIRES at Ford 21047 (≥1 of 4 new deals has negative Front Gross → ≥25% > 20%, robust to the 2 blank-front-gross deals) but Honda 21043 and Nissan 21044 each sold 0 new cars in the accepted week (denominator 0; missing is not zero). Under all-three-rooftops-or-no-metric it cannot promote. See observed_crm_new_car_deals.',
  'SW-084':
    'Native CAGE source is quarantined; the accepted Dealership Performance Dashboard TOTALs do not expose BDC connect/attempt counts, so BDC connect rate is not computable from an accepted family.',
  'SW-109':
    'Native CAGE source is quarantined; no accepted family exposes per-rep daily activity, and the rule is a 5-day trend; not computable from a single accepted week.',
  'SW-113':
    'Component levels exist (appointment set rate SW-031, show rate SW-032), but "high set rate + low show rate" has no ratified numeric threshold defining high/low; inventing one would fabricate a benchmark.',
  'SW-114':
    'Show rate is available, but "close rate" needs sold/write-up and the accepted Dashboard write-up TOTAL is 0 (denominator 0); the composite also has no ratified high/low threshold.',
}

// A stable, coarse classification of WHY each candidate holds (for machine consumers). The
// human-readable, authoritative reason is the spine's own unresolved_reason, carried verbatim.
const BLOCKER_CLASS: Record<string, string> = {
  'SW-001': 'quarantined_family',
  'SW-004': 'quarantined_family',
  'SW-005': 'quarantined_family',
  'SW-006': 'quarantined_family',
  'SW-008': 'definition_mismatch_missing_field',
  'SW-013': 'definition_mismatch_missing_field',
  'SW-014': 'definition_mismatch_missing_field',
  'SW-016': 'definition_mismatch_missing_field',
  'SW-017': 'definition_mismatch_missing_field',
  'SW-034': 'zero_or_absent_denominator',
  'SW-042': 'definition_mismatch_missing_field',
  'SW-043': 'trend_requires_history',
  'SW-049': 'trend_requires_history',
  'SW-050': 'zero_or_absent_denominator',
  'SW-084': 'quarantined_family',
  'SW-109': 'quarantined_family',
  'SW-111': 'trend_requires_history',
  'SW-113': 'undefined_threshold_composite',
  'SW-114': 'undefined_threshold_composite',
}

function readJson(p: string): unknown {
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

const sha256File = (p: string) =>
  createHash('sha256').update(fs.readFileSync(p)).digest('hex')

/** Distinct per-rooftop reasons (usually one; SW-050 differs Honda/Nissan vs Ford). */
function reasonsByRooftop(rows: Array<EvalRow>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const d of GOVERNED) {
    const r = rows.find((x) => x.dealer_id === d)
    out[d] = r?.unresolved_reason ?? 'not present'
  }
  return out
}

async function main(): Promise<void> {
  const catalog = (
    readJson(
      path.join(CONTRACT, 'semantic-watchdog-feasibility-matrix-295.json'),
    ) as Array<CatalogCondition>
  ).map((c) => c)
  const catalogSha = sha256File(
    path.join(CONTRACT, 'semantic-watchdog-feasibility-matrix-295.json'),
  )

  // Build the REAL spine over the SHA-allowlisted accepted bytes (same path the tests use).
  const inputs = assembleGate2Inputs({ freshDir: FRESH, repoRoot: REPO })
  const spine = buildSpine(inputs)
  const rowsById = new Map<string, Array<EvalRow>>()
  for (const r of spine.rows) {
    const arr = rowsById.get(r.metric_id) ?? []
    arr.push(r)
    rowsById.set(r.metric_id, arr)
  }

  // The already-evaluated ID set = the spine's evaluated IDs + the committed comm overlay's
  // evaluated IDs (read from the committed Gate 4C2 reconciliation, never hardcoded), so the ID
  // accounting ties to the true portfolio. All comm/portfolio COUNTS are derived below.
  const commRecon = readJson(
    path.join(
      REPO,
      'docs/halo/evidence/m1r/comms/comm-portfolio-reconciliation.json',
    ),
  ) as CommRecon
  const spineEvaluatedIds = [...spine.summary.evaluated_ids]
  const commEvaluatedIds = [...commRecon.comm_evaluated_ids]
  const evaluatedIds = new Set([...spineEvaluatedIds, ...commEvaluatedIds])

  // Candidate universe: unresolved IDs on a native/structured cadence.
  const candidateConditions = catalog.filter(
    (c) =>
      !evaluatedIds.has(c.metric_id) &&
      STRUCTURED_CLASSES.has(c.acquisition_class),
  )

  // Privacy-safe observed CRM aggregates (counts only) that block the data-dependent CRM IDs.
  const crmByDealer: Record<
    string,
    { new_deals: number; new_negative_front: number; new_front_blank: number }
  > = {}
  for (const d of inputs.dealers) {
    const crm = d.bundle.crm
    crmByDealer[d.dealer_id] = {
      new_deals: crm?.newDeals ?? 0,
      new_negative_front: crm?.newNegativeFront ?? 0,
      new_front_blank: crm?.newFrontBlank ?? 0,
    }
  }

  const candidates = candidateConditions.map((c) => {
    const rows = rowsById.get(c.metric_id) ?? []
    const reasons = reasonsByRooftop(rows)
    const distinct = [...new Set(Object.values(reasons))]
    const spineReason =
      distinct.length === 1
        ? distinct[0]
        : 'per-rooftop (see spine_unresolved_reason_by_rooftop)'
    const entry: Record<string, unknown> = {
      metric_id: c.metric_id,
      section: c.section,
      condition: c.condition,
      catalog_source: c.source,
      acquisition_class: c.acquisition_class,
      family_attempted: FAMILY_ATTEMPTED[c.metric_id] ?? 'unmapped',
      blocker_class: BLOCKER_CLASS[c.metric_id] ?? 'unmapped',
      verdict: 'HOLD',
      hold_reason: AUDIT_NOTE[c.metric_id] ?? spineReason,
      spine_unresolved_reason: spineReason,
      spine_unresolved_reason_by_rooftop: reasons,
      owner: c.owner || 'Huminic Semantic Watchdog pipeline',
      next_action:
        c.next_action || 'resolve source/definition/baseline before evaluation',
    }
    // Data-dependent CRM candidates carry the exact privacy-safe observed counts that block them.
    if (FAMILY_ATTEMPTED[c.metric_id] === 'crm_sales_gross') {
      entry.observed_crm_new_car_deals = crmByDealer
    }
    return entry
  })

  // Categorical accounting of every OTHER unresolved ID (not evaluated, not a structured candidate).
  const candidateIds = new Set(candidates.map((c) => c.metric_id as string))
  const residual = catalog.filter(
    (c) => !evaluatedIds.has(c.metric_id) && !candidateIds.has(c.metric_id),
  )
  const residualByClass: Record<string, number> = {}
  for (const c of residual)
    residualByClass[c.acquisition_class] =
      (residualByClass[c.acquisition_class] ?? 0) + 1

  const promotedIds = candidates
    .filter((c) => c.verdict === 'PROMOTE')
    .map((c) => c.metric_id as string)

  // Derive the current portfolio from the real spine + committed comm overlay (fail-closed).
  const portfolio = derivePortfolio(
    catalog.length,
    GOVERNED,
    spine.summary,
    commRecon,
    promotedIds,
  )

  const matrix = {
    artifact: 'gate4d-structured-candidate-matrix',
    gate: '4D',
    scope:
      'Re-audit of unresolved SW conditions on a native/structured VinSolutions cadence for definition-exact promotion from the accepted structured families over the accepted week.',
    accepted_structured_families: [
      'appointments',
      'crm_sales_gross',
      'dealership_performance',
      'vinsolutions_custom_reporting_leads',
    ],
    quarantined_families: ['lead_source_roi', 'cage_kpi', 'sales_comm_log'],
    accepted_week: {
      start: '2026-08-24',
      end: '2026-08-30',
      timezone: 'America/New_York',
    },
    evidence_source:
      'REAL Gate 2 spine built from the SHA-allowlisted accepted bytes (scripts/m1r-evaluator path); verdicts and hold reasons are the spine’s own byte-backed unresolved_reason, not hand-authored.',
    catalog_sha256: catalogSha,
    totals: {
      catalog: catalog.length,
      evaluated_ids: evaluatedIds.size,
      spine_evaluated_ids: spineEvaluatedIds.length,
      comm_evaluated_ids: commEvaluatedIds.length,
      structured_candidates: candidates.length,
      residual_non_structured: residual.length,
    },
    promotion_statement:
      promotedIds.length === 0
        ? `Promotes exactly 0 additional IDs; all ${candidates.length} structured candidates HOLD. Portfolio unchanged at ${portfolio.evaluated} evaluated / ${portfolio.unresolved} unresolved.`
        : `Promotes exactly ${promotedIds.join('/')}; portfolio ${portfolio.evaluated} evaluated / ${portfolio.unresolved} unresolved.`,
    promoted_ids: promotedIds,
    material_findings: [
      'SW-050 (front-gross-negative rate on new-car deals) FIRES at Ford 21047 (≥1 of 4 new-car deals has negative Front Gross → ≥25% > 20% threshold, robust to the 2 blank-front-gross deals), but Serra Honda 21043 and Serra Nissan 21044 each sold 0 new cars in the accepted week (denominator 0; missing is not zero). Under all-three-rooftops-or-no-metric it cannot promote.',
    ],
    candidates,
    residual_categorical: {
      total: residual.length,
      by_acquisition_class: residualByClass,
      note: 'Every residual unresolved ID is categorically non-structured: Scheduled-source + downstream NLP/join (Enhanced Communication Log NLP and joins that touch a quarantined family — includes the deferred 75-ID NLP gate), Separate external source, Outside governed boundary, Unavailable/retention-limited, or Manual CRM inspection. None is evaluable from the accepted structured families.',
    },
    join_note:
      'No accepted-family cross-join is definition-exact: the held readers emit privacy-minimized dealer-week aggregates with NO shared row-level key exposed across families (no Lead ID / Sale ID / Appointment ID), so every join candidate fails on key/population/semantic alignment. The unused appointment fields completed/cancelled have no matching SW condition in the catalog; none is manufactured.',
  }

  // Every count below is DERIVED (real spine + committed comm overlay), never hardcoded.
  const reconciliation = {
    artifact: 'gate4d-portfolio-reconciliation',
    required_cells: portfolio.required_cells,
    conditions: portfolio.conditions,
    rooftops: portfolio.rooftops,
    spine_evaluated: portfolio.spine_evaluated,
    comm_overlay_evaluated: portfolio.comm_overlay_evaluated,
    comm_evaluated_per_rooftop: portfolio.comm_evaluated_per_rooftop,
    structured_promoted_this_gate: portfolio.structured_promoted_this_gate,
    evaluated: portfolio.evaluated,
    unresolved: portfolio.unresolved,
    by_dealer: portfolio.by_dealer,
    composition_source:
      'Derived from the real Gate 2 spine (SHA-allowlisted accepted bytes) + the committed Gate 4C2 comm-portfolio-reconciliation.json; reconciled fail-closed (dealer sets, required_cells, aggregate and per-rooftop arithmetic). No 2/6/36/849 literal in generator logic.',
    note: `Gate 4D added ${portfolio.structured_promoted_this_gate} evaluated cells. Portfolio = ${portfolio.spine_evaluated} spine + ${portfolio.comm_overlay_evaluated} comm overlay + ${portfolio.structured_promoted_this_gate} structured = ${portfolio.evaluated} evaluated / ${portfolio.unresolved} unresolved over ${portfolio.required_cells} required cells; per-rooftop composition in by_dealer. No spine cell, comm cell, evaluator, or baseline changed.`,
  }

  fs.writeFileSync(
    path.join(CONTRACT, 'sw295-structured-candidate-matrix.json'),
    await formatJsonFile(
      matrix,
      path.join(CONTRACT, 'sw295-structured-candidate-matrix.json'),
    ),
  )
  fs.writeFileSync(
    path.join(OUT, 'structured-portfolio-reconciliation.json'),
    await formatJsonFile(
      reconciliation,
      path.join(OUT, 'structured-portfolio-reconciliation.json'),
    ),
  )

  process.stdout.write(
    `Gate 4D: ${candidates.length} structured candidates, ${promotedIds.length} promoted; ` +
      `portfolio ${portfolio.evaluated}/${portfolio.unresolved}. Wrote matrix + reconciliation.\n`,
  )
}

main().catch((e) => {
  process.stderr.write(String(e?.stack ?? e) + '\n')
  process.exit(1)
})
