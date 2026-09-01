/**
 * Gate 5B — standalone customer-report assembler (the ONLY JSON input the PDF generator will need).
 *
 * `assembleCustomerReport` builds a COMPLETE, validated per-dealer report package from customer
 * artifacts ALONE: a dealer's Gate 5B synthesis bundle plus that dealer's partition of the Gate 5B
 * 295×3 customer appendix. It imports NOTHING from Gate 5A, the internal audit, raw evidence, hidden
 * controller files, or any separate ledger — a fresh process opens one bundle + its appendix partition
 * and has every field needed to render the report unchanged.
 *
 * It fails closed on: missing/duplicate IDs, malformed typed claims/citations, incomplete facts,
 * missing sections, an activated notification candidate, a valued not-measured cell, unsafe customer
 * language, or coverage that is not exactly 295 (17 evaluated + 278 not-measured).
 */

// Self-contained forbidden-language guard (no import of the Gate 5A guard, so the reader is standalone).
// Whole-word Service/Parts (permanent boundary), internal paths, system/report names, raw CRM fields,
// internal vocabulary, and PII. The person-name heuristic is intentionally NOT applied here because
// catalog metric titles carry legitimate Title-Case field terms.
const FORBIDDEN =
  /\b(service|parts|VinSolutions|Dashboard|Custom Reporting|Desk Log|Deal Performance|DMS|Sales Flat|Is Show|Is No Show|Actual Response Time|First Contact Attempt|Originated After Hours|quarantin|blocker_class|frozen_e1|rep_token|nlp_content|withheld|spine-ledger)\b|docs\/halo|\bsrc\/|scripts\/|\.json\b|\.ts\b|\b\d{3}-\d{2}-\d{4}\b|@[a-z0-9.-]+\.[a-z]{2,}/i

const CLAIM_TYPES = ['fact', 'inference', 'hypothesis', 'recommendation']
const COMPARATORS = ['<', '>']
const DIRECTIONS = ['higher_is_better', 'lower_is_better']
const RATINGS = ['healthy', 'watch', 'breach']
const CONFIDENCES = ['low', 'medium', 'high']
const STATUSES = ['evaluated', 'not_measured']
const EXPECTED_EVALUATED = 17
const EXPECTED_NOT_MEASURED = 278
const EXPECTED_COVERAGE = 295
/** The full contractual catalog: SW-001..SW-295, exactly. */
const EXPECTED_IDS = Array.from(
  { length: EXPECTED_COVERAGE },
  (_, i) => `SW-${String(i + 1).padStart(3, '0')}`,
)

export type TypedClaimLike = {
  claim: string
  text: string
  cites: Array<string>
}
export type ActionLike = {
  claim: string
  action: string
  owner: string
  cadence: string
  success_measure: string
  effort: string
  impact: string
}
export type CustomerFactLike = {
  claim: string
  metric_id: string
  label: string
  value: number
  value_display: string
  unit: string
  operational_target: {
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
export type ClusterLike = {
  cluster: string
  title: string
  facts: Array<CustomerFactLike>
  narrative: TypedClaimLike
  implication: TypedClaimLike
  hypotheses: Array<TypedClaimLike>
  actions: Array<ActionLike>
}
export type NotifCandidateLike = {
  metric_id: string
  trigger: string
  audience: string
  timing: string
  payload: string
  guardrails: string
  kind: string
  activated: boolean
}
export type VisibilityTheme = {
  theme: string
  metric_ids: Array<string>
  count: number
}
export type NotMeasuredEntry = {
  metric_id: string
  label: string
  theme: string
  note: string
  next_visibility_unlock: string
}
export type AppendixCell = {
  metric_id: string
  dealer_id: string
  status: 'evaluated' | 'not_measured'
  label?: string
  measure?: string
  note?: string
  next_visibility_unlock?: string
  value?: unknown
}
export type CustomerReportModel = {
  dealer_id: string
  dealer: string
  accepted_week: string
  freshness: string
  executive_narrative: {
    what_is_working: TypedClaimLike
    largest_controllable_opportunity: TypedClaimLike
    how_evidence_connects: TypedClaimLike
    claim_layers_legend: string
  }
  clusters: Array<ClusterLike>
  cross_cluster_synthesis: Array<TypedClaimLike>
  ranked_opportunities: Array<{ metric_id: string; claim: string }>
  vehicle_opportunity_scenario: Record<string, unknown>
  notification_candidates: Array<NotifCandidateLike>
  coverage: { evaluated: number; not_measured: number; total: number }
  visibility_plan: { unresolved_total: number; themes: Array<VisibilityTheme> }
  evaluated: Array<CustomerFactLike>
  not_measured: Array<NotMeasuredEntry>
  appendix: Array<AppendixCell>
}

function fail(msg: string): never {
  throw new Error(`Gate 5B customer-report contract: ${msg}`)
}
function rec(x: unknown): Record<string, unknown> {
  return x !== null && typeof x === 'object'
    ? (x as Record<string, unknown>)
    : {}
}
function str(x: unknown): x is string {
  return typeof x === 'string'
}
/** Fail if any string in a value tree contains forbidden customer language. */
function scanSafe(where: string, x: unknown): void {
  if (typeof x === 'string') {
    if (FORBIDDEN.test(x)) fail(`unsafe customer language at ${where}: "${x}"`)
    return
  }
  if (Array.isArray(x)) {
    x.forEach((v, i) => scanSafe(`${where}[${i}]`, v))
    return
  }
  if (x && typeof x === 'object')
    for (const [k, v] of Object.entries(x)) scanSafe(`${where}.${k}`, v)
}

/** Validate a typed claim; inference/hypothesis must cite ≥2 evaluated IDs or note single-metric. */
function assertClaim(where: string, c: unknown, evalIds: Set<string>): void {
  const cl = rec(c)
  if (!CLAIM_TYPES.includes(String(cl.claim)))
    fail(`${where} has an invalid claim type "${String(cl.claim)}"`)
  if (!str(cl.text) || cl.text.length === 0) fail(`${where} has empty text`)
  if (!Array.isArray(cl.cites)) fail(`${where} cites must be an array`)
  for (const id of cl.cites)
    if (!evalIds.has(String(id)))
      fail(`${where} cites a non-evaluated metric "${String(id)}"`)
  if (cl.claim === 'inference' || cl.claim === 'hypothesis')
    if (cl.cites.length < 2 && !/single-metric/i.test(cl.text))
      fail(
        `${where} (${cl.claim}) must cite ≥2 metrics or note a single-metric observation`,
      )
}

const finite = (x: unknown): x is number =>
  typeof x === 'number' && Number.isFinite(x)

function assertFullFact(where: string, input: unknown): CustomerFactLike {
  const f = rec(input)
  const ot = rec(f.operational_target)
  const v = rec(f.variance)
  const pr = rec(f.peer_rank)
  const ev = rec(f.evidence)
  const period = rec(ev.period)
  const ok =
    f.claim === 'fact' &&
    str(f.metric_id) &&
    str(f.label) &&
    f.label.length > 0 &&
    finite(f.value) &&
    str(f.value_display) &&
    str(f.unit) &&
    // operational target: strict kind + enums + display
    ot.kind === 'operational_target' &&
    finite(ot.value) &&
    str(ot.value_display) &&
    str(ot.comparator) &&
    COMPARATORS.includes(ot.comparator) &&
    str(ot.direction) &&
    DIRECTIONS.includes(ot.direction) &&
    // variance
    finite(v.native) &&
    str(v.display) &&
    // rating / confidence enums
    str(f.rating) &&
    RATINGS.includes(f.rating) &&
    str(f.confidence) &&
    CONFIDENCES.includes(f.confidence) &&
    // peer rank: finite integer 1..3, boolean tie, of === 3
    finite(pr.rank) &&
    Number.isInteger(pr.rank) &&
    pr.rank >= 1 &&
    pr.rank <= 3 &&
    typeof pr.tie === 'boolean' &&
    pr.of === 3 &&
    // evidence: source + full period + freshness + finite non-negative counts
    str(ev.source) &&
    str(period.start) &&
    str(period.end) &&
    str(ev.freshness) &&
    finite(ev.numerator) &&
    ev.numerator >= 0 &&
    finite(ev.denominator) &&
    ev.denominator >= 0 &&
    str(f.text)
  if (!ok) fail(`${where} evaluated fact is not fully structured`)
  return input as CustomerFactLike
}

/**
 * Assemble + validate the complete report package for ONE dealer from its bundle + appendix partition.
 */
export function assembleCustomerReport(
  bundleInput: unknown,
  appendixCellsForDealer: Array<AppendixCell>,
): CustomerReportModel {
  const b = rec(bundleInput)
  if (!str(b.dealer_id)) fail('bundle is missing a dealer_id')
  if (!str(b.dealer)) fail('bundle is missing a dealer name')
  if (!str(b.accepted_week)) fail('bundle is missing accepted_week')
  const dealerId = b.dealer_id

  // Appendix must all belong to this dealer.
  for (const c of appendixCellsForDealer)
    if (c.dealer_id !== dealerId)
      fail(
        `appendix cell ${c.metric_id} belongs to ${c.dealer_id}, not ${dealerId}`,
      )

  // Required sections present.
  const exec = rec(b.executive_narrative)
  const clustersRaw = Array.isArray(b.clusters)
    ? b.clusters
    : fail('bundle has no clusters')
  if (clustersRaw.length !== 4)
    fail(`expected 4 clusters, got ${clustersRaw.length}`)
  const crossRaw = Array.isArray(b.cross_cluster_synthesis)
    ? b.cross_cluster_synthesis
    : fail('bundle has no cross_cluster_synthesis')
  const oppsRaw = Array.isArray(b.ranked_opportunities)
    ? b.ranked_opportunities
    : fail('bundle has no ranked_opportunities')
  const roi = rec(b.vehicle_opportunity_scenario)
  if (Object.keys(roi).length === 0)
    fail('bundle has no vehicle_opportunity_scenario')
  const notifRaw = Array.isArray(b.notification_candidates)
    ? b.notification_candidates
    : fail('bundle has no notification_candidates')
  const vis = rec(b.visibility_plan)
  const themesRaw = Array.isArray(vis.themes)
    ? vis.themes
    : fail('bundle has no visibility_plan.themes')

  // Evaluated facts (17) from the cluster facts.
  const clusters: Array<ClusterLike> = clustersRaw.map((cUnknown, ci) => {
    const c = rec(cUnknown)
    const factsRaw = Array.isArray(c.facts)
      ? c.facts
      : fail(`cluster ${ci} has no facts`)
    const facts = factsRaw.map((f, fi) =>
      assertFullFact(`cluster[${ci}].facts[${fi}]`, f),
    )
    return {
      cluster: String(c.cluster),
      title: String(c.title),
      facts,
      narrative: c.narrative as TypedClaimLike,
      implication: c.implication as TypedClaimLike,
      hypotheses: (Array.isArray(c.hypotheses)
        ? c.hypotheses
        : []) as Array<TypedClaimLike>,
      actions: (Array.isArray(c.actions) ? c.actions : []) as Array<ActionLike>,
    }
  })
  const evaluated = clusters.flatMap((c) => c.facts)
  const evalIds = evaluated.map((f) => f.metric_id)
  const evalIdSet = new Set(evalIds)
  if (evalIdSet.size !== evalIds.length) fail('duplicate evaluated metric_id')
  if (evaluated.length !== EXPECTED_EVALUATED)
    fail(
      `expected ${EXPECTED_EVALUATED} evaluated facts, got ${evaluated.length}`,
    )

  // Cluster keys + typed claims + actions.
  const keys = clusters.map((c) => c.cluster).sort()
  if (JSON.stringify(keys) !== JSON.stringify(['A', 'B', 'C', 'D']))
    fail('clusters must be exactly A/B/C/D')
  for (let i = 0; i < clusters.length; i++) {
    const c = clusters[i]
    assertClaim(`cluster[${i}].narrative`, c.narrative, evalIdSet)
    assertClaim(`cluster[${i}].implication`, c.implication, evalIdSet)
    c.hypotheses.forEach((h, hi) =>
      assertClaim(`cluster[${i}].hypotheses[${hi}]`, h, evalIdSet),
    )
    for (const a of c.actions) {
      if (a.claim !== 'recommendation')
        fail(`cluster[${i}] action is not a recommendation`)
      for (const k of [
        'owner',
        'cadence',
        'success_measure',
        'effort',
        'impact',
      ] as const)
        if (!str(a[k]) || a[k].length === 0)
          fail(`cluster[${i}] action missing ${k}`)
    }
  }

  // Executive narrative claims.
  for (const k of [
    'what_is_working',
    'largest_controllable_opportunity',
    'how_evidence_connects',
  ] as const)
    assertClaim(`executive_narrative.${k}`, exec[k], evalIdSet)
  if (!str(exec.claim_layers_legend))
    fail('executive_narrative missing claim_layers_legend')

  // Cross-cluster synthesis.
  crossRaw.forEach((c, i) =>
    assertClaim(`cross_cluster_synthesis[${i}]`, c, evalIdSet),
  )

  // Ranked opportunities reference evaluated metrics.
  for (const o of oppsRaw) {
    const oo = rec(o)
    if (!evalIdSet.has(String(oo.metric_id)))
      fail(
        `ranked opportunity references a non-evaluated metric "${String(oo.metric_id)}"`,
      )
  }

  // Notification candidates: inert + complete.
  const notification_candidates: Array<NotifCandidateLike> = notifRaw.map(
    (n) => {
      const nn = rec(n)
      if (nn.activated !== false)
        fail(
          `notification candidate ${String(nn.metric_id)} must be activated=false`,
        )
      for (const k of [
        'metric_id',
        'trigger',
        'audience',
        'timing',
        'payload',
        'guardrails',
        'kind',
      ])
        if (!str(nn[k]) || nn[k].length === 0)
          fail(`notification candidate missing ${k}`)
      return nn as unknown as NotifCandidateLike
    },
  )

  // ROI scenario sanity (arithmetic preserved; dollars omitted).
  if (typeof roi.appointment_gap_to_target !== 'number')
    fail('vehicle_opportunity_scenario missing appointment_gap_to_target')
  if (roi.dollars !== null)
    fail('vehicle_opportunity_scenario dollars must be null')

  // Visibility themes: exact coverage of the 278 not-measured, once each.
  const themeIds = themesRaw.flatMap((t) => {
    const tt = rec(t)
    return Array.isArray(tt.metric_ids) ? tt.metric_ids.map(String) : []
  })
  if (new Set(themeIds).size !== themeIds.length)
    fail('visibility themes overlap on a metric_id')
  if (themeIds.length !== EXPECTED_NOT_MEASURED)
    fail(
      `visibility themes cover ${themeIds.length} metrics, expected ${EXPECTED_NOT_MEASURED}`,
    )

  // Appendix: 295 cells, each with a specific label; evaluated match cluster facts; not-measured missing.
  if (appendixCellsForDealer.length !== EXPECTED_COVERAGE)
    fail(
      `appendix has ${appendixCellsForDealer.length} cells, expected ${EXPECTED_COVERAGE}`,
    )
  for (const c of appendixCellsForDealer) {
    if (!str(c.metric_id)) fail('appendix cell missing metric_id')
    if (!STATUSES.includes(c.status))
      fail(
        `appendix cell ${c.metric_id} has an invalid status "${String(c.status)}"`,
      )
    if (!str(c.label) || c.label.length === 0)
      fail(`appendix cell ${c.metric_id} has no specific label`)
  }
  const apxEvalIds = appendixCellsForDealer
    .filter((c) => c.status === 'evaluated')
    .map((c) => c.metric_id)
    .sort()
  if (JSON.stringify(apxEvalIds) !== JSON.stringify([...evalIds].sort()))
    fail('appendix evaluated ids do not match the bundle evaluated facts')

  const not_measured: Array<NotMeasuredEntry> = appendixCellsForDealer
    .filter((c) => c.status === 'not_measured')
    .map((c) => {
      if (Object.prototype.hasOwnProperty.call(c, 'value'))
        fail(
          `${c.metric_id} not-measured cell must not carry a value (missing is never zero)`,
        )
      if (!str(c.note) || !str(c.next_visibility_unlock))
        fail(`${c.metric_id} not-measured cell missing reason/unlock`)
      return {
        metric_id: c.metric_id,
        label: c.label as string,
        theme: c.measure ?? '',
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
      `expected ${EXPECTED_NOT_MEASURED} not-measured, got ${not_measured.length}`,
    )

  // Visibility theme IDs must equal the not-measured ID set exactly.
  if (
    JSON.stringify([...themeIds].sort()) !==
    JSON.stringify(not_measured.map((n) => n.metric_id).sort())
  )
    fail('visibility theme IDs do not equal the not-measured ID set')

  // Full coverage: 17 + 278 = 295 unique, no overlap, and EXACTLY the SW-001..SW-295 catalog set.
  const all = [...evalIds, ...not_measured.map((n) => n.metric_id)]
  if (new Set(all).size !== all.length)
    fail('evaluated and not-measured ids overlap')
  if (all.length !== EXPECTED_COVERAGE)
    fail(`coverage ${all.length} != ${EXPECTED_COVERAGE}`)
  if (
    JSON.stringify([...all].sort()) !== JSON.stringify([...EXPECTED_IDS].sort())
  )
    fail('coverage IDs are not exactly SW-001..SW-295')

  const model: CustomerReportModel = {
    dealer_id: dealerId,
    dealer: b.dealer,
    accepted_week: b.accepted_week,
    freshness: `weekly; accepted period ${b.accepted_week}`,
    executive_narrative: {
      what_is_working: exec.what_is_working as TypedClaimLike,
      largest_controllable_opportunity:
        exec.largest_controllable_opportunity as TypedClaimLike,
      how_evidence_connects: exec.how_evidence_connects as TypedClaimLike,
      claim_layers_legend: exec.claim_layers_legend,
    },
    clusters,
    cross_cluster_synthesis: crossRaw as Array<TypedClaimLike>,
    ranked_opportunities: oppsRaw as Array<{
      metric_id: string
      claim: string
    }>,
    vehicle_opportunity_scenario: roi,
    notification_candidates,
    coverage: {
      evaluated: EXPECTED_EVALUATED,
      not_measured: EXPECTED_NOT_MEASURED,
      total: EXPECTED_COVERAGE,
    },
    visibility_plan: {
      unresolved_total: EXPECTED_NOT_MEASURED,
      themes: themesRaw as Array<VisibilityTheme>,
    },
    evaluated,
    not_measured,
    appendix: appendixCellsForDealer,
  }

  // Final customer-safety sweep over the whole assembled package.
  scanSafe('model', model)
  return model
}
