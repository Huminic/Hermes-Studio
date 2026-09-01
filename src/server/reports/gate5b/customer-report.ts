/**
 * Gate 5B — standalone customer-report assembler (the ONLY input contract for the future PDF generator).
 *
 * This module builds the full per-dealer report model from customer artifacts ALONE: a dealer's Gate 5B
 * synthesis bundle plus that dealer's partition of the Gate 5B 295×3 customer appendix. It deliberately
 * imports NOTHING from Gate 5A, the internal audit, raw evidence, or any hidden controller file — a
 * fresh process can consume the customer JSON and nothing else.
 *
 * It fails closed on duplicates, missing IDs, incomplete facts, mixed dealers, or coverage that is not
 * exactly 295 (17 fully-structured evaluated facts + 278 not-measured entries). Not-measured entries
 * remain missing — never zero.
 */

export type CustomerFactLike = {
  claim: string
  metric_id: string
  label: string
  value: number
  value_display: string
  unit: string
  operational_target: {
    kind: string
    value: number
    value_display: string
    comparator: string
    direction: string
  }
  variance: { native: number; display: string }
  rating: string
  peer_rank: { rank: number; tie: boolean; of: number }
  confidence: string
  evidence: {
    source: string
    period: { start: string; end: string }
    freshness: string
    numerator: number
    denominator: number
  }
  industry_reference: unknown
  text: string
}

export type NotMeasuredEntry = {
  metric_id: string
  measure: string
  note: string
  next_visibility_unlock: string
}

export type AppendixCell = {
  metric_id: string
  dealer_id: string
  status: 'evaluated' | 'not_measured'
  measure?: string
  note?: string
  next_visibility_unlock?: string
  confidence?: string
  source?: string
  freshness?: string
  value?: unknown
}

export type DealerBundleLike = {
  dealer_id: string
  clusters: Array<{ facts: Array<CustomerFactLike> }>
}

export type CustomerReportModel = {
  dealer_id: string
  coverage: number
  evaluated: Array<CustomerFactLike>
  not_measured: Array<NotMeasuredEntry>
}

const EXPECTED_EVALUATED = 17
const EXPECTED_NOT_MEASURED = 278
const EXPECTED_COVERAGE = 295

function fail(msg: string): never {
  throw new Error(`Gate 5B customer-report contract: ${msg}`)
}

/** Treat any input as a loose record (the reader validates UNTRUSTED customer JSON). */
function rec(x: unknown): Record<string, unknown> {
  return x !== null && typeof x === 'object'
    ? (x as Record<string, unknown>)
    : {}
}

/** Validate a single evaluated fact carries the full standalone structure; returns it typed. */
function assertFullFact(input: unknown): CustomerFactLike {
  const f = rec(input)
  const ot = rec(f.operational_target)
  const v = rec(f.variance)
  const pr = rec(f.peer_rank)
  const ev = rec(f.evidence)
  const period = rec(ev.period)
  const ok =
    f.claim === 'fact' &&
    typeof f.metric_id === 'string' &&
    typeof f.label === 'string' &&
    f.label.length > 0 &&
    typeof f.value === 'number' &&
    typeof f.value_display === 'string' &&
    typeof f.unit === 'string' &&
    typeof ot.value === 'number' &&
    typeof ot.comparator === 'string' &&
    typeof ot.direction === 'string' &&
    typeof v.native === 'number' &&
    typeof v.display === 'string' &&
    typeof f.rating === 'string' &&
    typeof pr.rank === 'number' &&
    typeof pr.tie === 'boolean' &&
    typeof f.confidence === 'string' &&
    typeof ev.source === 'string' &&
    typeof period.start === 'string' &&
    typeof ev.numerator === 'number' &&
    typeof ev.denominator === 'number' &&
    typeof f.text === 'string'
  if (!ok) fail(`${String(f.metric_id)} evaluated fact is not fully structured`)
  return input as CustomerFactLike
}

/**
 * Assemble the full customer report model for ONE dealer from its bundle + its appendix partition only.
 * Inputs are UNTRUSTED (validated defensively); the reader imports no Gate 5A / internal file.
 */
export function assembleCustomerReport(
  bundleInput: unknown,
  appendixCellsForDealer: Array<AppendixCell>,
): CustomerReportModel {
  const bundle = rec(bundleInput)
  if (typeof bundle.dealer_id !== 'string')
    fail('bundle is missing a dealer_id')
  const dealerId: string = bundle.dealer_id
  const clusters = Array.isArray(bundle.clusters)
    ? bundle.clusters
    : fail('bundle has no clusters')

  // Appendix must all belong to this dealer.
  for (const c of appendixCellsForDealer)
    if (c.dealer_id !== dealerId)
      fail(
        `appendix cell ${c.metric_id} belongs to ${c.dealer_id}, not ${dealerId}`,
      )

  // Evaluated facts come from the bundle clusters (the fully-structured contract).
  const evaluated = clusters
    .flatMap((c) => {
      const cf = rec(c).facts
      return Array.isArray(cf) ? (cf as Array<unknown>) : []
    })
    .map(assertFullFact)
  const evalIds = evaluated.map((f) => f.metric_id)
  if (new Set(evalIds).size !== evalIds.length)
    fail('duplicate evaluated metric_id in bundle facts')
  if (evaluated.length !== EXPECTED_EVALUATED)
    fail(
      `expected ${EXPECTED_EVALUATED} evaluated facts, got ${evaluated.length}`,
    )

  // Not-measured entries come from the appendix partition.
  const nmCells = appendixCellsForDealer.filter(
    (c) => c.status === 'not_measured',
  )
  const not_measured: Array<NotMeasuredEntry> = nmCells.map((c) => {
    if (Object.prototype.hasOwnProperty.call(c, 'value'))
      fail(
        `${c.metric_id} not-measured cell must not carry a value (missing is never zero)`,
      )
    if (!c.measure || !c.note || !c.next_visibility_unlock)
      fail(
        `${c.metric_id} not-measured cell missing friendly reason/unlock fields`,
      )
    return {
      metric_id: c.metric_id,
      measure: c.measure,
      note: c.note,
      next_visibility_unlock: c.next_visibility_unlock,
    }
  })
  if (
    new Set(not_measured.map((n) => n.metric_id)).size !== not_measured.length
  )
    fail('duplicate not-measured metric_id')
  if (not_measured.length !== EXPECTED_NOT_MEASURED)
    fail(
      `expected ${EXPECTED_NOT_MEASURED} not-measured entries, got ${not_measured.length}`,
    )

  // Appendix evaluated ids must agree with the bundle facts (consistency, no drift).
  const apxEvalIds = appendixCellsForDealer
    .filter((c) => c.status === 'evaluated')
    .map((c) => c.metric_id)
    .sort()
  if (JSON.stringify(apxEvalIds) !== JSON.stringify([...evalIds].sort()))
    fail('appendix evaluated ids do not match the bundle evaluated facts')

  // Full coverage: 17 + 278 = 295 unique ids, no overlap.
  const all = [...evalIds, ...not_measured.map((n) => n.metric_id)]
  if (new Set(all).size !== all.length)
    fail('evaluated and not-measured ids overlap')
  if (all.length !== EXPECTED_COVERAGE)
    fail(`coverage ${all.length} != ${EXPECTED_COVERAGE}`)

  return {
    dealer_id: dealerId,
    coverage: EXPECTED_COVERAGE,
    evaluated,
    not_measured,
  }
}
