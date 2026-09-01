/**
 * Gate 4D — pure, fail-closed portfolio composition.
 *
 * Composes the CURRENT portfolio = the real Gate 2 spine + the committed comm overlay + the IDs
 * promoted THIS gate, deriving EVERY comm/portfolio count from the committed Gate 4C2
 * reconciliation. No 2/6/36/849 literal lives here; the numbers come from the inputs. Fails closed
 * if the governed dealer sets, required_cells, or any arithmetic (aggregate or per-rooftop) does
 * not reconcile — so the audit stays correct if a prior gate adds or holds metrics, and a
 * divergence between the real spine and the committed baseline is a hard error, not a stale number.
 * Pure. No I/O.
 */

// The committed Gate 4C2 comm reconciliation — the sole source of the comm/portfolio counts this
// gate composes on top of.
export type CommReconDealer = {
  spine_evaluated: number
  comm_evaluated: number
  evaluated: number
  unresolved: number
}
export type CommRecon = {
  required_cells: number
  spine_evaluated: number
  comm_overlay_evaluated: number
  evaluated: number
  unresolved: number
  by_dealer: Record<string, CommReconDealer>
  comm_evaluated_ids: Array<string>
}

export type SpineSummaryLike = {
  evaluated: number
  by_dealer: Record<string, { evaluated: number }>
}

export type DealerComposition = {
  spine_evaluated: number
  comm_evaluated: number
  structured_promoted_this_gate: number
  evaluated: number
  unresolved: number
}
export type Portfolio = {
  required_cells: number
  conditions: number
  rooftops: number
  spine_evaluated: number
  comm_overlay_evaluated: number
  structured_promoted_this_gate: number
  evaluated: number
  unresolved: number
  by_dealer: Record<string, DealerComposition>
  comm_evaluated_per_rooftop: number
}

export class ReconcileError extends Error {}

function mustReconcile(cond: boolean, msg: string): void {
  if (!cond)
    throw new ReconcileError(`Gate 4D portfolio does not reconcile: ${msg}`)
}

const sum = (xs: Array<number>): number => xs.reduce((a, b) => a + b, 0)

export function derivePortfolio(
  conditions: number,
  governed: ReadonlyArray<string>,
  spine: SpineSummaryLike,
  comm: CommRecon,
  promotedIds: Array<string>,
): Portfolio {
  const rooftops = governed.length
  const requiredCells = conditions * rooftops

  // Governed dealer sets must match across the real spine and the committed comm reconciliation.
  const commDealers = Object.keys(comm.by_dealer).sort()
  const wantDealers = [...governed].sort()
  mustReconcile(
    JSON.stringify(commDealers) === JSON.stringify(wantDealers),
    `committed comm by_dealer keys ${JSON.stringify(commDealers)} != governed ${JSON.stringify(wantDealers)}`,
  )
  for (const d of governed)
    mustReconcile(
      d in spine.by_dealer,
      `real spine missing governed dealer ${d}`,
    )

  // required_cells must agree (catalog x rooftops) with the committed reconciliation.
  mustReconcile(
    comm.required_cells === requiredCells,
    `committed required_cells ${comm.required_cells} != ${conditions} conditions x ${rooftops} rooftops = ${requiredCells}`,
  )

  // Committed comm reconciliation must be internally consistent (aggregate + per-rooftop).
  mustReconcile(
    sum(governed.map((d) => comm.by_dealer[d].spine_evaluated)) ===
      comm.spine_evaluated,
    'committed per-rooftop spine_evaluated does not sum to comm.spine_evaluated',
  )
  mustReconcile(
    sum(governed.map((d) => comm.by_dealer[d].comm_evaluated)) ===
      comm.comm_overlay_evaluated,
    'committed per-rooftop comm_evaluated does not sum to comm.comm_overlay_evaluated',
  )
  mustReconcile(
    comm.spine_evaluated + comm.comm_overlay_evaluated === comm.evaluated,
    'committed spine + comm != evaluated',
  )
  mustReconcile(
    comm.evaluated + comm.unresolved === comm.required_cells,
    'committed evaluated + unresolved != required_cells',
  )
  for (const d of governed) {
    const cd = comm.by_dealer[d]
    mustReconcile(
      cd.spine_evaluated + cd.comm_evaluated === cd.evaluated,
      `committed dealer ${d} spine + comm != evaluated`,
    )
    mustReconcile(
      cd.evaluated + cd.unresolved === conditions,
      `committed dealer ${d} evaluated + unresolved != ${conditions}`,
    )
    // All-three-rooftops-or-no-metric: every rooftop carries the same comm ID count.
    mustReconcile(
      cd.comm_evaluated === comm.comm_evaluated_ids.length,
      `committed dealer ${d} comm_evaluated ${cd.comm_evaluated} != comm_evaluated_ids ${comm.comm_evaluated_ids.length}`,
    )
  }

  // The real spine must match the committed baseline the comm overlay was reconciled against.
  mustReconcile(
    spine.evaluated === comm.spine_evaluated,
    `real spine evaluated ${spine.evaluated} != committed comm.spine_evaluated ${comm.spine_evaluated}`,
  )
  for (const d of governed)
    mustReconcile(
      spine.by_dealer[d].evaluated === comm.by_dealer[d].spine_evaluated,
      `real spine dealer ${d} evaluated != committed baseline`,
    )

  // Structured promotions THIS gate are all-three-rooftops, so cells = ids x rooftops.
  const structuredPerRooftop = promotedIds.length
  const by_dealer: Record<string, DealerComposition> = {}
  for (const d of governed) {
    const spineEval = spine.by_dealer[d].evaluated
    const commEval = comm.by_dealer[d].comm_evaluated
    const evaluated = spineEval + commEval + structuredPerRooftop
    by_dealer[d] = {
      spine_evaluated: spineEval,
      comm_evaluated: commEval,
      structured_promoted_this_gate: structuredPerRooftop,
      evaluated,
      unresolved: conditions - evaluated,
    }
  }

  const spineEvaluated = spine.evaluated
  const commOverlayEvaluated = comm.comm_overlay_evaluated
  const structuredCells = structuredPerRooftop * rooftops
  const evaluated = spineEvaluated + commOverlayEvaluated + structuredCells
  const unresolved = requiredCells - evaluated

  // Composed totals must equal the per-rooftop sums (aggregate <-> per-rooftop reconcile).
  mustReconcile(
    sum(governed.map((d) => by_dealer[d].evaluated)) === evaluated,
    'composed per-rooftop evaluated does not sum to the aggregate',
  )
  mustReconcile(
    evaluated + unresolved === requiredCells,
    'composed evaluated + unresolved != required_cells',
  )

  return {
    required_cells: requiredCells,
    conditions,
    rooftops,
    spine_evaluated: spineEvaluated,
    comm_overlay_evaluated: commOverlayEvaluated,
    structured_promoted_this_gate: structuredCells,
    evaluated,
    unresolved,
    by_dealer,
    comm_evaluated_per_rooftop: comm.comm_evaluated_ids.length,
  }
}
