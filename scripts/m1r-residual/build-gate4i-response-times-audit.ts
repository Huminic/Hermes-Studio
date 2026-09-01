/**
 * Gate 4I — VinSolutions Response Times measured-unscored generator.
 *
 * Ingests the completed real read-only browser capture (three governed Sales rooftops) and emits two
 * deterministic, aggregate-only, non-PII, non-rep-name artifacts:
 *
 *   - gate4i-response-times-measured-unscored-ledger.json  (internal: provenance + chain-of-custody +
 *     transcribed aggregates + independently-recomputed SW-013 figures + the non-promotion decisions
 *     for SW-013 / SW-016 / SW-017, each tied to committed governance)
 *   - gate4i-customer-safe-observations.json               (customer: observed_fact / inference /
 *     hypothesis, recoverable-lead-opportunity framing only, no rep name, no ROI, no cars-sold)
 *
 * Gate 4I promotes NOTHING. The portfolio stays 17 evaluated / 278 unresolved (51 / 834 / 885 cells).
 * It fails closed on any provenance, count, boundary, accounting, promotability, or leakage divergence
 * and is byte-identical on rerun. No CSV/XLSX is read; no browser/CRM/schedule is opened here.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { formatJsonFile } from '../m1r-evaluator/serialize'
import {
  CAPTURE,
  DEALERS,
  EXPECTED_GOOD_LEADS,
  GOVERNED_ROOFTOPS,
  MEASURED_UNSCORED_CONTRACT,
  REQUIRED_SOURCE_HOST,
  SUPPLEMENTAL_METRIC_IDS,
  buildCustomerObservation,
  heldSpecFields,
  isPromotableFromCapture,
} from '@/server/reports/residual/gate4i-response-times'

const REPO = process.cwd()
const CONTRACT = path.join(REPO, 'docs/halo/contract')
const OUT = path.join(REPO, 'docs/halo/evidence/m1r/residual')
const GATE4G_MATRIX = path.join(
  CONTRACT,
  'sw295-gate4g-final-residual-matrix.json',
)
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
  if (!cond) throw new Error(`Gate 4I: ${msg}`)
}

type Gate4gRow = {
  metric_id: string
  condition: string
  blocker_class: string
  primary_blocker: string
  frozen_e1_spec: Record<string, string>
}
type Gate4hLedger = {
  coverage: { conditions: number; evaluated: number; unresolved: number }
  rows: Array<{ metric_id: string; status: string; gate_origin: string }>
}

async function main(): Promise<void> {
  // ── Provenance / controls (fail-closed) ──
  must(
    CAPTURE.source_host === REQUIRED_SOURCE_HOST &&
      new URL(CAPTURE.source_url).host === REQUIRED_SOURCE_HOST,
    `capture host must be ${REQUIRED_SOURCE_HOST}`,
  )
  must(
    CAPTURE.controls.lead_type_selected === 'Sales' &&
      CAPTURE.controls.service_parts_selected === false &&
      CAPTURE.controls.service_selected === false &&
      CAPTURE.controls.parts_selected === false,
    'controls must be Sales-only (Service/Parts not selected)',
  )
  must(
    CAPTURE.controls.external_mutation === false,
    'capture must be read-only (no external mutation)',
  )
  must(
    CAPTURE.raw_evidence.byte_count === 39173 &&
      /^[0-9a-f]{64}$/.test(CAPTURE.raw_evidence.sha256),
    'raw evidence chain-of-custody (byte count + sha256) must be recorded',
  )

  // ── Good-Lead counts: responded population must exactly equal Good Leads (cross-check) ──
  must(DEALERS.length === 3, `dealers ${DEALERS.length} != 3`)
  for (const d of DEALERS) {
    must(
      GOVERNED_ROOFTOPS.includes(
        d.dealer_id as (typeof GOVERNED_ROOFTOPS)[number],
      ),
      `unexpected dealer ${d.dealer_id}`,
    )
    const expected = EXPECTED_GOOD_LEADS[d.dealer_id]
    must(
      d.current.good.n === expected && d.current.total_responded === expected,
      `${d.dealer_id} good/responded ${d.current.good.n}/${d.current.total_responded} != ${expected}`,
    )
    // Aggregate internal consistency. Per the report definition "Bad Leads includes Duplicate leads",
    // so duplicate ⊆ bad and good + bad = total_leads.
    must(
      d.current.good.n + d.current.bad.n === d.current.total_leads &&
        d.current.duplicate.n <= d.current.bad.n,
      `${d.dealer_id} current buckets do not reconcile (good+bad=total; duplicate⊆bad)`,
    )
    must(
      d.current.within_15m.n +
        d.current.within_30m.n +
        d.current.over_30m.n +
        d.current.no_response.n ===
        d.current.total_responded,
      `${d.dealer_id} response buckets do not reconcile to total_responded`,
    )
    must(
      d.current.no_response.n === 0,
      `${d.dealer_id} responded population must have 0 no-response rows`,
    )
    // After-hours SUPPLEMENTAL rate re-derives from its own denominator/breaches (transcription check).
    const ah = d.after_hours_late_response
    must(
      ah.denominator >= ah.breaches && ah.denominator <= expected,
      `${d.dealer_id} after-hours denominator out of range`,
    )
    must(
      Math.abs(round1((ah.breaches / ah.denominator) * 100) - ah.rate_pct) <
        0.05,
      `${d.dealer_id} after-hours rate ${ah.rate_pct} != recomputed`,
    )
    const wk = d.weekend_supplemental_open_plus_15
    must(
      Math.abs(round1((wk.breaches / wk.denominator) * 100) - wk.rate_pct) <
        0.05,
      `${d.dealer_id} weekend supplemental rate ${wk.rate_pct} != recomputed`,
    )
  }

  // ── Committed governance: SW-013/016/017 spec must be HELD ⇒ NOT promotable from this capture ──
  const gate4g = readJson<{ rows: Array<Gate4gRow> }>(GATE4G_MATRIX)
  const byId = new Map(gate4g.rows.map((r) => [r.metric_id, r]))
  const decisions = SUPPLEMENTAL_METRIC_IDS.map((id) => {
    const row = byId.get(id)
    must(!!row, `${id} missing from committed Gate 4G matrix`)
    const spec = row!.frozen_e1_spec
    const held = heldSpecFields(spec)
    const promotable = isPromotableFromCapture(
      spec,
      String(spec.rank_direction),
    )
    // Goal: do NOT promote unless an already-committed RESOLVED baseline/rank exists. It does not.
    must(
      !promotable,
      `${id} would be promotable — committed spec resolved unexpectedly; STOP and re-evaluate (do not invent a baseline)`,
    )
    return {
      metric_id: id,
      condition: row!.condition,
      committed_blocker_class: row!.blocker_class,
      committed_primary_blocker: row!.primary_blocker,
      promoted: false,
      held_spec_fields: held,
      committed_rank_direction: spec.rank_direction,
    }
  })

  // Per-metric non-promotion reasons (each independently sufficient; tied to committed state).
  const sw013Reasons = [
    'Committed frozen_e1_spec is entirely unresolved (held): numerator, denominator, event_sequence, window, threshold, minimum_sample, minimum_history, ambiguity_handling and unit are all held, and rank_direction is not_applicable (held). No ratified metric spec and no committed baseline/rank to score or rank against.',
    'Definition mismatch: the committed SW-013 condition is "After-hours leads with NO response by opening +15 min." (a no-response population). This capture measures LATE response among good leads that WERE responded to (Response later than Actionable +15) — a different population and event. Promoting would require altering the committed definition to fit the data, which the goal forbids.',
    'The committed promotion-probe already ruled SW-013 not_promotable / definition_compatible:false (dashboard AVERAGE not the definitional median; after-hours filtering changes the population; blank responders excluded), and the committed acquisition-contract marks the readonly_browser_capture route candidate_unproved / closes_cells_only_when_proved:true. This capture resolves neither median-vs-average, a business-hours calendar, nor an untouched-lead policy.',
  ]
  const sw016Reasons = [
    'Committed frozen_e1_spec is entirely unresolved (held). The weekend open+15 figures are SUPPLEMENTAL only: the committed SW-016 SLA definition is unratified and there is no holiday/business calendar.',
  ]
  const sw017Reasons = [
    'Evidence absent: the Response Times table does not identify phone lead origin or an outbound call attempt, so SW-017 (phone leads with no outbound call attempt within 5 minutes) cannot be measured. Missing is never zero.',
  ]
  const reasonsById: Record<string, Array<string>> = {
    'SW-013': sw013Reasons,
    'SW-016': sw016Reasons,
    'SW-017': sw017Reasons,
  }

  // ── Accounting: committed Gate 4H ledger must still show 17/278 and SW-013/016/017 unresolved/4G ──
  const gate4h = readJson<Gate4hLedger>(GATE4H_LEDGER)
  must(
    gate4h.coverage.conditions === 295 &&
      gate4h.coverage.evaluated === 17 &&
      gate4h.coverage.unresolved === 278,
    `committed Gate 4H coverage ${JSON.stringify(gate4h.coverage)} != 295/17/278`,
  )
  for (const id of SUPPLEMENTAL_METRIC_IDS) {
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
    change_from_this_gate: 'none — Gate 4I promotes nothing',
    supplemental_ids_remain_unresolved: [...SUPPLEMENTAL_METRIC_IDS],
  }
  must(
    accounting.evaluated * 3 === accounting.evaluated_cells &&
      accounting.unresolved * 3 === accounting.unresolved_cells &&
      accounting.evaluated_cells + accounting.unresolved_cells ===
        accounting.total_cells,
    'cell accounting does not reconcile to 51/834/885',
  )

  // ── Customer-safe observations (built + asserted safe in the pure module) ──
  const observations = DEALERS.map(buildCustomerObservation)

  // ── Emit internal measured-unscored ledger ──
  fs.mkdirSync(OUT, { recursive: true })
  const internalLedger = {
    artifact: 'gate4i-response-times-measured-unscored-ledger',
    revision: 'I1',
    accepted_week: ACCEPTED_WEEK,
    governed_rooftops: [...GOVERNED_ROOFTOPS],
    promotion_statement:
      'Gate 4I promotes NOTHING. SW-013, SW-016 and SW-017 remain UNRESOLVED (Gate-4G HOLD). Portfolio unchanged: 17 evaluated / 278 unresolved.',
    accounting,
    capture: CAPTURE,
    measured_unscored_contract: MEASURED_UNSCORED_CONTRACT,
    independent_recompute: {
      metric_id: 'SW-013',
      method:
        'The after-hours late-response denominator/breaches/rate was independently recomputed from the retained raw responded-row timestamps (Received < Actionable ⇒ after-hours; Response > Actionable +15 ⇒ breach) and exactly matched the captured derived_checks.',
      claim_layer: MEASURED_UNSCORED_CONTRACT.claim_layer_for_figures,
      by_dealer: DEALERS.map((d) => ({
        dealer_id: d.dealer_id,
        dealer: d.dealer,
        denominator: d.after_hours_late_response.denominator,
        breaches: d.after_hours_late_response.breaches,
        rate_pct: d.after_hours_late_response.rate_pct,
      })),
    },
    supplemental_aggregates: DEALERS.map((d) => ({
      dealer_id: d.dealer_id,
      dealer: d.dealer,
      current: d.current,
      comparison: d.comparison,
      after_hours_late_response: d.after_hours_late_response,
      weekend_supplemental_open_plus_15: d.weekend_supplemental_open_plus_15,
    })),
    decisions: decisions.map((dec) => ({
      ...dec,
      non_promotion_reasons: reasonsById[dec.metric_id],
    })),
  }
  const internalPath = path.join(
    OUT,
    'gate4i-response-times-measured-unscored-ledger.json',
  )
  fs.writeFileSync(
    internalPath,
    await formatJsonFile(internalLedger, internalPath),
  )

  // ── Emit customer-safe observations ──
  const customerArtifact = {
    artifact: 'gate4i-customer-safe-observations',
    revision: 'I1',
    accepted_week: ACCEPTED_WEEK,
    governed_rooftops: [...GOVERNED_ROOFTOPS],
    scope_note:
      'Sales-only, aggregate-only, read-only. These are supplemental measured observations for the governed week — NOT scored or ranked watchdog metrics. They describe recoverable lead-response opportunity only; no cars-sold or ROI estimate is made (no accepted same-period close-rate denominator or formula exists). No rep names or customer identities are included.',
    claim_layer_separation: {
      observed_fact: MEASURED_UNSCORED_CONTRACT.definition,
      inference:
        'A defensible conclusion drawn FROM the observed facts (e.g. a recoverable opportunity). Interpretation, never a measurement or a promise.',
      hypothesis:
        'A plausible but unverified explanation that needs more evidence before action. Never presented as fact.',
    },
    withheld: {
      score_rank_variance:
        'Withheld pending a ratified baseline / minimum-sample / rank rule for SW-013, SW-016 and SW-017. Missing baseline is not missing data and is never zero.',
    },
    observations,
  }
  const customerPath = path.join(OUT, 'gate4i-customer-safe-observations.json')
  fs.writeFileSync(
    customerPath,
    await formatJsonFile(customerArtifact, customerPath),
  )

  console.log(
    `Gate 4I: 3 rooftops ingested; promotes nothing; 17 evaluated / 278 unresolved (51/834/885 cells) unchanged`,
  )
  console.log(
    `SW-013/016/017 held spec fields: ${JSON.stringify(
      decisions.map((d) => ({
        id: d.metric_id,
        held: d.held_spec_fields.length,
      })),
    )}`,
  )
  console.log(
    `after-hours late-response (measured_unscored): ${DEALERS.map(
      (d) => `${d.dealer_id} ${d.after_hours_late_response.rate_pct}%`,
    ).join(', ')}`,
  )
  console.log(
    `hashes: internal ${first16(internalPath)}, customer ${first16(customerPath)}`,
  )
  console.log(
    `wrote ${path.relative(REPO, internalPath)}, ${path.relative(REPO, customerPath)}`,
  )
}

function round1(x: number): number {
  return Math.round(x * 10) / 10
}

void main()
