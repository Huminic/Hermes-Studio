/**
 * Gate 4C1 — capability-delta GENERATOR. It does NOT decide anything: it JOINS the authoritative
 * per-ID decision table (scripts/m1r-comms/comm-capability-decisions.ts) to the canonical
 * catalog only to copy/verify each condition + metadata, then emits the delta.
 *
 * The build fails closed if the decision table does not enumerate EXACTLY SW-001..SW-295 (no
 * missing / duplicate / extra / out-of-range ID), if any admitted field is not in
 * DERIVATIVE_SCHEMA_FIELDS, or if a not-ready row claims an admitted field. There is NO
 * regex / section / acquisition_class inference and NO catch-all fallback here. Every row's
 * `decided_by` is "explicit". Non-PII; promotes zero metrics.
 */
import fs from 'node:fs'
import path from 'node:path'
import { formatJsonFile } from '../m1r-evaluator/serialize'
import { DECISIONS, ONE_WEEK } from './comm-capability-decisions'
import type { Category } from './comm-capability-decisions'
import {
  COMM_WEEKLY_FAMILY,
  DERIVATIVE_SCHEMA_FIELDS,
} from '@/server/reports/comms/comm-family-contract'

const REPO = process.cwd()

const CATEGORIES: ReadonlyArray<Category> = [
  'definition_compatible_now',
  'semantic_definition_pending',
  'nlp_content_capable_pending',
  'unsupported_field',
  'insufficient_history',
  'other_source_or_join',
  'outside_sales_boundary',
]

type Cond = {
  metric_id: string
  section: string
  subsection: string
  condition: string
}

async function main(): Promise<void> {
  const catalog = JSON.parse(
    fs.readFileSync(
      path.join(
        REPO,
        'docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json',
      ),
      'utf8',
    ),
  ) as Array<Cond>
  if (!Array.isArray(catalog) || catalog.length !== 295)
    throw new Error(`expected 295 catalog rows, got ${catalog.length}`)

  // ── Coverage validation: the decision table must enumerate EXACTLY SW-001..SW-295 ──────────
  const decidedIds = Object.keys(DECISIONS)
  if (decidedIds.length !== 295)
    throw new Error(
      `decision table has ${decidedIds.length} entries, expected 295`,
    )
  const expected = Array.from(
    { length: 295 },
    (_, i) => `SW-${String(i + 1).padStart(3, '0')}`,
  )
  const decidedSet = new Set(decidedIds)
  for (const id of expected)
    if (!decidedSet.has(id)) throw new Error(`decision table MISSING ${id}`)
  for (const id of decidedIds)
    if (
      !/^SW-\d{3}$/.test(id) ||
      Number(id.slice(3)) < 1 ||
      Number(id.slice(3)) > 295
    )
      throw new Error(`decision table has out-of-range/extra id ${id}`)
  const catalogIds = new Set(catalog.map((c) => c.metric_id))
  for (const id of expected)
    if (!catalogIds.has(id)) throw new Error(`catalog missing ${id}`)

  const schema = new Set(DERIVATIVE_SCHEMA_FIELDS)
  const byId = new Map(catalog.map((c) => [c.metric_id, c]))
  const rows = expected.map((id) => {
    const d = DECISIONS[id]
    const c = byId.get(id)!
    const fields = d.fields ?? []
    if (!CATEGORIES.includes(d.c))
      throw new Error(`${id} invalid category ${d.c}`)
    for (const f of fields)
      if (!schema.has(f))
        throw new Error(`${id} claims non-derivative field "${f}"`)
    const ready =
      d.c === 'semantic_definition_pending' ||
      d.c === 'definition_compatible_now'
    if (fields.length > 0 && !ready)
      throw new Error(`${id} not-ready row must not claim admitted fields`)
    const row: Record<string, unknown> = {
      metric_id: id,
      section: c.section,
      subsection: c.subsection,
      category: d.c,
      requires_ratified_threshold: d.c === 'semantic_definition_pending',
      evaluated: false,
      required_inputs: c.condition,
      admitted_fields_satisfying: fields,
      missing_inputs: d.missing,
      minimum_history: d.history ?? ONE_WEEK,
      join_or_nlp_required: d.join,
      rationale: d.why,
      decided_by: 'explicit',
    }
    if (d.external_required_input)
      row.external_required_input = d.external_required_input
    return row
  })

  const by_category: Record<string, number> = {}
  for (const r of rows)
    by_category[r.category as string] =
      (by_category[r.category as string] ?? 0) + 1
  const idsOf = (cat: string) =>
    rows.filter((r) => r.category === cat).map((r) => r.metric_id as string)

  const out = {
    artifact: 'gate4c1-comm-weekly-capability-delta',
    revision:
      'authoritative-per-id-decision-table-v4 (second shadow repair, no fallback)',
    family: COMM_WEEKLY_FAMILY,
    catalog_ref:
      'docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json',
    decision_table_ref: 'scripts/m1r-comms/comm-capability-decisions.ts',
    admitted_derivative_fields: [...DERIVATIVE_SCHEMA_FIELDS],
    total: rows.length,
    reconciles_to_295: rows.length === 295,
    all_rows_decided_by_explicit: rows.every(
      (r) => r.decided_by === 'explicit',
    ),
    evaluated_count: 0,
    decision_rule:
      'Every row is an EXPLICIT hand-authored decision in the checked-in decision table; the generator only joins it to the catalog to copy/verify the condition + metadata and validates full SW-001..SW-295 coverage + that admitted fields are real derivative fields. No regex/section/acquisition_class inference; no catch-all. admitted_fields_satisfying lists ONLY exact fields from the admitted derivative schema; not-ready rows list none. definition_compatible_now requires a fully-specified value from those fields alone (a threshold-only choice remains a ratification flag but cannot cure unavailable inputs) — none qualifies. semantic_definition_pending = events supported but a numerator/population/window/event-semantic is unresolved. No row is evaluated; SW-132 additionally records an external business-hours calendar and cannot be evaluated until configured/ratified.',
    categories: [...CATEGORIES],
    by_category,
    definition_compatible_now_ids: idsOf('definition_compatible_now'),
    semantic_definition_pending_ids: idsOf('semantic_definition_pending'),
    structured_candidates_reaudited: [
      'SW-019',
      'SW-022',
      'SW-076',
      'SW-132',
      'SW-134',
      'SW-137',
      'SW-138',
    ],
    rows,
  }
  const p = path.join(
    REPO,
    'docs/halo/contract/sw295-comm-capability-delta.json',
  )
  fs.writeFileSync(p, await formatJsonFile(out, p))
  console.log(
    `total=${rows.length} explicit=${out.all_rows_decided_by_explicit} by_category=${JSON.stringify(by_category)}`,
  )
  console.log(
    `semantic_definition_pending(${idsOf('semantic_definition_pending').length})=${idsOf('semantic_definition_pending').join(',')}`,
  )
  console.log(`wrote ${path.relative(REPO, p)}`)
}

void main()
