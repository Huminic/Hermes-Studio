/**
 * Gate 4F — Scheduled-source + downstream-calculation/NLP RESIDUAL audit generator.
 *
 * Re-audits exactly the 86 catalog IDs in acquisition class
 * `Scheduled source plus downstream calculation/NLP` that remain after subtracting all prior
 * evaluated IDs (spine 10 + comm 2 + content 5 = 17) and the full 75-ID Gate 4E content candidate
 * set. Every one is definition-inexact or evidence-insufficient under the Contract-2 boundary, so
 * the gate PROMOTES 0 and HOLDS 86 — the prior 51 evaluated cells are preserved byte-for-byte.
 *
 * Writes ONLY aggregate, non-PII artifacts (no raw CSV / message content / identifiers are read or
 * written — nothing is promotable, so no restricted capture is opened):
 *   - docs/halo/contract/sw295-gate4f-scheduled-residual-matrix.json         (86-row matrix)
 *   - docs/halo/evidence/m1r/residual/gate4f-evaluated-cell-ledger.json      (0 new cells + 258 held)
 *   - docs/halo/evidence/m1r/residual/gate4f-portfolio-reconciliation.json   (885-cell, 51/834)
 *
 * All counts are DERIVED from the committed feasibility matrix + capability delta + prior evidence
 * and fail closed on any arithmetic / partition / schema divergence. Byte-identical on rerun.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { formatJsonFile } from '../m1r-evaluator/serialize'
import type {
  CatalogRow,
  DeltaRow,
} from '@/server/reports/residual/gate4f-scheduled-residual'
import {
  DEFINITION_COMPATIBLE,
  FROZEN_E1_SPEC_KEYS,
  GATE4F_ACCEPTED_WEEK,
  GATE4F_BLOCKER_CLASSES,
  GATE4F_TARGET_CLASS,
  buildHoldRow,
  buildPartition,
  deriveResidualIds,
  disposition,
  swIndex,
} from '@/server/reports/residual/gate4f-scheduled-residual'

const REPO = process.cwd()
const CONTRACT = path.join(REPO, 'docs/halo/contract')
const OUT = path.join(REPO, 'docs/halo/evidence/m1r/residual')
const CATALOG = path.join(
  CONTRACT,
  'semantic-watchdog-feasibility-matrix-295.json',
)
const CAP_DELTA = path.join(CONTRACT, 'sw295-comm-capability-delta.json')
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

const sha256File = (p: string) =>
  createHash('sha256').update(fs.readFileSync(p)).digest('hex')

function must(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Gate 4F reconciliation failed: ${msg}`)
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
  const allIds = new Set(catalog.map((r) => r.metric_id))
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

  // ── Prior evaluated IDs (17) = spine 10 + comm overlay 2 + content 5 ──
  const spine = readJson<{ evaluated_ids: Array<string> }>(SPINE_SUMMARY)
  const comm = readJson<{ evaluated_ids: Array<string> }>(COMM_LEDGER)
  const contentRecon = readJson<{
    required_cells: number
    evaluated: number
    unresolved: number
    content_promoted_ids: Array<string>
    by_dealer: Record<string, { evaluated: number; unresolved: number }>
  }>(CONTENT_RECON)
  const spineIds = spine.evaluated_ids
  const commIds = comm.evaluated_ids
  const contentIds = contentRecon.content_promoted_ids
  must(spineIds.length === 10, `spine evaluated ids ${spineIds.length} != 10`)
  must(commIds.length === 2, `comm evaluated ids ${commIds.length} != 2`)
  must(
    contentIds.length === 5,
    `content promoted ids ${contentIds.length} != 5`,
  )
  const priorEvaluated = new Set([...spineIds, ...commIds, ...contentIds])
  must(
    priorEvaluated.size === 17,
    `prior evaluated union ${priorEvaluated.size} != 17`,
  )

  // ── The full 75-ID Gate 4E content candidate set ──
  const contentCandidates = new Set(
    delta.rows
      .filter((r) => String(r.category) === 'nlp_content_capable_pending')
      .map((r) => String(r.metric_id)),
  )
  must(
    contentCandidates.size === 75,
    `content candidate set ${contentCandidates.size} != 75`,
  )

  // ── Derive the 86 residual IDs reproducibly ──
  const ids86 = deriveResidualIds(catalog, priorEvaluated, contentCandidates)
  must(ids86.length === 86, `residual is ${ids86.length}, not 86`)
  must(new Set(ids86).size === 86, 'residual IDs not unique')

  // ── Derivation breakdown (computed + asserted, so the narrative cannot drift) ──
  const universeIds = new Set(
    catalog
      .filter((r) => r.acquisition_class === GATE4F_TARGET_CLASS)
      .map((r) => r.metric_id),
  )
  const contentInClass = [...contentCandidates].filter((id) =>
    universeIds.has(id),
  )
  const priorInClass = [...priorEvaluated].filter((id) => universeIds.has(id))
  const priorNonContentInClass = priorInClass
    .filter((id) => !contentCandidates.has(id))
    .sort((a, b) => swIndex(a) - swIndex(b))
  const contentInClassPromoted = contentInClass.filter((id) =>
    priorEvaluated.has(id),
  )
  const contentInClassHeld = contentInClass.filter(
    (id) => !priorEvaluated.has(id),
  )
  const removedInClass = universeIds.size - ids86.length
  must(universeIds.size === 162, `target class is ${universeIds.size}, not 162`)
  must(
    contentInClass.length === 72,
    `content75 ∩ class is ${contentInClass.length}, not 72`,
  )
  must(
    contentInClassPromoted.length === 5 && contentInClassHeld.length === 67,
    `content-in-class split ${contentInClassPromoted.length}/${contentInClassHeld.length} != 5/67`,
  )
  must(
    priorInClass.length === 9,
    `evaluated17 ∩ class is ${priorInClass.length}, not 9`,
  )
  must(
    priorNonContentInClass.length === 4 &&
      JSON.stringify(priorNonContentInClass) ===
        JSON.stringify(['SW-022', 'SW-046', 'SW-090', 'SW-133']),
    `non-content prior-in-class ${JSON.stringify(priorNonContentInClass)} != [SW-022,SW-046,SW-090,SW-133]`,
  )
  must(
    contentInClass.length + priorNonContentInClass.length === removedInClass,
    `removed-in-class ${removedInClass} != content-in-class ${contentInClass.length} + non-content prior-in-class ${priorNonContentInClass.length}`,
  )
  must(
    removedInClass === 76 && universeIds.size - removedInClass === 86,
    `162 - ${removedInClass} != 86`,
  )
  const derivation = {
    target_class_size: universeIds.size,
    prior_evaluated_total: priorEvaluated.size,
    content_candidates_total: contentCandidates.size,
    residual: ids86.length,
    removed_inside_class: removedInClass,
    removed_breakdown: {
      content_candidates_in_class: contentInClass.length,
      content_in_class_promoted: contentInClassPromoted.length,
      content_in_class_held: contentInClassHeld.length,
      prior_evaluated_non_content_in_class: priorNonContentInClass.length,
      prior_evaluated_non_content_in_class_ids: priorNonContentInClass,
    },
    outside_class: {
      content_candidates_outside_class:
        contentCandidates.size - contentInClass.length,
      prior_evaluated_outside_class: priorEvaluated.size - priorInClass.length,
    },
    formula: `${universeIds.size} target-class − ${removedInClass} removed (${contentInClass.length} content-candidates-in-class [${contentInClassPromoted.length} promoted + ${contentInClassHeld.length} held] + ${priorNonContentInClass.length} non-content prior-evaluated-in-class [${priorNonContentInClass.join(', ')}]) = ${ids86.length}`,
  }

  // ── Classify + build rows (PROMOTE only if definition_compatible_now; else HOLD) ──
  const rows = ids86.map((id) => {
    const cat = catalogById.get(id)
    const d = deltaById.get(id)
    must(!!cat, `catalog row missing for ${id}`)
    must(!!d, `capability-delta row missing for ${id}`)
    must(
      cat!.acquisition_class === GATE4F_TARGET_CLASS,
      `${id} acquisition_class != target`,
    )
    return { id, disp: disposition(d!.category), cat: cat!, d: d! }
  })
  const promoted = rows.filter((r) => r.disp === 'PROMOTE')
  const held = rows.filter((r) => r.disp === 'HOLD')
  // Derived, not hardcoded: 0 of the 86 are definition_compatible_now under the accepted boundary.
  const definitionCompatible = rows.filter(
    (r) => r.d.category === DEFINITION_COMPATIBLE,
  )
  must(
    promoted.length === definitionCompatible.length,
    `promotions ${promoted.length} != definition-compatible ${definitionCompatible.length}`,
  )
  must(
    promoted.length + held.length === 86,
    `promote ${promoted.length} + hold ${held.length} != 86`,
  )

  const matrixRows = rows.map((r) => {
    if (r.disp !== 'HOLD')
      throw new Error(
        `Gate 4F: ${r.id} classified PROMOTE but no evaluated evidence exists — refusing to fabricate`,
      )
    return buildHoldRow(r.cat, r.d)
  })

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
      (GATE4F_BLOCKER_CLASSES as ReadonlyArray<string>).includes(
        row.blocker_class,
      ),
      `${row.metric_id} blocker_class ${row.blocker_class} not a committed capability category`,
    )
    must(
      row.primary_blocker.length > 0 && row.prerequisites.length === 4,
      `${row.metric_id} HOLD record incomplete`,
    )
    must(
      row.owner.length > 0 && row.next_action.length > 0,
      `${row.metric_id} owner/next_action empty`,
    )
  }

  // ── Blocker-class tally (disjoint over the 86) ──
  const blockerTally: Record<string, number> = {}
  for (const row of matrixRows)
    blockerTally[row.blocker_class] = (blockerTally[row.blocker_class] ?? 0) + 1
  must(
    Object.values(blockerTally).reduce((a, b) => a + b, 0) === 86,
    'blocker tally != 86',
  )

  // ── Disjoint portfolio partition of all 295 IDs ──
  const contentHold = new Set(
    [...contentCandidates].filter((id) => !priorEvaluated.has(id)),
  )
  must(contentHold.size === 70, `content HOLD set ${contentHold.size} != 70`)
  const partition = buildPartition(
    allIds,
    priorEvaluated,
    contentHold,
    new Set(ids86),
  )
  must(
    partition.evaluated === 17 &&
      partition.gate4e_content_hold === 70 &&
      partition.gate4f_hold === 86 &&
      partition.residual_unaudited === 122,
    `partition ${JSON.stringify(partition)} != 17/70/86/122`,
  )
  must(
    partition.evaluated +
      partition.gate4e_content_hold +
      partition.gate4f_hold +
      partition.residual_unaudited ===
      CONDITIONS,
    'partition does not sum to 295',
  )

  // ── Portfolio cells: prior 51 evaluated preserved EXACTLY; 834 unresolved ──
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
    `Gate 4F introduced ${newEvaluatedCells} evaluated cells (expected 0)`,
  )
  const evaluatedCells = contentRecon.evaluated + newEvaluatedCells
  const gate4fHeldCells = held.length * ROOFTOPS
  must(gate4fHeldCells === 258, `Gate 4F held cells ${gate4fHeldCells} != 258`)
  const unresolvedCells = REQUIRED_CELLS - evaluatedCells
  must(
    evaluatedCells === 51 && unresolvedCells === 834,
    `portfolio ${evaluatedCells}/${unresolvedCells} != 51/834 (prior cells not preserved)`,
  )
  // Cell partition mirrors the ID partition ×3.
  const cellPartition = {
    evaluated: partition.evaluated * ROOFTOPS,
    gate4e_content_hold: partition.gate4e_content_hold * ROOFTOPS,
    gate4f_hold: partition.gate4f_hold * ROOFTOPS,
    residual_unaudited: partition.residual_unaudited * ROOFTOPS,
  }
  must(
    cellPartition.evaluated +
      cellPartition.gate4e_content_hold +
      cellPartition.gate4f_hold +
      cellPartition.residual_unaudited ===
      REQUIRED_CELLS,
    'cell partition != 885',
  )

  // ── Sanity: rows are index-sorted and cover exactly the derived 86 ──
  for (let i = 1; i < matrixRows.length; i++)
    must(
      swIndex(matrixRows[i].metric_id) > swIndex(matrixRows[i - 1].metric_id),
      'matrix rows not strictly index-sorted',
    )

  const promotionStatement = `Audited exactly ${ids86.length} residual IDs in acquisition class "${GATE4F_TARGET_CLASS}". PROMOTED ${promoted.length}; HELD ${held.length}. Every ID is definition-inexact or evidence-insufficient under the Contract-2 accepted boundary (Sales-only; dealers ${GOVERNED.join('/')}; week ${GATE4F_ACCEPTED_WEEK}); no restricted capture was read. The prior ${contentRecon.evaluated} evaluated cells are preserved unchanged.`

  const matrixDoc = {
    artifact: 'gate4f-scheduled-residual-matrix',
    revision:
      'gate4f-residual-disposition-v1 (0 PROMOTE / 86 HOLD; evidence-backed)',
    acquisition_class: GATE4F_TARGET_CLASS,
    accepted_week: GATE4F_ACCEPTED_WEEK,
    governed_rooftops: [...GOVERNED],
    catalog_ref:
      'docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json',
    capability_delta_ref: 'docs/halo/contract/sw295-comm-capability-delta.json',
    derivation,
    frozen_e1_spec_schema: FROZEN_E1_SPEC_KEYS,
    frozen_e1_spec_note:
      'GOVERNING CONTRACT. Every row carries a frozen_e1_spec with EXACTLY these 14 hardcoded keys. All 86 are HOLD: only governed known facts are populated (catalog population, the capability join/NLP requirement + missing item, permanent Sales-only exclusions, and the standing missing-is-never-zero rule); every unknown/condition-specific field — including window and minimum_history — is `unresolved (held)` / `not_applicable (held)`. Non-executable by construction. Reuses the frozen Gate 4E E1 schema + builder.',
    totals: {
      candidates: ids86.length,
      promoted: promoted.length,
      held: held.length,
      rooftop_cells: ids86.length * ROOFTOPS,
      evaluated_cells: newEvaluatedCells,
      held_cells: gate4fHeldCells,
    },
    blocker_class_tally: blockerTally,
    promoted_ids: promoted.map((r) => r.id),
    held_ids: held.map((r) => r.id),
    promotion_statement: promotionStatement,
    rows: matrixRows,
  }
  fs.mkdirSync(CONTRACT, { recursive: true })
  const matrixPath = path.join(
    CONTRACT,
    'sw295-gate4f-scheduled-residual-matrix.json',
  )
  fs.writeFileSync(matrixPath, await formatJsonFile(matrixDoc, matrixPath))

  // ── Evaluated-cell ledger (0 new evaluated cells; 258 held cells) ──
  const ledger = {
    artifact: 'gate4f-evaluated-cell-ledger',
    acquisition_class: GATE4F_TARGET_CLASS,
    accepted_week: GATE4F_ACCEPTED_WEEK,
    governed_rooftops: [...GOVERNED],
    evaluated_ids: promoted.map((r) => r.id),
    evaluated_cells: newEvaluatedCells,
    held_ids: held.map((r) => r.id),
    held_cells: gate4fHeldCells,
    note: 'Gate 4F evaluated ZERO new cells: none of the 86 residual IDs is definition-exact AND evidence-sufficient under the Contract-2 accepted boundary. No restricted capture was opened (zero PII exposure). The prior 51 evaluated cells are unchanged. Each held cell inherits its row blocker: see the matrix for exact primary_blocker, prerequisites, blocker_class, owner, and next_action.',
    held: matrixRows.map((row) => ({
      metric_id: row.metric_id,
      blocker_class: row.blocker_class,
      primary_blocker: row.primary_blocker,
      prerequisites: row.prerequisites,
      owner: row.owner,
      next_action: row.next_action,
      rooftops: GOVERNED.map((d) => ({
        dealer_id: d,
        status: 'unresolved',
        blocker_class: row.blocker_class,
      })),
    })),
  }
  fs.mkdirSync(OUT, { recursive: true })
  const ledgerPath = path.join(OUT, 'gate4f-evaluated-cell-ledger.json')
  fs.writeFileSync(ledgerPath, await formatJsonFile(ledger, ledgerPath))

  // ── Exact 885-cell portfolio reconciliation (51 / 834 preserved; disjoint 295 partition) ──
  const recon = {
    artifact: 'gate4f-portfolio-reconciliation',
    required_cells: REQUIRED_CELLS,
    conditions: CONDITIONS,
    rooftops: ROOFTOPS,
    evaluated: evaluatedCells,
    unresolved: unresolvedCells,
    prior_evaluated: contentRecon.evaluated,
    gate4f_new_evaluated_cells: newEvaluatedCells,
    gate4f_held_cells: gate4fHeldCells,
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
            gate4f_new_evaluated: 0,
            gate4f_held: held.length,
            unresolved: b.unresolved,
          },
        ]
      }),
    ),
    note: `Gate 4F dispositions ${held.length} residual IDs (${gate4fHeldCells} cells) with explicit blockers but promotes 0, so evaluated stays ${evaluatedCells}/${unresolvedCells} — the prior 51 evaluated cells are byte-preserved. Disjoint ID partition 17 evaluated + 70 Gate-4E-content-HOLD + 86 Gate-4F-HOLD + 122 residual = 295 (×3 rooftops = 885 cells). Derived fail-closed from committed artifacts.`,
  }
  const reconPath = path.join(OUT, 'gate4f-portfolio-reconciliation.json')
  fs.writeFileSync(reconPath, await formatJsonFile(recon, reconPath))

  console.log(promotionStatement)
  console.log(`blocker tally: ${JSON.stringify(blockerTally)}`)
  console.log(
    `portfolio: ${evaluatedCells}/${unresolvedCells}; partition ${JSON.stringify(partition)}`,
  )
  console.log(
    `wrote ${path.relative(REPO, matrixPath)}, ${path.relative(REPO, ledgerPath)}, ${path.relative(REPO, reconPath)}`,
  )
}

void main()
