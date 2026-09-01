/**
 * Gate 4J — alternate read-only CRM report pass reconciliation generator.
 *
 * Reconciles the completed read-only alternate VinSolutions CRM report pass into the five Gate 4H
 * devil's-advocate checks (SW-034, SW-049, SW-050, SW-111, SW-114). Emits two deterministic,
 * aggregate-only, non-PII artifacts:
 *
 *   - gate4j-crm-reconciliation-ledger.json  (internal: report-pass evidence + per-metric state that
 *     SUPERSEDES the Gate 4H required_not_performed seeds + the Service-Dept leakage safety observation)
 *   - gate4j-customer-safe-summary.json       (customer: generic capability-not-measurement summary)
 *
 * Gate 4J promotes NOTHING and modifies NO Gate 4H artifact. It fails closed unless every committed
 * spec is still held (so none of the five could close without a new policy choice), and asserts the
 * portfolio is unchanged: 17 evaluated / 278 unresolved (51 / 834 / 885 cells). Byte-identical rerun.
 * No report was exported; no CRM/browser/schedule was opened here.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { formatJsonFile } from '../m1r-evaluator/serialize'
import {
  GATE4J_STATES,
  RECONCILIATION,
  REPORT_PASS,
  SAFETY_OBSERVATIONS,
  SEEDED_IDS,
  buildCustomerSafeSummary,
} from '@/server/reports/residual/gate4j-crm-reconciliation'

const REPO = process.cwd()
const CONTRACT = path.join(REPO, 'docs/halo/contract')
const OUT = path.join(REPO, 'docs/halo/evidence/m1r/residual')
const GATE4G_MATRIX = path.join(
  CONTRACT,
  'sw295-gate4g-final-residual-matrix.json',
)
const GATE4H_CRM = path.join(OUT, 'gate4h-crm-devils-advocate-ledger.json')
const GATE4H_LEDGER = path.join(
  OUT,
  'gate4h-internal-accountability-ledger.json',
)

const ACCEPTED_WEEK = '2026-08-24..2026-08-30'

const first16 = (p: string) =>
  createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16)
function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T
}
function must(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Gate 4J: ${msg}`)
}

const REQUIRED_HELD = [
  'numerator',
  'denominator',
  'minimum_history',
  'threshold',
  'rank_direction',
]
const HELD = /\(held\)/i

type Gate4gRow = {
  metric_id: string
  condition: string
  frozen_e1_spec: Record<string, string>
}
type Gate4hCrm = {
  seeded_ids: Array<string>
  checks: Array<{ metric_id: string; state: string }>
}
type Gate4hLedger = {
  coverage: { conditions: number; evaluated: number; unresolved: number }
  rows: Array<{ metric_id: string; status: string; gate_origin: string }>
}

async function main(): Promise<void> {
  // ── Report-pass controls: this was a read-only, no-export, no-mutation, no-PII pass ──
  const ctrl = REPORT_PASS.controls_asserted
  must(
    ctrl.report_exported === false &&
      ctrl.customer_row_opened === false &&
      ctrl.crm_mutation === false &&
      ctrl.parameter_change_saved === false &&
      ctrl.pii_retained === false,
    'report-pass controls must all be read-only / no-PII',
  )
  // Deal Performance was Sales-only: Service / Parts Order / Unknown were NOT selected.
  const dp = REPORT_PASS.deal_performance
  must(
    dp.lead_type_selected.length === 8 &&
      dp.lead_type_unselected.includes('Service') &&
      dp.lead_type_unselected.includes('Parts Order'),
    'Deal Performance must be Sales-only (Service/Parts Order unselected)',
  )
  // The Service-Dept leakage safety observation is present and fail-closed.
  must(
    SAFETY_OBSERVATIONS.some(
      (o) =>
        o.id === 'desk-log-service-dept-leakage' &&
        o.severity === 'fail_closed',
    ),
    'the Desk Log Service-Dept leakage safety observation must be recorded fail-closed',
  )

  // ── Committed governance: all five specs must still be HELD ⇒ none closes without a policy choice ──
  const gate4g = readJson<{ rows: Array<Gate4gRow> }>(GATE4G_MATRIX)
  const byId = new Map(gate4g.rows.map((r) => [r.metric_id, r]))
  for (const id of SEEDED_IDS) {
    const row = byId.get(id)
    must(!!row, `${id} missing from committed Gate 4G matrix`)
    for (const f of REQUIRED_HELD)
      must(
        HELD.test(String(row!.frozen_e1_spec[f])),
        `${id} committed spec field ${f} is not held — STOP and re-evaluate (do not close from this pass)`,
      )
  }

  // ── Gate 4H CRM seeds: exactly the five, all required_not_performed (we supersede, not rewrite) ──
  const crm = readJson<Gate4hCrm>(GATE4H_CRM)
  must(
    crm.seeded_ids.length === 5 &&
      SEEDED_IDS.every((id) => crm.seeded_ids.includes(id)),
    'Gate 4H CRM seeds must be exactly the five expected IDs',
  )
  for (const id of SEEDED_IDS) {
    const c = crm.checks.find((x) => x.metric_id === id)
    must(
      !!c && c.state === 'required_not_performed',
      `${id} Gate 4H seed must be required_not_performed (superseded, not rewritten)`,
    )
  }

  // ── Reconciliation records: five, each performed_*, none promoted, none claims a measured value ──
  must(
    RECONCILIATION.length === 5,
    `reconciliation ${RECONCILIATION.length} != 5`,
  )
  const stateTally: Record<string, number> = {}
  for (const r of RECONCILIATION) {
    must(
      SEEDED_IDS.includes(r.metric_id),
      `unexpected reconciliation id ${r.metric_id}`,
    )
    must(
      r.gate4h_seed_state === 'required_not_performed',
      `${r.metric_id} wrong seed state`,
    )
    must(
      r.gate4j_state !== ('required_not_performed' as string),
      `${r.metric_id} still required_not_performed`,
    )
    must(
      r.gate4j_state in GATE4J_STATES,
      `${r.metric_id} unknown gate4j_state ${r.gate4j_state}`,
    )
    must(r.promoted === false, `${r.metric_id} must not be promoted`)
    must(
      r.data_acquired === false,
      `${r.metric_id} must not claim data acquired`,
    )
    must(
      r.value_measured === false,
      `${r.metric_id} must not claim a measured value`,
    )
    must(
      r.missing_is_unknown_never_zero === true,
      `${r.metric_id} must keep missing-unknown-never-zero`,
    )
    must(
      r.exact_remaining_requirement.length > 0,
      `${r.metric_id} must state at least one exact remaining requirement`,
    )
    stateTally[r.gate4j_state] = (stateTally[r.gate4j_state] ?? 0) + 1
  }

  // ── Accounting: committed Gate 4H ledger still 17/278; the five remain unresolved / 4G ──
  const gate4h = readJson<Gate4hLedger>(GATE4H_LEDGER)
  must(
    gate4h.coverage.conditions === 295 &&
      gate4h.coverage.evaluated === 17 &&
      gate4h.coverage.unresolved === 278,
    `committed Gate 4H coverage ${JSON.stringify(gate4h.coverage)} != 295/17/278`,
  )
  for (const id of SEEDED_IDS) {
    const r = gate4h.rows.find((x) => x.metric_id === id)
    must(
      !!r && r.status === 'unresolved' && r.gate_origin === '4G',
      `${id} must remain unresolved / 4G in the committed Gate 4H ledger`,
    )
  }
  const accounting = {
    conditions: 295,
    evaluated: 17,
    unresolved: 278,
    evaluated_cells: 51,
    unresolved_cells: 834,
    total_cells: 885,
    change_from_this_gate:
      'none — Gate 4J promotes nothing; capability was discovered, no data was acquired, no value was measured',
    five_checks_remain_unresolved: [...SEEDED_IDS],
  }
  must(
    accounting.evaluated * 3 === accounting.evaluated_cells &&
      accounting.unresolved * 3 === accounting.unresolved_cells &&
      accounting.evaluated_cells + accounting.unresolved_cells ===
        accounting.total_cells,
    'cell accounting does not reconcile to 51/834/885',
  )

  const customer = buildCustomerSafeSummary()

  // ── Emit internal reconciliation ledger ──
  fs.mkdirSync(OUT, { recursive: true })
  const internalLedger = {
    artifact: 'gate4j-crm-reconciliation-ledger',
    revision: 'J1',
    accepted_week: ACCEPTED_WEEK,
    pass_rooftop: REPORT_PASS.rooftop,
    pass_rooftop_name: REPORT_PASS.rooftop_name,
    observed_on: REPORT_PASS.observed_on,
    supersession:
      'These five reconciliation records SUPERSEDE the Gate 4H required_not_performed CRM seed states as of 2026-09-01. Gate 4H artifacts are NOT modified; Gate 4H remains a truthful historical snapshot (it opened no CRM access).',
    promotion_statement:
      'Gate 4J promotes NOTHING. Capability was discovered; no data was acquired; no value was measured. Portfolio unchanged: 17 evaluated / 278 unresolved.',
    accounting,
    capability_vs_data:
      'Capability discovered (a report route or schema exists) is strictly distinguished from data acquired (a governed, dated, PII-safe pull). None of the five had data acquired. Missing remains UNKNOWN, never zero.',
    gate4j_states: GATE4J_STATES,
    state_tally: stateTally,
    report_pass: REPORT_PASS,
    safety_observations: SAFETY_OBSERVATIONS,
    reconciliation: RECONCILIATION,
  }
  const internalPath = path.join(OUT, 'gate4j-crm-reconciliation-ledger.json')
  fs.writeFileSync(
    internalPath,
    await formatJsonFile(internalLedger, internalPath),
  )

  // ── Emit customer-safe summary ──
  const customerArtifact = {
    artifact: 'gate4j-customer-safe-summary',
    revision: 'J1',
    accepted_week: ACCEPTED_WEEK,
    scope_note:
      'Sales-only, aggregate-only, read-only. Capability findings only — additional CRM report routes were identified; no value was measured. No internal controls, report titles, or PII are exposed.',
    summary: customer,
  }
  const customerPath = path.join(OUT, 'gate4j-customer-safe-summary.json')
  fs.writeFileSync(
    customerPath,
    await formatJsonFile(customerArtifact, customerPath),
  )

  console.log(
    `Gate 4J: 5 CRM checks reconciled (superseding required_not_performed); promotes nothing; 17/278 = 51/834/885 unchanged`,
  )
  console.log(`state tally: ${JSON.stringify(stateTally)}`)
  console.log(
    `safety: ${SAFETY_OBSERVATIONS.map((o) => `${o.id}(${o.severity})`).join(', ')}`,
  )
  console.log(
    `hashes: internal ${first16(internalPath)}, customer ${first16(customerPath)}`,
  )
  console.log(
    `wrote ${path.relative(REPO, internalPath)}, ${path.relative(REPO, customerPath)}`,
  )
}

void main()
