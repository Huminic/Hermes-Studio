/**
 * Gate 4G — FINAL residual audit (pure logic).
 *
 * Audits the LAST 122 catalog IDs: canonical 295 MINUS the disjoint 17 evaluated MINUS the 70
 * Gate 4E content-HOLD MINUS the 86 Gate 4F scheduled-residual-HOLD. After this gate every one of
 * the 295 IDs is dispositioned — ZERO unaudited IDs remain.
 *
 * Every disposition is DERIVED from committed artifacts (feasibility matrix `acquisition_class` +
 * capability delta `category`) under the Contract-2 evidence boundary; nothing is invented. None of
 * the 122 is `definition_compatible_now`, so the gate PROMOTES 0 and HOLDS 122 — the prior 51
 * evaluated cells and all Gate 4E/4F payload bytes are preserved unchanged.
 *
 * This module is PURE (no I/O, no side effects) so the generator and the independent test share one
 * implementation. It reuses the FROZEN Gate 4E E1 spec schema + HELD builder and the Gate 4F
 * partition/disposition primitives so the contract stays byte-identical across gates.
 */
import type {
  CatalogRow,
  DeltaRow,
} from '@/server/reports/residual/gate4f-scheduled-residual'
import type { FrozenE1Spec } from '@/server/reports/comms/comm-content-metrics'
import {
  DEFINITION_COMPATIBLE,
  FROZEN_E1_SPEC_KEYS,
  disposition,
  swIndex,
} from '@/server/reports/residual/gate4f-scheduled-residual'
import { buildFrozenE1HeldSpec } from '@/server/reports/comms/comm-content-metrics'

export {
  DEFINITION_COMPATIBLE,
  FROZEN_E1_SPEC_KEYS,
  disposition,
  swIndex,
  type CatalogRow,
  type DeltaRow,
  type FrozenE1Spec,
}

/** The accepted evidence week (Contract 2). */
export const GATE4G_ACCEPTED_WEEK = '2026-08-24..2026-08-30' as const

/**
 * The SIX committed feasibility-matrix `acquisition_class` values that partition the final residual.
 * Counts are asserted by the generator/test against the committed matrix (15/3/6/55/8/35).
 */
export const GATE4G_ACQUISITION_CLASSES = [
  'Vin-native scheduled',
  'Native manual export',
  'Manual CRM inspection',
  'Separate external source required',
  'Unavailable or retention-limited',
  'Outside governed boundary',
] as const
export type Gate4gAcquisitionClass = (typeof GATE4G_ACQUISITION_CLASSES)[number]

/** The one acquisition class whose IDs need Service/compliance/cross-rooftop/enrichment sub-laning. */
export const OUTSIDE_BOUNDARY_CLASS = 'Outside governed boundary' as const

/**
 * The four approval lanes INSIDE the outside-governed-boundary class. The catalog names them
 * verbatim in each such row's `source` ("no Service/cross-rooftop/compliance/enrichment access
 * authorized"), so every outside-boundary ID routes to a specific lane authority rather than a
 * single blanket approval.
 */
export const GATE4G_BOUNDARY_LANES = [
  'service',
  'compliance_legal',
  'cross_rooftop',
  'enrichment',
] as const
export type Gate4gBoundaryLane = (typeof GATE4G_BOUNDARY_LANES)[number]

/**
 * Deterministic keyword rules (first match by lane priority) that classify an outside-boundary row
 * into its approval lane from the committed condition text. Priority puts the most legally specific
 * lane first so a stray "service radius" substring cannot mask a compliance/enrichment requirement.
 */
const BOUNDARY_LANE_RULES: ReadonlyArray<
  readonly [Gate4gBoundaryLane, ReadonlyArray<string>]
> = [
  [
    'compliance_legal',
    [
      'tcpa',
      'dnc',
      'do-not-call',
      'do-not-contact',
      'adverse action',
      'ofac',
      'red flags',
      "driver's license",
      'privacy policy',
      'under 18',
      'id mismatch',
      'safeguards',
      'contact hours',
      'before 8am',
      'after 9pm',
      'disclosure',
      'discriminat',
      'ssn',
      'dob',
      'pii',
      'consent',
    ],
  ],
  [
    'enrichment',
    [
      'append',
      'registration',
      'insurance',
      'linkedin',
      'home-purchase',
      'credit-tier',
      'tax-refund',
      'third-party',
      'records',
      'movers',
      'job-change',
      'public ',
    ],
  ],
  [
    'cross_rooftop',
    [
      'rooftop',
      'sister',
      'another store',
      'one store',
      'within group',
      'across store',
    ],
  ],
  [
    'service',
    [
      'service',
      'warranty',
      'vsc',
      'cpo',
      'repair',
      'waiting-room',
      'waiting room',
      ' ro ',
    ],
  ],
]

export type Gate4gRow = {
  metric_id: string
  section: string
  subsection: string
  condition: string
  source: string
  disposition: 'HOLD'
  acquisition_class: Gate4gAcquisitionClass
  blocker_class: string
  boundary_lane: Gate4gBoundaryLane | 'not_applicable'
  primary_blocker: string
  additional_blockers: Array<string>
  classification: {
    source: string
    field: string
    history: string
    threshold: string
    join: string
    authority: string
  }
  owner: string
  next_safe_action: string
  approval_boundary: string
  frozen_e1_spec: FrozenE1Spec
}

/**
 * Derive the final 122 residual IDs reproducibly: canonical 295 MINUS evaluated 17 MINUS Gate 4E
 * content-HOLD 70 MINUS Gate 4F scheduled-HOLD 86. Deterministically sorted by numeric SW index.
 */
export function deriveFinalResidualIds(
  allIds: ReadonlyArray<string>,
  evaluated: ReadonlySet<string>,
  contentHold: ReadonlySet<string>,
  gate4fHold: ReadonlySet<string>,
): Array<string> {
  const residual = allIds.filter(
    (id) => !evaluated.has(id) && !contentHold.has(id) && !gate4fHold.has(id),
  )
  return [...new Set(residual)].sort((a, b) => swIndex(a) - swIndex(b))
}

/**
 * The sorted-newline SHA-256 preimage of an ID set: IDs sorted ascending, each followed by a single
 * newline (trailing newline included). Lexicographic and numeric order coincide for fixed-width IDs.
 */
export function sortedNewlinePreimage(ids: ReadonlyArray<string>): string {
  return [...ids]
    .sort()
    .map((id) => `${id}\n`)
    .join('')
}

export function asAcquisitionClass(value: string): Gate4gAcquisitionClass {
  if ((GATE4G_ACQUISITION_CLASSES as ReadonlyArray<string>).includes(value))
    return value as Gate4gAcquisitionClass
  throw new Error(`Gate 4G: unknown acquisition_class ${value}`)
}

/**
 * Classify one outside-boundary row into its approval lane from the committed CONDITION text only
 * (the section title is excluded: e.g. the "PART 1 — Red Flags" section name would otherwise
 * incidentally match the OFAC/Red-Flags compliance keyword and mislabel a Service-domain row).
 * Throws if no keyword matches.
 */
export function classifyBoundaryLane(catalog: CatalogRow): Gate4gBoundaryLane {
  const hay = catalog.condition.toLowerCase()
  for (const [lane, keywords] of BOUNDARY_LANE_RULES)
    if (keywords.some((k) => hay.includes(k))) return lane
  throw new Error(
    `Gate 4G: outside-boundary row ${catalog.metric_id} matched no lane keyword`,
  )
}

/** Fixed approval boundary + authority per acquisition class (derived from the directive, not the row). */
const APPROVAL_BOUNDARY: Record<Gate4gAcquisitionClass, string> = {
  'Vin-native scheduled':
    'authorize a bounded read-only acquisition of the named VinSolutions-native scheduled export into the accepted Sales-only pipeline; quarantined ROI/CAGE definitions remain excluded until separately ratified',
  'Native manual export':
    'authorize the read-only manual export of the Dealer Dashboard Response Times Opportunities CSV (the next authorized acquisition); compute SLA/business-calendar metrics locally, Sales-only',
  'Manual CRM inspection':
    'authorize a bounded read-only manual CRM inspection for the specific field(s); no field extension or external write is authorized in this gate',
  'Separate external source required':
    'admit and reconcile the named separate source with a proved stable same-dealer same-period join key and explicit row-level reconciliation; external sources and quarantined ROI/CAGE remain excluded until governed',
  'Unavailable or retention-limited':
    'obtain the retained/historical window from the source-system retention owner (missing is never zero); no multi-week history is fabricated in this gate',
  'Outside governed boundary':
    'route to the specific lane authority (Service | compliance/legal | cross-rooftop | enrichment) — NOT a single blanket approval; permanently excluded from the Sales-only boundary until that lane is separately governed',
}

/** Per-lane authority sentence for outside-boundary rows. */
const LANE_AUTHORITY: Record<Gate4gBoundaryLane, string> = {
  service:
    'Service data owner (Service-to-Sales / equity-mining) — outside the permanent Sales-only boundary',
  compliance_legal:
    'Compliance/legal authority (TCPA/DNC/OFAC/Safeguards/privacy) — governance sign-off required',
  cross_rooftop:
    'Cross-rooftop data-sharing authority across sister stores in the group',
  enrichment:
    'Third-party enrichment / external-append data owner (appended non-dealer records)',
}

/** Build one HOLD row. `primary_blocker` is the committed delta rationale (exact reason). */
export function buildHoldRow(catalog: CatalogRow, delta: DeltaRow): Gate4gRow {
  if (disposition(delta.category) !== 'HOLD')
    throw new Error(`${catalog.metric_id} is not a HOLD`)
  const acquisition = asAcquisitionClass(catalog.acquisition_class)
  const lane =
    acquisition === OUTSIDE_BOUNDARY_CLASS
      ? classifyBoundaryLane(catalog)
      : ('not_applicable' as const)
  const authority =
    lane === 'not_applicable'
      ? `${catalog.owner || 'unassigned'} (acquisition class: ${acquisition})`
      : LANE_AUTHORITY[lane]

  const additional: Array<string> = []
  if (delta.missing_inputs)
    additional.push(`missing_inputs: ${delta.missing_inputs}`)
  if (delta.join_or_nlp_required)
    additional.push(`join_or_nlp_required: ${delta.join_or_nlp_required}`)
  if (delta.requires_ratified_threshold)
    additional.push('requires a ratified threshold (none in boundary)')
  if (lane !== 'not_applicable')
    additional.push(`boundary_lane: ${lane} — ${LANE_AUTHORITY[lane]}`)

  return {
    metric_id: catalog.metric_id,
    section: catalog.section,
    subsection: catalog.subsection,
    condition: catalog.condition,
    source: catalog.source,
    disposition: 'HOLD',
    acquisition_class: acquisition,
    blocker_class: delta.category,
    boundary_lane: lane,
    primary_blocker: delta.rationale,
    additional_blockers: additional,
    classification: {
      source: catalog.source,
      field: delta.missing_inputs || 'unresolved (held)',
      history: delta.minimum_history || 'not_applicable (held)',
      threshold: delta.requires_ratified_threshold
        ? 'ratified threshold required'
        : 'no ratified threshold required',
      join: delta.join_or_nlp_required || 'not_applicable (held)',
      authority,
    },
    owner: catalog.owner,
    next_safe_action: catalog.next_action,
    approval_boundary: APPROVAL_BOUNDARY[acquisition],
    frozen_e1_spec: buildFrozenE1HeldSpec({
      period_grain_population: catalog.period_grain_population,
      join_or_nlp_required: delta.join_or_nlp_required,
      missing_item: delta.missing_inputs,
    }),
  }
}

export type FinalPartition = {
  evaluated: number
  gate4e_content_hold: number
  gate4f_hold: number
  gate4g_hold: number
  residual_unaudited: number
}

/**
 * Disjoint partition of ALL 295 IDs into five categories. After Gate 4G the residual is EMPTY.
 * Fails closed unless the four dispositioned sets are pairwise disjoint AND cover exactly the 295
 * catalog IDs with zero leftover.
 */
export function buildFinalPartition(
  allIds: ReadonlySet<string>,
  evaluated: ReadonlySet<string>,
  contentHold: ReadonlySet<string>,
  gate4fHold: ReadonlySet<string>,
  gate4gHold: ReadonlySet<string>,
): FinalPartition {
  const groups: Array<[string, ReadonlySet<string>]> = [
    ['evaluated', evaluated],
    ['gate4e_content_hold', contentHold],
    ['gate4f_hold', gate4fHold],
    ['gate4g_hold', gate4gHold],
  ]
  for (let i = 0; i < groups.length; i++)
    for (let j = i + 1; j < groups.length; j++) {
      const [na, a] = groups[i]
      const [nb, b] = groups[j]
      for (const x of a)
        if (b.has(x))
          throw new Error(`Gate 4G partition overlap ${na}∩${nb} at ${x}`)
    }
  const claimed = new Set<string>()
  for (const [, s] of groups) for (const x of s) claimed.add(x)
  for (const x of claimed)
    if (!allIds.has(x))
      throw new Error(`Gate 4G partition claims non-catalog id ${x}`)
  const residual = [...allIds].filter((x) => !claimed.has(x))
  return {
    evaluated: evaluated.size,
    gate4e_content_hold: contentHold.size,
    gate4f_hold: gate4fHold.size,
    gate4g_hold: gate4gHold.size,
    residual_unaudited: residual.length,
  }
}
