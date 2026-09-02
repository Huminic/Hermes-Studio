/**
 * PKT-02-01 packet-execution engine.
 *
 * Executes exactly SW-011..015 for Serra Honda 21043 Sales, end to end, from the
 * frozen authority binding + the reused accepted Leads evidence. It:
 *   - asserts the frozen binding sha + packet authority pointer (fail-closed);
 *   - reuses the sha-verified Honda-21043 Leads bytes (Sales-only, dealer-isolated);
 *   - computes SW-011/012/015 via the accepted evaluators, then INDEPENDENTLY
 *     recomputes each value from the primitives AND cross-checks the persisted
 *     Gate-4A/5b accepted value — any disagreement throws (reject, never massage);
 *   - binds each computation's formula/unit/source-fields to the frozen binding;
 *   - grades measured metrics against the frozen operational targets;
 *   - holds SW-013/014 open as source_investigation_pending via a finite field
 *     inventory (exact missing fields; no proxy/derivation);
 *   - builds observations, evaluations, findings, a two-delta proof, and UNSENT
 *     alert simulations (valid measured metrics only);
 *   - is deterministic + idempotent: content_sha256 excludes wall-clock, run_key
 *     derives from inputs only.
 *
 * Pure compute + read-only inputs. No network, no production, no delivery, no PII.
 */
import fs from 'node:fs'
import path from 'node:path'
import { EVALUATORS } from '../evaluator/evaluators'
import { LEADS_HEADERS } from '../leads/leads-family-contract'
import {
  FROZEN_BINDING_SHA256,
  getMetricBinding,
  loadBinding,
  loadPacket,
} from './binding'
import { canonicalJson, sha256Hex } from './canonical'
import { loadHondaLeadsInput } from './leads-input'
import { inventorySourceFields } from './source-inventory'
import type { LeadsInput } from './leads-input'
import type { Binding, MetricBinding, PacketDoc } from './binding'
import type { Candidate, HeldBundle } from '../evaluator/evaluators'
import type { SourceInventory } from './source-inventory'

export class PacketEngineError extends Error {}

export const PACKET_ID = 'PKT-02-01'
export const MEASURED_IDS = ['SW-011', 'SW-012', 'SW-015'] as const
export const PENDING_IDS = ['SW-013', 'SW-014'] as const
export const SOURCE_ID = 'SRC-vinsolutions_custom_reporting_leads-0001'

export type Observation = {
  metric_id: string
  period: string
  status: 'measured' | 'source_investigation_pending'
  calculation_kind: string
  value: number | null
  unit: string
  numerator: number | null
  denominator: number | null
  missing: number | null
  formula: string | null
  source_fields: Array<string>
  source_lineage: {
    source_id: string
    source_sha256: string | null
    schema_contract_sha256: string | null
    receipt_sha256: string | null
    dealer_id: string
    period: string
    row_key: string | null
  }
  confidence: string
  gradable: boolean
  detail: Record<string, unknown> | null
  source_investigation: SourceInventory | null
}

export type Evaluation = {
  metric_id: string
  period: string
  gradable_state: 'graded' | 'withheld'
  threshold_id: string | null
  comparator: string | null
  threshold: number | null
  reference_id: string | null
  grade_target_id: string | null
  detection_rule: string | null
  detection_fired: boolean | null
  rating: 'breach' | 'healthy' | 'withheld'
  reason: string | null
}

export type Finding = {
  metric_id: string
  period: string
  severity: 'breach' | 'healthy' | 'pending'
  headline: string
  detail: string
}

export type MeaningDelta = {
  metric_id: string
  state: 'measured' | 'source_investigation_pending'
  normalized: string
  value: string
  grade: string
  narrative: string
}

export type TwoDelta = {
  evidence_delta: {
    source_id: string
    source_sha256: string
    bytes: number
    schema_contract_sha256: string
    receipt_sha256: string
    dealer_id: string
    period: string
    row_reconciliation: string
    sales_only_proof: string
    missing_rule: string
  }
  meaning_delta: Array<MeaningDelta>
}

export type AlertSimulation = {
  metric_id: string
  would_fire: boolean
  channel: 'simulated_none'
  delivered: false
  unsent: true
  message: string
}

export type Reconciliation = {
  ok: boolean
  metrics: Array<{
    metric_id: string
    independent: number
    evaluator: number
    persisted_accepted: number
    numerator: number
    denominator: number
    match: boolean
  }>
}

export type PacketRun = {
  artifact: 'honda-watchdog-pkt-02-01-run'
  packet_id: string
  module: number
  dealer_id: string
  period: string
  binding_sha256: string
  source_sha256: string
  engine_version: string
  as_of: string
  run_key: string
  content_sha256: string
  lifecycle_partition: Record<string, Array<string>>
  observations: Array<Observation>
  evaluations: Array<Evaluation>
  findings: Array<Finding>
  two_delta: TwoDelta
  alert_simulations: Array<AlertSimulation>
  reconciliation: Reconciliation
}

type AcceptedFact = {
  value: number
  numerator: number | null
  denominator: number | null
  rating: string
}

/** Recursively collect the persisted accepted facts (value/num/den/rating) keyed
 *  by metric_id from the Gate-5b report model — the independent cross-check set. */
function loadAcceptedFacts(repoRoot: string): Record<string, AcceptedFact> {
  const p = path.join(
    repoRoot,
    'docs/halo/evidence/m1r/gate5b/gate5b-report-model-21043.json',
  )
  const doc = JSON.parse(fs.readFileSync(p, 'utf8'))
  const out: Record<string, AcceptedFact> = {}
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (node && typeof node === 'object') {
      const o = node as Record<string, unknown>
      if (
        typeof o.metric_id === 'string' &&
        typeof o.value === 'number' &&
        !(o.metric_id in out)
      ) {
        const ev = (o.evidence ?? {}) as Record<string, unknown>
        out[o.metric_id] = {
          value: o.value,
          numerator: typeof ev.numerator === 'number' ? ev.numerator : null,
          denominator:
            typeof ev.denominator === 'number' ? ev.denominator : null,
          rating: typeof o.rating === 'string' ? o.rating : 'unknown',
        }
      }
      for (const v of Object.values(o)) walk(v)
    }
  }
  walk(doc)
  return out
}

const sortedSet = (xs: Array<string>): Array<string> =>
  [...new Set(xs)].sort((a, b) => a.localeCompare(b))

/** Alias-normalize a source field per the binding's single explicit alias map. */
function applyAlias(binding: Binding, field: string): string {
  return binding.alias_map[field] ?? field
}

function packetMetricDef(
  packet: PacketDoc,
  id: string,
): Record<string, unknown> {
  const d = packet.metric_definitions.find((m) => m.metric_id === id)
  if (!d)
    throw new PacketEngineError(`packet has no metric definition for ${id}`)
  return d
}

/** Independent recompute of a measured value straight from the primitives — a
 *  second code path that must agree with the evaluator and the persisted value. */
function independentValue(
  id: string,
  l: LeadsInput['metrics'],
): {
  value: number
  numerator: number
  denominator: number
} {
  switch (id) {
    case 'SW-011':
      if (l.median_response_min === null)
        throw new PacketEngineError(
          'SW-011 has no median (missing is not zero)',
        )
      return {
        value: l.median_response_min,
        numerator: l.response_numeric,
        denominator: l.business_hours_population,
      }
    case 'SW-012':
      if (l.business_hours_population <= 0)
        throw new PacketEngineError('SW-012 zero denominator (withheld)')
      return {
        value: l.untouched_strict / l.business_hours_population,
        numerator: l.untouched_strict,
        denominator: l.business_hours_population,
      }
    case 'SW-015':
      if (l.reps_with_numeric <= 0)
        throw new PacketEngineError('SW-015 zero denominator (withheld)')
      return {
        value: l.triggered_reps / l.reps_with_numeric,
        numerator: l.triggered_reps,
        denominator: l.reps_with_numeric,
      }
    default:
      throw new PacketEngineError(`no independent recompute for ${id}`)
  }
}

function detectionFires(
  comparator: string,
  value: number,
  threshold: number,
): boolean {
  switch (comparator) {
    case '>':
      return value > threshold
    case '>=':
      return value >= threshold
    case '<':
      return value < threshold
    case '<=':
      return value <= threshold
    default:
      throw new PacketEngineError(`unsupported comparator: ${comparator}`)
  }
}

export function executePacket(opts: {
  repoRoot: string
  leadsDir?: string
  asOf: string
  engineVersion: string
}): PacketRun {
  const { repoRoot, asOf, engineVersion } = opts

  // 1. Frozen authority.
  const { binding, sha256: bindingSha } = loadBinding(repoRoot)
  if (bindingSha !== FROZEN_BINDING_SHA256)
    throw new PacketEngineError('binding sha drift')
  const packet = loadPacket(repoRoot)
  const period = packet.period

  // 2. Reused accepted Honda-21043 leads (sha-verified, Sales-only).
  const input = loadHondaLeadsInput({ repoRoot, leadsDir: opts.leadsDir })
  const l = input.metrics
  const bundle: HeldBundle = {
    appointments: null,
    crm: null,
    dashboard: null,
    leads: l,
  }
  const accepted = loadAcceptedFacts(repoRoot)

  const observations: Array<Observation> = []
  const evaluations: Array<Evaluation> = []
  const findings: Array<Finding> = []
  const meaning: Array<MeaningDelta> = []
  const alerts: Array<AlertSimulation> = []
  const recMetrics: Reconciliation['metrics'] = []

  const lineageBase = {
    source_id: SOURCE_ID,
    source_sha256: input.sourceSha256,
    schema_contract_sha256: input.lineage.schema_contract_sha256,
    receipt_sha256: input.lineage.receipt_sha256,
    dealer_id: input.dealerId,
    period,
    row_key: `${input.lineage.row_key.field} (${input.lineage.row_key.unique} unique)`,
  }

  // 3. Measured metrics.
  for (const id of MEASURED_IDS) {
    const mb: MetricBinding = getMetricBinding(binding, id)
    const def = packetMetricDef(packet, id)
    const res = EVALUATORS[id as keyof typeof EVALUATORS](bundle)
    if (!res.ok)
      throw new PacketEngineError(
        `measured metric ${id} not evaluable: ${res.reason}`,
      )
    const cand: Candidate = res

    // Bind computation to the frozen authority (formula/unit/source-fields).
    if (cand.formula !== mb.formula)
      throw new PacketEngineError(
        `${id} formula drift vs binding: ${cand.formula} != ${mb.formula}`,
      )
    if (cand.unit !== mb.unit)
      throw new PacketEngineError(
        `${id} unit drift vs binding: ${cand.unit} != ${mb.unit}`,
      )
    const candFields = sortedSet(
      cand.source_fields.map((f) => applyAlias(binding, f)),
    )
    const bindFields = sortedSet(mb.direct_source_fields)
    if (canonicalJson(candFields) !== canonicalJson(bindFields))
      throw new PacketEngineError(
        `${id} source-field drift vs binding: ${JSON.stringify(candFields)} != ${JSON.stringify(bindFields)}`,
      )

    // Independent recompute + persisted cross-check (reject any mismatch).
    const ind = independentValue(id, l)
    if (!(id in accepted))
      throw new PacketEngineError(`no persisted accepted fact for ${id}`)
    const persisted = accepted[id]
    const valueMatch = ind.value === cand.value && ind.value === persisted.value
    const numMatch =
      ind.numerator === cand.numerator &&
      (persisted.numerator === null || persisted.numerator === ind.numerator)
    const denMatch =
      ind.denominator === cand.denominator &&
      (persisted.denominator === null ||
        persisted.denominator === ind.denominator)
    const match = valueMatch && numMatch && denMatch
    if (!match)
      throw new PacketEngineError(
        `${id} reconciliation mismatch: independent=${ind.value}/${ind.numerator}/${ind.denominator} evaluator=${cand.value}/${cand.numerator}/${cand.denominator} persisted=${persisted.value}/${persisted.numerator}/${persisted.denominator}`,
      )
    recMetrics.push({
      metric_id: id,
      independent: ind.value,
      evaluator: cand.value,
      persisted_accepted: persisted.value,
      numerator: ind.numerator,
      denominator: ind.denominator,
      match,
    })

    // Grade against the frozen operational target.
    if (!mb.ot_anchor)
      throw new PacketEngineError(`${id} measured but has no ot_anchor`)
    const fired = detectionFires(
      mb.ot_anchor.comparator,
      cand.value,
      mb.ot_anchor.threshold,
    )
    const rating: 'breach' | 'healthy' = fired ? 'breach' : 'healthy'
    const th = def.detection_threshold_contract as Record<string, unknown>
    const cr = def.comparison_reference_contract as Record<string, unknown>

    observations.push({
      metric_id: id,
      period,
      status: 'measured',
      calculation_kind: mb.calculation_kind,
      value: cand.value,
      unit: cand.unit,
      numerator: cand.numerator,
      denominator: cand.denominator,
      missing: id === 'SW-011' ? l.response_missing : null,
      formula: cand.formula,
      source_fields: cand.source_fields,
      source_lineage: lineageBase,
      confidence: String(def.confidence ?? 'medium'),
      gradable: Boolean(def.gradable),
      detail: cand.detail,
      source_investigation: null,
    })
    evaluations.push({
      metric_id: id,
      period,
      gradable_state: 'graded',
      threshold_id: String(th.threshold_id ?? mb.ot_anchor.baseline_id),
      comparator: mb.ot_anchor.comparator,
      threshold: mb.ot_anchor.threshold,
      reference_id: String(cr.reference_id ?? ''),
      grade_target_id: mb.grade_target_id,
      detection_rule: mb.detection_rule,
      detection_fired: fired,
      rating,
      reason: null,
    })
    findings.push({
      metric_id: id,
      period,
      severity: rating,
      headline:
        rating === 'breach'
          ? `${id} breaches ${mb.ot_anchor.baseline_id} (${mb.ot_anchor.comparator} ${mb.ot_anchor.threshold} ${mb.ot_anchor.unit})`
          : `${id} within ${mb.ot_anchor.baseline_id} target`,
      detail: `${mb.business_question} value=${cand.value} ${cand.unit}; numerator=${cand.numerator}; denominator=${cand.denominator}.`,
    })
    alerts.push({
      metric_id: id,
      would_fire: fired,
      channel: 'simulated_none',
      delivered: false,
      unsent: true,
      message: fired
        ? `[SIMULATED — NOT SENT] ${id} would trigger: ${mb.detection_rule} (value ${cand.value} ${cand.unit}).`
        : `[SIMULATED — NOT SENT] ${id} within target; no trigger (value ${cand.value} ${cand.unit}).`,
    })
    meaning.push({
      metric_id: id,
      state: 'measured',
      normalized: `numeric primitives from ${input.lineage.row_key.unique} rows (business-hours population ${l.business_hours_population}; missing preserved)`,
      value: `${cand.value} ${cand.unit} (numerator ${cand.numerator} / denominator ${cand.denominator})`,
      grade: `${mb.grade_target_id}: ${mb.ot_anchor.comparator} ${mb.ot_anchor.threshold} -> ${rating}`,
      narrative: String(def.explainability_ref ?? ''),
    })
  }

  // 4. Source-investigation-pending metrics (SW-013/014).
  for (const id of PENDING_IDS) {
    const mb = getMetricBinding(binding, id)
    const def = packetMetricDef(packet, id)
    const inv = inventorySourceFields(id, LEADS_HEADERS)
    if (inv.disposition !== 'source_investigation_pending')
      throw new PacketEngineError(
        `${id} expected source_investigation_pending but inventory said ${inv.disposition}`,
      )
    observations.push({
      metric_id: id,
      period,
      status: 'source_investigation_pending',
      calculation_kind: mb.calculation_kind,
      value: null,
      unit: mb.unit,
      numerator: null,
      denominator: null,
      missing: null,
      formula: null,
      source_fields: [],
      source_lineage: {
        source_id: SOURCE_ID,
        source_sha256: null,
        schema_contract_sha256: input.lineage.schema_contract_sha256,
        receipt_sha256: null,
        dealer_id: input.dealerId,
        period,
        row_key: null,
      },
      confidence: 'not_applicable',
      gradable: Boolean(def.gradable),
      detail: null,
      source_investigation: inv,
    })
    evaluations.push({
      metric_id: id,
      period,
      gradable_state: 'withheld',
      threshold_id: null,
      comparator: null,
      threshold: null,
      reference_id: null,
      grade_target_id: mb.grade_target_id,
      detection_rule: null,
      detection_fired: null,
      rating: 'withheld',
      reason: `source_investigation_pending: missing direct fields [${inv.missing_fields.join(', ')}]; no proxy/derivation; incompatible target (no approved OT).`,
    })
    findings.push({
      metric_id: id,
      period,
      severity: 'pending',
      headline: `${id} held open — required source fields absent`,
      detail: inv.evidence,
    })
    meaning.push({
      metric_id: id,
      state: 'source_investigation_pending',
      normalized: `searched ${inv.searched_universe.length} accepted Leads headers`,
      value: 'withheld (no value derived)',
      grade: 'withheld (no approved target; incompatible)',
      narrative: String(def.explainability_ref ?? ''),
    })
  }

  const two_delta: TwoDelta = {
    evidence_delta: {
      source_id: SOURCE_ID,
      source_sha256: input.sourceSha256,
      bytes: input.bytes,
      schema_contract_sha256: input.lineage.schema_contract_sha256,
      receipt_sha256: input.lineage.receipt_sha256,
      dealer_id: input.dealerId,
      period,
      row_reconciliation: `${input.lineage.row_key.unique} of ${input.metrics.total_rows}`,
      sales_only_proof: input.lineage.sales_only_proof,
      missing_rule:
        'blanks preserved as missing (never zero); coverage_numeric + missing == business-hours population',
    },
    meaning_delta: meaning,
  }

  const reconciliation: Reconciliation = {
    ok: recMetrics.every((m) => m.match),
    metrics: recMetrics,
  }

  const lifecycle_partition = packet.lifecycle_partition

  // Deterministic content hash (excludes wall-clock as_of + run_key + itself).
  const content = {
    packet_id: PACKET_ID,
    module: packet.module,
    dealer_id: input.dealerId,
    period,
    binding_sha256: bindingSha,
    source_sha256: input.sourceSha256,
    engine_version: engineVersion,
    lifecycle_partition,
    observations,
    evaluations,
    findings,
    two_delta,
    alert_simulations: alerts,
    reconciliation,
  }
  const content_sha256 = sha256Hex(canonicalJson(content))
  const run_key = sha256Hex(
    [PACKET_ID, bindingSha, input.sourceSha256, period, engineVersion].join(
      '|',
    ),
  )

  return {
    artifact: 'honda-watchdog-pkt-02-01-run',
    packet_id: PACKET_ID,
    module: packet.module,
    dealer_id: input.dealerId,
    period,
    binding_sha256: bindingSha,
    source_sha256: input.sourceSha256,
    engine_version: engineVersion,
    as_of: asOf,
    run_key,
    content_sha256,
    lifecycle_partition,
    observations,
    evaluations,
    findings,
    two_delta,
    alert_simulations: alerts,
    reconciliation,
  }
}
