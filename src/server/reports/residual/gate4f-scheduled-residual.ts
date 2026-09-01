/**
 * Gate 4F — Scheduled-source + downstream-calculation/NLP RESIDUAL audit (pure logic).
 *
 * Bounded re-audit of exactly the 86 catalog IDs in acquisition class
 * `Scheduled source plus downstream calculation/NLP` that remain AFTER subtracting all prior
 * evaluated IDs (spine 10 + comm overlay 2 + content 5 = 17) and the full 75-ID Gate 4E content
 * candidate set. Every disposition is DERIVED from committed artifacts (feasibility matrix +
 * comm capability delta) and the Contract-2 evidence boundary; nothing is invented.
 *
 * This module is PURE (no I/O, no side effects) so the generator and the independent test share
 * exactly one implementation. It reuses the FROZEN Gate 4E E1 spec schema + HELD builder so the
 * 14-key `frozen_e1_spec` is byte-schema-identical to the governing contract.
 */
import type { FrozenE1Spec } from '@/server/reports/comms/comm-content-metrics'
import {
  FROZEN_E1_SPEC_KEYS,
  buildFrozenE1HeldSpec,
} from '@/server/reports/comms/comm-content-metrics'

export { FROZEN_E1_SPEC_KEYS, type FrozenE1Spec }

/** The single acquisition class this gate audits. */
export const GATE4F_TARGET_CLASS =
  'Scheduled source plus downstream calculation/NLP' as const

/** The accepted evidence week (Contract 2). */
export const GATE4F_ACCEPTED_WEEK = '2026-08-24..2026-08-30' as const

/**
 * The five committed capability-delta blocker categories that can appear in the residual. A row is
 * PROMOTE-eligible ONLY when its capability category is `definition_compatible_now`; every category
 * below is, by definition, a HOLD blocker. These are used verbatim as `blocker_class` so each HOLD
 * is traceable to the committed `sw295-comm-capability-delta.json`.
 */
export const GATE4F_BLOCKER_CLASSES = [
  'unsupported_field',
  'other_source_or_join',
  'insufficient_history',
  'semantic_definition_pending',
  'outside_sales_boundary',
] as const
export type Gate4fBlockerClass = (typeof GATE4F_BLOCKER_CLASSES)[number]

/** The one capability category that would make a row PROMOTE-eligible (none exist in the residual). */
export const DEFINITION_COMPATIBLE = 'definition_compatible_now' as const

/** Fixed Contract-2 prerequisite sentence per blocker class (derived from the directive, not the row). */
const CONTRACT2_REQUIREMENT: Record<Gate4fBlockerClass, string> = {
  unsupported_field:
    'the required field(s) admitted into the accepted Sales-only structured/communication schema (Contract 2); no field extension is authorized in this gate',
  other_source_or_join:
    'a proved stable same-dealer same-period join key across the required source(s) with explicit row-level reconciliation (Contract 2); quarantined ROI/CAGE and external sources remain excluded',
  insufficient_history:
    'literal history beyond the single accepted week 2026-08-24..2026-08-30 (missing is never zero); no multi-week history is accepted in this gate',
  semantic_definition_pending:
    'a ratified semantic/NLP definition or threshold evaluated by an approved in-boundary provider; no approved in-boundary provider exists and no live model may be called (Contract 2)',
  outside_sales_boundary:
    'evidence outside the permanent Sales-only boundary (Service/Parts/complaint); permanently excluded (Contract 2)',
}

export type CatalogRow = {
  metric_id: string
  section: string
  subsection: string
  condition: string
  acquisition_class: string
  source: string
  period_grain_population: string
  owner: string
  next_action: string
}

export type DeltaRow = {
  metric_id: string
  category: string
  rationale: string
  missing_inputs: string
  join_or_nlp_required: string
  minimum_history: string
  requires_ratified_threshold: boolean
}

export type Gate4fRow = {
  metric_id: string
  section: string
  subsection: string
  condition: string
  source: string
  disposition: 'HOLD'
  category: Gate4fBlockerClass
  blocker_class: Gate4fBlockerClass
  primary_blocker: string
  prerequisites: Array<string>
  owner: string
  next_action: string
  minimum_history: string
  requires_ratified_threshold: boolean
  frozen_e1_spec: FrozenE1Spec
}

/**
 * Derive the 86 residual IDs reproducibly: the target acquisition class MINUS all prior evaluated
 * IDs MINUS the full 75-ID content candidate set. Deterministically sorted by numeric SW index.
 */
export function deriveResidualIds(
  matrix: Array<CatalogRow>,
  priorEvaluated: ReadonlySet<string>,
  contentCandidates: ReadonlySet<string>,
): Array<string> {
  const universe = matrix
    .filter((r) => r.acquisition_class === GATE4F_TARGET_CLASS)
    .map((r) => r.metric_id)
  const residual = universe.filter(
    (id) => !priorEvaluated.has(id) && !contentCandidates.has(id),
  )
  return [...new Set(residual)].sort((a, b) => swIndex(a) - swIndex(b))
}

export function swIndex(id: string): number {
  const m = /^SW-(\d+)$/.exec(id)
  if (!m) throw new Error(`bad metric id ${id}`)
  return Number(m[1])
}

/**
 * PROMOTE only when the catalog definition is exact AND the accepted evidence is sufficient. The
 * committed capability delta already determines exactness/field-support; a row is PROMOTE-eligible
 * strictly when its capability category is `definition_compatible_now`. Every other category is a
 * documented Contract-2 blocker → HOLD. Returns the disposition (derived, never hardcoded).
 */
export function disposition(deltaCategory: string): 'PROMOTE' | 'HOLD' {
  return deltaCategory === DEFINITION_COMPATIBLE ? 'PROMOTE' : 'HOLD'
}

export function asBlockerClass(category: string): Gate4fBlockerClass {
  if ((GATE4F_BLOCKER_CLASSES as ReadonlyArray<string>).includes(category))
    return category as Gate4fBlockerClass
  throw new Error(
    `Gate 4F: capability category ${category} is neither definition_compatible_now nor a known blocker class`,
  )
}

/** Prerequisites for a HOLD, composed only from committed delta fields + the Contract-2 sentence. */
export function buildPrerequisites(
  delta: DeltaRow,
  cls: Gate4fBlockerClass,
): Array<string> {
  return [
    `missing_inputs: ${delta.missing_inputs}`,
    `capability_requirement: ${delta.join_or_nlp_required}`,
    `minimum_history: ${delta.minimum_history}`,
    `contract_2_requirement: ${CONTRACT2_REQUIREMENT[cls]}`,
  ]
}

/** Build one HOLD row. `primary_blocker` is the committed delta rationale (exact reason). */
export function buildHoldRow(catalog: CatalogRow, delta: DeltaRow): Gate4fRow {
  if (disposition(delta.category) !== 'HOLD')
    throw new Error(`${catalog.metric_id} is not a HOLD`)
  const cls = asBlockerClass(delta.category)
  return {
    metric_id: catalog.metric_id,
    section: catalog.section,
    subsection: catalog.subsection,
    condition: catalog.condition,
    source: catalog.source,
    disposition: 'HOLD',
    category: cls,
    blocker_class: cls,
    primary_blocker: delta.rationale,
    prerequisites: buildPrerequisites(delta, cls),
    owner: catalog.owner,
    next_action: catalog.next_action,
    minimum_history: delta.minimum_history,
    requires_ratified_threshold: delta.requires_ratified_threshold,
    frozen_e1_spec: buildFrozenE1HeldSpec({
      period_grain_population: catalog.period_grain_population,
      join_or_nlp_required: delta.join_or_nlp_required,
      missing_item: delta.missing_inputs,
    }),
  }
}

export type PortfolioPartition = {
  evaluated: number
  gate4e_content_hold: number
  gate4f_hold: number
  residual_unaudited: number
}

/**
 * Disjoint partition of all 295 IDs into four categories:
 *   evaluated (promoted, preserved) | Gate 4E content HOLD | Gate 4F HOLD | residual unaudited.
 * Fails closed unless the four sets are pairwise disjoint and cover exactly the 295 catalog IDs.
 */
export function buildPartition(
  allIds: ReadonlySet<string>,
  evaluated: ReadonlySet<string>,
  contentHold: ReadonlySet<string>,
  gate4fHold: ReadonlySet<string>,
): PortfolioPartition {
  const groups: Array<[string, ReadonlySet<string>]> = [
    ['evaluated', evaluated],
    ['gate4e_content_hold', contentHold],
    ['gate4f_hold', gate4fHold],
  ]
  for (let i = 0; i < groups.length; i++)
    for (let j = i + 1; j < groups.length; j++) {
      const [na, a] = groups[i]
      const [nb, b] = groups[j]
      for (const x of a)
        if (b.has(x))
          throw new Error(`Gate 4F partition overlap ${na}∩${nb} at ${x}`)
    }
  const claimed = new Set<string>()
  for (const [, s] of groups) for (const x of s) claimed.add(x)
  for (const x of claimed)
    if (!allIds.has(x))
      throw new Error(`Gate 4F partition claims non-catalog id ${x}`)
  const residual = [...allIds].filter((x) => !claimed.has(x))
  return {
    evaluated: evaluated.size,
    gate4e_content_hold: contentHold.size,
    gate4f_hold: gate4fHold.size,
    residual_unaudited: residual.length,
  }
}
