/**
 * Gate 4G — FINAL residual audit generator.
 *
 * Audits the LAST 122 catalog IDs = canonical 295 − evaluated 17 − Gate 4E content-HOLD 70 −
 * Gate 4F scheduled-HOLD 86. None is `definition_compatible_now` under the Contract-2 boundary, so
 * the gate PROMOTES 0 and HOLDS 122. After this gate ZERO of the 295 IDs remain unaudited; the prior
 * 51 evaluated cells and all Gate 4E/4F payload bytes are preserved byte-for-byte.
 *
 * Writes ONLY aggregate, non-PII artifacts (no raw CSV / message content / identifiers are read or
 * written — nothing is promotable, so no restricted capture is opened):
 *   - docs/halo/contract/sw295-gate4g-final-residual-matrix.json          (122-row matrix)
 *   - docs/halo/evidence/m1r/residual/gate4g-acquisition-action-ledger.json (per-class action lanes)
 *   - docs/halo/evidence/m1r/residual/gate4g-portfolio-reconciliation.json  (295-ID/885-cell, 0 unaudited)
 *
 * All counts are DERIVED from committed artifacts and fail closed on any arithmetic / partition /
 * schema / hash divergence. Byte-identical on rerun.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { formatJsonFile } from '../m1r-evaluator/serialize'
import type {
  CatalogRow,
  DeltaRow,
  Gate4gBoundaryLane,
} from '@/server/reports/residual/gate4g-final-residual'
import {
  DEFINITION_COMPATIBLE,
  FROZEN_E1_SPEC_KEYS,
  GATE4G_ACCEPTED_WEEK,
  GATE4G_ACQUISITION_CLASSES,
  GATE4G_BOUNDARY_LANES,
  OUTSIDE_BOUNDARY_CLASS,
  buildFinalPartition,
  buildHoldRow,
  classifyBoundaryLane,
  deriveFinalResidualIds,
  disposition,
  sortedNewlinePreimage,
  swIndex,
} from '@/server/reports/residual/gate4g-final-residual'

const REPO = process.cwd()
const CONTRACT = path.join(REPO, 'docs/halo/contract')
const OUT = path.join(REPO, 'docs/halo/evidence/m1r/residual')
const CATALOG = path.join(
  CONTRACT,
  'semantic-watchdog-feasibility-matrix-295.json',
)
const CAP_DELTA = path.join(CONTRACT, 'sw295-comm-capability-delta.json')
const STRUCTURED_MATRIX = path.join(
  CONTRACT,
  'sw295-structured-candidate-matrix.json',
)
const GATE4F_MATRIX = path.join(
  CONTRACT,
  'sw295-gate4f-scheduled-residual-matrix.json',
)
const CONTENT_RECON = path.join(
  REPO,
  'docs/halo/evidence/m1r/comms/comm-content-portfolio-reconciliation.json',
)
const SPINE_SUMMARY = path.join(
  REPO,
  'docs/halo/evidence/m1r/evaluator/spine-summary.json',
)
const COMM_LEDGER = path.join(
  REPO,
  'docs/halo/evidence/m1r/comms/comm-evaluation-ledger.json',
)

const GOVERNED = ['21043', '21044', '21047'] as const
const CONDITIONS = 295
const ROOFTOPS = GOVERNED.length
const REQUIRED_CELLS = CONDITIONS * ROOFTOPS

// The operator-supplied invariant (Directive 1): sorted-newline SHA-256 of the final 122 IDs.
const EXPECTED_122_SHA256 =
  'a2b1971aec053b50e4dc010829c81533ffba9e8ddcb9543dd00d03d05ab321e3'

// Directive 2 acquisition counts and the ResponseTimes manual-export IDs (Directive 3).
const EXPECTED_ACQUISITION_COUNTS: Record<string, number> = {
  'Vin-native scheduled': 15,
  'Native manual export': 3,
  'Manual CRM inspection': 6,
  'Separate external source required': 55,
  'Unavailable or retention-limited': 8,
  'Outside governed boundary': 35,
}
const RESPONSE_TIMES_SOURCE =
  'Dealer Dashboard Response Times Opportunities CSV'

// R1: the shadow-identified defect ID whose observed zero eligible-new-car denominator MUST be
// preserved (held UNRESOLVED, never value=0). Numbers below are DERIVED from the committed
// structured-candidate matrix and asserted fail-closed — nothing is hardcoded/fabricated.
const OBSERVED_DENOMINATOR_ID = 'SW-050'

function must(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Gate 4G reconciliation failed: ${msg}`)
}

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T
}

async function main(): Promise<void> {
  // ── Committed inputs (no restricted / PII data; nothing is promotable) ──
  const catalogRaw = readJson<Array<Record<string, unknown>>>(CATALOG)
  must(Array.isArray(catalogRaw), 'feasibility matrix is not an array')
  const catalog: Array<CatalogRow> = catalogRaw.map((r) => ({
    metric_id: String(r.metric_id),
    section: String(r.section ?? ''),
    subsection: String(r.subsection ?? ''),
    condition: String(r.condition ?? ''),
    acquisition_class: String(r.acquisition_class ?? ''),
    source: String(r.source ?? ''),
    period_grain_population: String(r.period_grain_population ?? ''),
    owner: String(r.owner ?? ''),
    next_action: String(r.next_action ?? ''),
  }))
  must(catalog.length === CONDITIONS, `catalog is ${catalog.length}, not 295`)
  const catalogById = new Map(catalog.map((r) => [r.metric_id, r]))
  const allIdsOrdered = catalog.map((r) => r.metric_id)
  const allIds = new Set(allIdsOrdered)
  must(allIds.size === CONDITIONS, 'catalog IDs not 295 unique')

  const delta = readJson<{ rows: Array<Record<string, unknown>> }>(CAP_DELTA)
  const deltaById = new Map<string, DeltaRow>(
    delta.rows.map((r) => [
      String(r.metric_id),
      {
        metric_id: String(r.metric_id),
        category: String(r.category ?? ''),
        rationale: String(r.rationale ?? ''),
        missing_inputs: String(r.missing_inputs ?? ''),
        join_or_nlp_required: String(r.join_or_nlp_required ?? ''),
        minimum_history: String(r.minimum_history ?? ''),
        requires_ratified_threshold: Boolean(r.requires_ratified_threshold),
      },
    ]),
  )
  must(
    deltaById.size === CONDITIONS,
    `capability delta is ${deltaById.size}, not 295`,
  )

  // ── Prior dispositioned sets (must reconcile with Gate 4E/4F exactly) ──
  const spine = readJson<{ evaluated_ids: Array<string> }>(SPINE_SUMMARY)
  const comm = readJson<{ evaluated_ids: Array<string> }>(COMM_LEDGER)
  const contentRecon = readJson<{
    required_cells: number
    evaluated: number
    unresolved: number
    content_promoted_ids: Array<string>
    by_dealer: Record<string, { evaluated: number; unresolved: number }>
  }>(CONTENT_RECON)
  must(spine.evaluated_ids.length === 10, 'spine evaluated ids != 10')
  must(comm.evaluated_ids.length === 2, 'comm evaluated ids != 2')
  must(
    contentRecon.content_promoted_ids.length === 5,
    'content promoted ids != 5',
  )
  const priorEvaluated = new Set([
    ...spine.evaluated_ids,
    ...comm.evaluated_ids,
    ...contentRecon.content_promoted_ids,
  ])
  must(
    priorEvaluated.size === 17,
    `prior evaluated ${priorEvaluated.size} != 17`,
  )

  // Full 75-ID content candidate set → 70 held (candidates minus the 5 promoted).
  const contentCandidates = new Set(
    delta.rows
      .filter((r) => String(r.category) === 'nlp_content_capable_pending')
      .map((r) => String(r.metric_id)),
  )
  must(
    contentCandidates.size === 75,
    `content candidates ${contentCandidates.size} != 75`,
  )
  const contentHold = new Set(
    [...contentCandidates].filter((id) => !priorEvaluated.has(id)),
  )
  must(contentHold.size === 70, `content HOLD ${contentHold.size} != 70`)

  // Gate 4F held 86 (read from the committed Gate 4F matrix, not recomputed).
  const gate4f = readJson<{
    held_ids: Array<string>
    totals: { held: number }
  }>(GATE4F_MATRIX)
  const gate4fHold = new Set(gate4f.held_ids)
  must(gate4fHold.size === 86, `Gate 4F held ${gate4fHold.size} != 86`)
  must(
    gate4f.totals.held === 86,
    `Gate 4F totals.held ${gate4f.totals.held} != 86`,
  )

  // ── Derive the FINAL 122 residual reproducibly ──
  const ids122 = deriveFinalResidualIds(
    allIdsOrdered,
    priorEvaluated,
    contentHold,
    gate4fHold,
  )
  must(ids122.length === 122, `final residual is ${ids122.length}, not 122`)
  must(new Set(ids122).size === 122, 'final residual IDs not unique')

  // ── Directive 1 invariant: sorted-newline SHA-256 of the 122 IDs ──
  const preimage = sortedNewlinePreimage(ids122)
  const sha = createHash('sha256').update(preimage).digest('hex')
  must(
    sha === EXPECTED_122_SHA256,
    `122-ID sorted-newline sha256 ${sha} != ${EXPECTED_122_SHA256}`,
  )
  // Lexicographic and numeric order must coincide for the fixed-width IDs.
  const byIndex = [...ids122].sort((a, b) => swIndex(a) - swIndex(b))
  const byLex = [...ids122].sort()
  must(
    JSON.stringify(byIndex) === JSON.stringify(byLex),
    'numeric and lexicographic ID order diverge',
  )

  // ── Directive 2: acquisition-class counts (15/3/6/55/8/35), all derived from the matrix ──
  const acquisitionTally = new Map<string, number>()
  for (const id of ids122) {
    const cat = catalogById.get(id)
    must(!!cat, `catalog row missing for ${id}`)
    const ac = cat!.acquisition_class
    acquisitionTally.set(ac, (acquisitionTally.get(ac) ?? 0) + 1)
  }
  for (const ac of GATE4G_ACQUISITION_CLASSES)
    must(
      acquisitionTally.get(ac) === EXPECTED_ACQUISITION_COUNTS[ac],
      `acquisition count ${ac} = ${acquisitionTally.get(ac) ?? 0} != ${EXPECTED_ACQUISITION_COUNTS[ac]}`,
    )
  must(
    [...acquisitionTally.keys()].every((k) =>
      (GATE4G_ACQUISITION_CLASSES as ReadonlyArray<string>).includes(k),
    ),
    'unexpected acquisition_class among the 122',
  )
  must(
    [...acquisitionTally.values()].reduce((a, b) => a + b, 0) === 122,
    'acquisition tally != 122',
  )
  // SW-084 was previously audited and held (Directive 2 note): it is in the 122.
  must(ids122.includes('SW-084'), 'SW-084 expected in the final residual')

  // ── Disposition: PROMOTE only if definition_compatible_now; none are → 0 promote / 122 hold ──
  const rows = ids122.map((id) => {
    const cat = catalogById.get(id)
    const d = deltaById.get(id)
    must(!!cat, `catalog row missing for ${id}`)
    must(!!d, `capability-delta row missing for ${id}`)
    return { id, disp: disposition(d!.category), cat: cat!, d: d! }
  })
  const promoted = rows.filter((r) => r.disp === 'PROMOTE')
  const held = rows.filter((r) => r.disp === 'HOLD')
  const definitionCompatible = rows.filter(
    (r) => r.d.category === DEFINITION_COMPATIBLE,
  )
  must(
    promoted.length === definitionCompatible.length,
    `promotions ${promoted.length} != definition-compatible ${definitionCompatible.length}`,
  )
  must(promoted.length === 0, `expected 0 promotions, got ${promoted.length}`)
  must(held.length === 122, `expected 122 holds, got ${held.length}`)

  // ── R1: observed zero eligible-denominator evidence for SW-050 (DERIVED from the committed
  //        structured-candidate matrix; the ratio stays UNRESOLVED, never value=0) ──
  const structured = readJson<{
    candidates: Array<{
      metric_id: string
      blocker_class?: string
      condition?: string
      observed_crm_new_car_deals?: Record<
        string,
        {
          new_deals: number
          new_negative_front: number
          new_front_blank: number
        }
      >
      spine_unresolved_reason_by_rooftop?: Record<string, string>
    }>
  }>(STRUCTURED_MATRIX)
  const sw050 = structured.candidates.find(
    (c) => c.metric_id === OBSERVED_DENOMINATOR_ID,
  )
  must(
    !!sw050,
    `${OBSERVED_DENOMINATOR_ID} missing from structured-candidate matrix`,
  )
  const obs = sw050!.observed_crm_new_car_deals
  must(!!obs, `${OBSERVED_DENOMINATOR_ID} has no observed_crm_new_car_deals`)
  // Fail-closed: the observed eligible new-car denominator is really 0 at 21043 and 21044.
  must(
    obs!['21043'].new_deals === 0 && obs!['21044'].new_deals === 0,
    `${OBSERVED_DENOMINATOR_ID} observed new-car denominator not 0 at 21043/21044`,
  )
  must(
    sw050!.blocker_class === 'zero_or_absent_denominator',
    `${OBSERVED_DENOMINATOR_ID} structured blocker_class != zero_or_absent_denominator`,
  )
  const reasons = sw050!.spine_unresolved_reason_by_rooftop ?? {}
  const observedEvidence = {
    source_ref: 'docs/halo/contract/sw295-structured-candidate-matrix.json',
    structured_blocker_class: sw050!.blocker_class!,
    metric_ratio:
      'negative-front-gross new-car deals ÷ eligible new-car deals (per rooftop, per week)',
    eligible_denominator_observed: Object.fromEntries(
      GOVERNED.map((d) => {
        const o = obs![d]
        const reason = reasons[d] ?? ''
        const status =
          o.new_deals === 0
            ? `observed 0 eligible new-car deals — ratio undefined (0/0); UNRESOLVED, never value=0${reason ? ` (${reason})` : ''}`
            : `${o.new_deals} eligible new-car deals but ${o.new_front_blank} blank Front Gross — denominator integrity fails; UNRESOLVED, missing is never zero${reason ? ` (${reason})` : ''}`
        return [
          d,
          {
            new_deals: o.new_deals,
            new_negative_front: o.new_negative_front,
            new_front_blank: o.new_front_blank,
            denominator_status: status,
          },
        ]
      }),
    ),
    why_unresolved:
      'The condition is a ratio (negative-front new-car deals ÷ eligible new-car deals). Where the eligible denominator is observed 0 (21043, 21044) the ratio is 0/0 = undefined; where it is present but incomplete (21047: 2 of 4 Front Gross blank) its integrity fails. Per the standing rule, missing is never zero — the observed zero/absent denominator holds the metric UNRESOLVED and is NEVER recorded as value 0. Under all-three-rooftops-or-no-metric it cannot promote.',
    unlock:
      'A read-only CRM Sales Gross weekly export whose accepted week yields a non-empty, integrity-complete eligible new-car-deal population (non-blank Front Gross) at ALL THREE rooftops would establish a computable denominator. No external source and no Service/Parts data is required.',
  }

  const matrixRows = rows.map((r) => {
    if (r.disp !== 'HOLD')
      throw new Error(
        `Gate 4G: ${r.id} classified PROMOTE but no evaluated evidence exists — refusing to fabricate`,
      )
    return buildHoldRow(
      r.cat,
      r.d,
      r.id === OBSERVED_DENOMINATOR_ID ? observedEvidence : undefined,
    )
  })

  // R1 guard: SW-050 preserves the observed 0 denominator AND stays unresolved (never value=0).
  const sw050Row = matrixRows.find(
    (r) => r.metric_id === OBSERVED_DENOMINATOR_ID,
  )
  must(!!sw050Row, `${OBSERVED_DENOMINATOR_ID} row missing`)
  must(
    !!sw050Row!.observed_evidence &&
      sw050Row!.observed_evidence.eligible_denominator_observed['21043']
        .new_deals === 0 &&
      sw050Row!.observed_evidence.eligible_denominator_observed['21044']
        .new_deals === 0,
    `${OBSERVED_DENOMINATOR_ID} observed_evidence does not preserve denominator 0`,
  )
  must(
    sw050Row!.frozen_e1_spec.denominator === 'unresolved (held)' &&
      sw050Row!.frozen_e1_spec.numerator === 'unresolved (held)',
    `${OBSERVED_DENOMINATOR_ID} must stay unresolved (never value=0)`,
  )

  // ── Directive 3: outside-boundary sub-lanes (Service | compliance/legal | cross-rooftop | enrichment) ──
  const laneTally = new Map<Gate4gBoundaryLane, number>()
  const outsideIds: Array<string> = []
  for (const row of matrixRows)
    if (row.acquisition_class === OUTSIDE_BOUNDARY_CLASS) {
      outsideIds.push(row.metric_id)
      must(
        row.boundary_lane !== 'not_applicable',
        `${row.metric_id} outside-boundary but unlaned`,
      )
      const lane = row.boundary_lane as Gate4gBoundaryLane
      laneTally.set(lane, (laneTally.get(lane) ?? 0) + 1)
    } else {
      must(
        row.boundary_lane === 'not_applicable',
        `${row.metric_id} laned but not outside-boundary`,
      )
    }
  must(
    outsideIds.length === 35,
    `outside-boundary ids ${outsideIds.length} != 35`,
  )
  // Re-derive the lane split independently (belt-and-suspenders) and assert agreement.
  const laneRecount = new Map<Gate4gBoundaryLane, number>()
  for (const id of outsideIds) {
    const lane = classifyBoundaryLane(catalogById.get(id)!)
    laneRecount.set(lane, (laneRecount.get(lane) ?? 0) + 1)
  }
  for (const lane of GATE4G_BOUNDARY_LANES)
    must(
      (laneTally.get(lane) ?? 0) === (laneRecount.get(lane) ?? 0),
      `lane ${lane} tally mismatch`,
    )
  must(
    [...laneTally.values()].reduce((a, b) => a + b, 0) === 35,
    'boundary lane tally != 35',
  )
  const laneBreakdown = Object.fromEntries(
    GATE4G_BOUNDARY_LANES.map((l) => [l, laneTally.get(l) ?? 0]),
  )

  // ── Schema guard: every row carries the frozen E1 spec with EXACTLY the 14 keys, non-executable ──
  const frozenKeys = JSON.stringify([...FROZEN_E1_SPEC_KEYS].sort())
  for (const row of matrixRows) {
    must(
      JSON.stringify(Object.keys(row.frozen_e1_spec).sort()) === frozenKeys,
      `${row.metric_id} frozen_e1_spec keys != frozen E1 schema`,
    )
    must(
      row.frozen_e1_spec.numerator === 'unresolved (held)' &&
        row.frozen_e1_spec.denominator === 'unresolved (held)' &&
        row.frozen_e1_spec.threshold === 'unresolved (held)',
      `${row.metric_id} HOLD frozen_e1_spec must be non-executable`,
    )
    must(
      row.frozen_e1_spec.missing_data_behavior ===
        'unresolved; missing is never zero',
      `${row.metric_id} missing_data_behavior != standing rule`,
    )
    must(
      row.primary_blocker.length > 0 && row.approval_boundary.length > 0,
      `${row.metric_id} HOLD record incomplete`,
    )
    must(
      row.owner.length > 0 && row.next_safe_action.length > 0,
      `${row.metric_id} owner/next_safe_action empty`,
    )
  }

  // ── Blocker-class tally (committed capability categories, disjoint over the 122) ──
  const blockerTally = new Map<string, number>()
  for (const row of matrixRows)
    blockerTally.set(
      row.blocker_class,
      (blockerTally.get(row.blocker_class) ?? 0) + 1,
    )
  must(
    [...blockerTally.values()].reduce((a, b) => a + b, 0) === 122,
    'blocker tally != 122',
  )

  // ── Disjoint FINAL partition of all 295 IDs → zero unaudited ──
  const partition = buildFinalPartition(
    allIds,
    priorEvaluated,
    contentHold,
    gate4fHold,
    new Set(ids122),
  )
  must(
    partition.evaluated === 17 &&
      partition.gate4e_content_hold === 70 &&
      partition.gate4f_hold === 86 &&
      partition.gate4g_hold === 122 &&
      partition.residual_unaudited === 0,
    `partition ${JSON.stringify(partition)} != 17/70/86/122/0`,
  )
  must(
    partition.evaluated +
      partition.gate4e_content_hold +
      partition.gate4f_hold +
      partition.gate4g_hold +
      partition.residual_unaudited ===
      CONDITIONS,
    'partition does not sum to 295',
  )

  // ── Portfolio cells: prior 51 evaluated preserved EXACTLY; 834 unresolved; 366 newly laned ──
  must(
    contentRecon.required_cells === REQUIRED_CELLS,
    `content reconciliation required_cells ${contentRecon.required_cells} != ${REQUIRED_CELLS}`,
  )
  must(
    contentRecon.evaluated === 51 && contentRecon.unresolved === 834,
    `prior portfolio ${contentRecon.evaluated}/${contentRecon.unresolved} != 51/834`,
  )
  const newEvaluatedCells = promoted.length * ROOFTOPS
  must(
    newEvaluatedCells === 0,
    `Gate 4G introduced ${newEvaluatedCells} evaluated cells`,
  )
  const evaluatedCells = contentRecon.evaluated + newEvaluatedCells
  const gate4gHeldCells = held.length * ROOFTOPS
  must(gate4gHeldCells === 366, `Gate 4G held cells ${gate4gHeldCells} != 366`)
  const unresolvedCells = REQUIRED_CELLS - evaluatedCells
  must(
    evaluatedCells === 51 && unresolvedCells === 834,
    `portfolio ${evaluatedCells}/${unresolvedCells} != 51/834 (prior cells not preserved)`,
  )
  const cellPartition = {
    evaluated: partition.evaluated * ROOFTOPS,
    gate4e_content_hold: partition.gate4e_content_hold * ROOFTOPS,
    gate4f_hold: partition.gate4f_hold * ROOFTOPS,
    gate4g_hold: partition.gate4g_hold * ROOFTOPS,
    residual_unaudited: partition.residual_unaudited * ROOFTOPS,
  }
  must(
    cellPartition.evaluated +
      cellPartition.gate4e_content_hold +
      cellPartition.gate4f_hold +
      cellPartition.gate4g_hold +
      cellPartition.residual_unaudited ===
      REQUIRED_CELLS,
    'cell partition != 885',
  )

  // ── Rows are index-sorted and cover exactly the derived 122 ──
  for (let i = 1; i < matrixRows.length; i++)
    must(
      swIndex(matrixRows[i].metric_id) > swIndex(matrixRows[i - 1].metric_id),
      'matrix rows not strictly index-sorted',
    )

  // ── Directive 3: the 3 ResponseTimes manual exports = next authorized read-only acquisition ──
  const responseTimesIds = ids122.filter(
    (id) => catalogById.get(id)!.source === RESPONSE_TIMES_SOURCE,
  )
  must(
    responseTimesIds.length === 3 &&
      JSON.stringify(responseTimesIds) ===
        JSON.stringify(['SW-013', 'SW-016', 'SW-017']),
    `ResponseTimes manual-export ids ${JSON.stringify(responseTimesIds)} != [SW-013,SW-016,SW-017]`,
  )

  const promotionStatement = `Audited the FINAL ${ids122.length} residual IDs (295 − 17 evaluated − 70 Gate-4E-content-HOLD − 86 Gate-4F-HOLD). PROMOTED ${promoted.length}; HELD ${held.length}. None is definition_compatible_now under the Contract-2 accepted boundary (Sales-only; dealers ${GOVERNED.join('/')}; week ${GATE4G_ACCEPTED_WEEK}); no restricted capture was read. Every one of the 295 IDs is now dispositioned — ZERO unaudited remain. The prior ${contentRecon.evaluated} evaluated cells are preserved unchanged.`

  const acquisitionSummary = GATE4G_ACQUISITION_CLASSES.map((ac) => ({
    acquisition_class: ac,
    count: acquisitionTally.get(ac) ?? 0,
    ids: ids122.filter((id) => catalogById.get(id)!.acquisition_class === ac),
  }))

  const derivation = {
    universe: CONDITIONS,
    evaluated: priorEvaluated.size,
    gate4e_content_hold: contentHold.size,
    gate4f_hold: gate4fHold.size,
    final_residual: ids122.length,
    formula: `${CONDITIONS} − ${priorEvaluated.size} evaluated − ${contentHold.size} Gate-4E-content-HOLD − ${gate4fHold.size} Gate-4F-HOLD = ${ids122.length}`,
    sorted_newline_sha256: sha,
    acquisition_counts: Object.fromEntries(
      GATE4G_ACQUISITION_CLASSES.map((ac) => [
        ac,
        acquisitionTally.get(ac) ?? 0,
      ]),
    ),
    outside_boundary_lane_breakdown: laneBreakdown,
  }

  const matrixDoc = {
    artifact: 'gate4g-final-residual-matrix',
    revision:
      'gate4g-final-residual-disposition-v1 (0 PROMOTE / 122 HOLD; evidence-backed; zero unaudited)',
    accepted_week: GATE4G_ACCEPTED_WEEK,
    governed_rooftops: [...GOVERNED],
    catalog_ref:
      'docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json',
    capability_delta_ref: 'docs/halo/contract/sw295-comm-capability-delta.json',
    derivation,
    frozen_e1_spec_schema: FROZEN_E1_SPEC_KEYS,
    frozen_e1_spec_note:
      'GOVERNING CONTRACT. Every row carries a frozen_e1_spec with EXACTLY these 14 hardcoded keys. All 122 are HOLD: only governed known facts are populated (catalog population, the capability join/NLP requirement + missing item, permanent Sales-only exclusions, and the standing missing-is-never-zero rule); every unknown/condition-specific field — including window and minimum_history — is `unresolved (held)` / `not_applicable (held)`. Non-executable by construction. Reuses the frozen Gate 4E E1 schema + builder.',
    totals: {
      candidates: ids122.length,
      promoted: promoted.length,
      held: held.length,
      rooftop_cells: ids122.length * ROOFTOPS,
      evaluated_cells: newEvaluatedCells,
      held_cells: gate4gHeldCells,
    },
    acquisition_class_tally: Object.fromEntries(
      GATE4G_ACQUISITION_CLASSES.map((ac) => [
        ac,
        acquisitionTally.get(ac) ?? 0,
      ]),
    ),
    outside_boundary_lane_tally: laneBreakdown,
    blocker_class_tally: Object.fromEntries(blockerTally),
    promoted_ids: promoted.map((r) => r.id),
    held_ids: held.map((r) => r.id),
    promotion_statement: promotionStatement,
    rows: matrixRows,
  }
  fs.mkdirSync(CONTRACT, { recursive: true })
  const matrixPath = path.join(
    CONTRACT,
    'sw295-gate4g-final-residual-matrix.json',
  )
  fs.writeFileSync(matrixPath, await formatJsonFile(matrixDoc, matrixPath))

  // ── Acquisition-action ledger (per-class next safe action + approval lane) ──
  const ledger = {
    artifact: 'gate4g-acquisition-action-ledger',
    accepted_week: GATE4G_ACCEPTED_WEEK,
    governed_rooftops: [...GOVERNED],
    promoted: promoted.length,
    held: held.length,
    note: 'Gate 4G evaluated ZERO new cells: none of the final 122 residual IDs is definition_compatible_now under the Contract-2 accepted boundary. No restricted capture was opened (zero PII exposure). Each class routes to a specific read-only next action / approval lane; none is performed in this gate (no external/CRM/browser/schedule action).',
    next_authorized_acquisition: {
      description:
        'The 3 Dealer Dashboard Response Times Opportunities CSV manual exports are recorded as the NEXT authorized read-only acquisition (Directive 3). Not performed in this gate.',
      acquisition_class: 'Native manual export',
      source: RESPONSE_TIMES_SOURCE,
      metric_ids: responseTimesIds,
      mode: 'read-only manual export; compute SLA/business-calendar metrics locally; Sales-only; missing is never zero',
    },
    by_acquisition_class: acquisitionSummary.map((a) => ({
      acquisition_class: a.acquisition_class,
      count: a.count,
      approval_boundary: matrixRows.find(
        (r) => r.acquisition_class === a.acquisition_class,
      )!.approval_boundary,
      metric_ids: a.ids,
    })),
    outside_boundary_lanes: GATE4G_BOUNDARY_LANES.map((lane) => ({
      lane,
      count: laneTally.get(lane) ?? 0,
      metric_ids: matrixRows
        .filter((r) => r.boundary_lane === lane)
        .map((r) => r.metric_id),
    })),
    observed_zero_or_absent_denominator: [
      {
        metric_id: OBSERVED_DENOMINATOR_ID,
        condition: sw050Row!.condition,
        source_ref: observedEvidence.source_ref,
        eligible_denominator_observed:
          observedEvidence.eligible_denominator_observed,
        held_not_zero:
          'value stays UNRESOLVED (never 0): observed zero/absent eligible denominator makes the ratio undefined; missing is never zero',
        unlock: observedEvidence.unlock,
      },
    ],
    blocker_class_tally: Object.fromEntries(blockerTally),
  }
  fs.mkdirSync(OUT, { recursive: true })
  const ledgerPath = path.join(OUT, 'gate4g-acquisition-action-ledger.json')
  fs.writeFileSync(ledgerPath, await formatJsonFile(ledger, ledgerPath))

  // ── Full 885-cell portfolio reconciliation (51/834 preserved; 295 partition; 0 unaudited) ──
  const recon = {
    artifact: 'gate4g-portfolio-reconciliation',
    required_cells: REQUIRED_CELLS,
    conditions: CONDITIONS,
    rooftops: ROOFTOPS,
    evaluated: evaluatedCells,
    unresolved: unresolvedCells,
    prior_evaluated: contentRecon.evaluated,
    gate4g_new_evaluated_cells: newEvaluatedCells,
    gate4g_held_cells: gate4gHeldCells,
    unaudited_ids: partition.residual_unaudited,
    id_partition: partition,
    cell_partition: cellPartition,
    id_partition_reconciles_to: CONDITIONS,
    cell_partition_reconciles_to: REQUIRED_CELLS,
    by_dealer: Object.fromEntries(
      GOVERNED.map((d) => {
        const b = contentRecon.by_dealer[d]
        return [
          d,
          {
            evaluated: b.evaluated,
            gate4g_new_evaluated: 0,
            gate4g_held: held.length,
            unresolved: b.unresolved,
          },
        ]
      }),
    ),
    note: `Gate 4G dispositions the final ${held.length} residual IDs (${gate4gHeldCells} cells) with explicit blockers but promotes 0, so evaluated stays ${evaluatedCells}/${unresolvedCells} — the prior 51 evaluated cells are byte-preserved. Disjoint ID partition 17 evaluated + 70 Gate-4E-content-HOLD + 86 Gate-4F-HOLD + 122 Gate-4G-HOLD + 0 unaudited = 295 (×3 rooftops = 885 cells). Every ID is now dispositioned.`,
  }
  const reconPath = path.join(OUT, 'gate4g-portfolio-reconciliation.json')
  fs.writeFileSync(reconPath, await formatJsonFile(recon, reconPath))

  console.log(promotionStatement)
  console.log(
    `acquisition tally: ${JSON.stringify(derivation.acquisition_counts)}`,
  )
  console.log(`outside-boundary lanes: ${JSON.stringify(laneBreakdown)}`)
  console.log(
    `blocker tally: ${JSON.stringify(Object.fromEntries(blockerTally))}`,
  )
  console.log(
    `portfolio: ${evaluatedCells}/${unresolvedCells}; partition ${JSON.stringify(partition)}; 122-sha ${sha}`,
  )
  console.log(
    `wrote ${path.relative(REPO, matrixPath)}, ${path.relative(REPO, ledgerPath)}, ${path.relative(REPO, reconPath)}`,
  )
}

void main()
