// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ReconcileError,
  derivePortfolio,
} from '../../scripts/m1r-structured/portfolio'
import type { CommRecon } from '../../scripts/m1r-structured/portfolio'
import { assembleGate2Inputs } from '@/server/reports/evaluator/build-from-fresh'
import { buildSpine } from '@/server/reports/evaluator/spine'
import { EVALUABLE_IDS } from '@/server/reports/evaluator/evaluators'

// Gate 4D — structured-source expansion audit. Regression guards: the accepted structured
// families promote EXACTLY the prior evaluated set (no silent expansion), every structured
// candidate HOLDs with a reason that matches the REAL spine, and the portfolio stays 36/849.

const REPO = path.resolve(__dirname, '..', '..')
const FRESH = process.env.HALO_FRESH_DIR ?? '/tmp/halo-295-fresh-20260831'
const HAVE = fs.existsSync(path.join(FRESH, 'manifest.json'))

const MATRIX = JSON.parse(
  fs.readFileSync(
    path.join(
      REPO,
      'docs/halo/contract/sw295-structured-candidate-matrix.json',
    ),
    'utf8',
  ),
) as {
  totals: Record<string, number>
  promoted_ids: Array<string>
  candidates: Array<{
    metric_id: string
    verdict: string
    spine_unresolved_reason_by_rooftop: Record<string, string>
  }>
  residual_categorical: { total: number }
}
const RECON = JSON.parse(
  fs.readFileSync(
    path.join(
      REPO,
      'docs/halo/evidence/m1r/structured/structured-portfolio-reconciliation.json',
    ),
    'utf8',
  ),
) as {
  required_cells: number
  conditions: number
  rooftops: number
  spine_evaluated: number
  comm_overlay_evaluated: number
  comm_evaluated_per_rooftop: number
  structured_promoted_this_gate: number
  evaluated: number
  unresolved: number
  by_dealer: Record<
    string,
    {
      spine_evaluated: number
      comm_evaluated: number
      structured_promoted_this_gate: number
      evaluated: number
      unresolved: number
    }
  >
}
const COMM_RECON = JSON.parse(
  fs.readFileSync(
    path.join(
      REPO,
      'docs/halo/evidence/m1r/comms/comm-portfolio-reconciliation.json',
    ),
    'utf8',
  ),
) as CommRecon
const GOVERNED = ['21043', '21044', '21047'] as const

// The exact prior evaluated set (10 spine + 2 comm overlay). A silent expansion of the accepted
// structured evaluators would break this and must fail the gate.
const SPINE_EVALUABLE = [
  'SW-011',
  'SW-012',
  'SW-015',
  'SW-031',
  'SW-032',
  'SW-033',
  'SW-041',
  'SW-045',
  'SW-046',
  'SW-090',
]

describe('Gate 4D structured-source audit — no silent expansion', () => {
  it('the accepted-structured evaluator set is EXACTLY the prior 10 (no new evaluators added)', () => {
    expect([...EVALUABLE_IDS].sort()).toEqual([...SPINE_EVALUABLE].sort())
  })

  it('the audit promotes 0 additional IDs and every structured candidate is HOLD', () => {
    expect(MATRIX.promoted_ids).toEqual([])
    expect(MATRIX.candidates.length).toBe(19)
    for (const c of MATRIX.candidates) expect(c.verdict).toBe('HOLD')
  })

  it('the ID accounting sums to the full 295 catalog (12 evaluated + 19 candidates + 264 residual)', () => {
    const t = MATRIX.totals
    expect(t.catalog).toBe(295)
    expect(t.evaluated_ids).toBe(12)
    expect(t.structured_candidates).toBe(19)
    expect(t.residual_non_structured).toBe(264)
    expect(
      t.evaluated_ids + t.structured_candidates + t.residual_non_structured,
    ).toBe(295)
  })

  it('the Gate 4D reconciliation reaffirms the UNCHANGED 36/849 portfolio (0 promoted this gate)', () => {
    expect(RECON.structured_promoted_this_gate).toBe(0)
    expect(RECON.spine_evaluated).toBe(30)
    expect(RECON.comm_overlay_evaluated).toBe(6)
    expect(RECON.evaluated).toBe(36)
    expect(RECON.unresolved).toBe(849)
    // Must equal the committed Gate 4C2 comm portfolio exactly (nothing changed).
    expect(RECON.evaluated).toBe(COMM_RECON.evaluated)
    expect(RECON.unresolved).toBe(COMM_RECON.unresolved)
  })
})

describe.skipIf(!HAVE)(
  'Gate 4D structured-source audit — byte-backed against the real spine',
  () => {
    const inputs = assembleGate2Inputs({ freshDir: FRESH, repoRoot: REPO })
    const spine = buildSpine(inputs)

    it('the real spine evaluates exactly the 10 accepted-structured IDs (30 cells)', () => {
      expect(spine.summary.evaluated).toBe(30)
      expect(spine.summary.unresolved).toBe(855)
      expect(spine.summary.evaluated_ids).toEqual([...SPINE_EVALUABLE].sort())
    })

    it('no matrix candidate is evaluated in the spine (a silent promotion would surface here)', () => {
      const evaluated = new Set(spine.summary.evaluated_ids)
      for (const c of MATRIX.candidates) {
        expect(evaluated.has(c.metric_id)).toBe(false)
      }
    })

    it('every candidate hold reason matches the real spine unresolved_reason per rooftop', () => {
      for (const c of MATRIX.candidates) {
        for (const dealer of ['21043', '21044', '21047']) {
          const row = spine.rows.find(
            (r) => r.metric_id === c.metric_id && r.dealer_id === dealer,
          )
          expect(row, `${c.metric_id}/${dealer} row present`).toBeTruthy()
          expect(row?.status).toBe('unresolved')
          expect(c.spine_unresolved_reason_by_rooftop[dealer]).toBe(
            row?.unresolved_reason,
          )
        }
      }
    })

    it('SW-050 is blocked by 0 new-car deals at Honda/Nissan (missing is not zero)', () => {
      const byDealer: Record<string, number> = {}
      for (const d of inputs.dealers)
        byDealer[d.dealer_id] = d.bundle.crm?.newDeals ?? -1
      expect(byDealer['21043']).toBe(0)
      expect(byDealer['21044']).toBe(0)
      expect(byDealer['21047']).toBeGreaterThan(0)
    })
  },
)

describe('Gate 4D reconciliation is DERIVED from the committed comm overlay (not hardcoded)', () => {
  it('every comm/portfolio count equals the committed comm reconciliation + composition arithmetic', () => {
    // spine + comm overlay counts are carried from the committed comm reconciliation
    expect(RECON.spine_evaluated).toBe(COMM_RECON.spine_evaluated)
    expect(RECON.comm_overlay_evaluated).toBe(COMM_RECON.comm_overlay_evaluated)
    expect(RECON.required_cells).toBe(COMM_RECON.required_cells)
    expect(RECON.comm_evaluated_per_rooftop).toBe(
      COMM_RECON.comm_evaluated_ids.length,
    )
    // composed portfolio = spine + comm overlay + structured-promoted-this-gate
    expect(RECON.evaluated).toBe(
      RECON.spine_evaluated +
        RECON.comm_overlay_evaluated +
        RECON.structured_promoted_this_gate,
    )
    expect(RECON.evaluated + RECON.unresolved).toBe(RECON.required_cells)
    expect(RECON.required_cells).toBe(RECON.conditions * RECON.rooftops)
  })

  it('per-rooftop composition is derived and reconciles to the aggregate', () => {
    let evalSum = 0
    for (const d of GOVERNED) {
      const rd = RECON.by_dealer[d]
      const cd = COMM_RECON.by_dealer[d]
      expect(rd.spine_evaluated).toBe(cd.spine_evaluated)
      expect(rd.comm_evaluated).toBe(cd.comm_evaluated)
      expect(rd.evaluated).toBe(
        rd.spine_evaluated +
          rd.comm_evaluated +
          rd.structured_promoted_this_gate,
      )
      expect(rd.evaluated + rd.unresolved).toBe(RECON.conditions)
      evalSum += rd.evaluated
    }
    expect(evalSum).toBe(RECON.evaluated)
  })
})

describe('Gate 4D portfolio composition fails closed', () => {
  // A minimal well-formed comm reconciliation (2 conditions x 2 rooftops shape) — no repo truth.
  const okComm: CommRecon = {
    required_cells: 4,
    spine_evaluated: 2,
    comm_overlay_evaluated: 2,
    evaluated: 4,
    unresolved: 0,
    by_dealer: {
      A: { spine_evaluated: 1, comm_evaluated: 1, evaluated: 2, unresolved: 0 },
      B: { spine_evaluated: 1, comm_evaluated: 1, evaluated: 2, unresolved: 0 },
    },
    comm_evaluated_ids: ['X'],
  }
  const okSpine = {
    evaluated: 2,
    by_dealer: { A: { evaluated: 1 }, B: { evaluated: 1 } },
  }

  it('composes cleanly when everything reconciles', () => {
    const p = derivePortfolio(2, ['A', 'B'], okSpine, okComm, [])
    expect(p.evaluated).toBe(4)
    expect(p.unresolved).toBe(0)
    expect(p.required_cells).toBe(4)
  })

  it('throws when the governed dealer set disagrees with the committed reconciliation', () => {
    expect(() => derivePortfolio(2, ['A', 'C'], okSpine, okComm, [])).toThrow(
      ReconcileError,
    )
  })

  it('throws when required_cells does not equal conditions x rooftops', () => {
    const bad = { ...okComm, required_cells: 5 }
    expect(() => derivePortfolio(2, ['A', 'B'], okSpine, bad, [])).toThrow(
      ReconcileError,
    )
  })

  it('throws when the real spine diverges from the committed baseline', () => {
    const drifted = {
      evaluated: 3,
      by_dealer: { A: { evaluated: 2 }, B: { evaluated: 1 } },
    }
    expect(() => derivePortfolio(2, ['A', 'B'], drifted, okComm, [])).toThrow(
      ReconcileError,
    )
  })

  it('throws when the committed reconciliation arithmetic is internally inconsistent', () => {
    const bad = {
      ...okComm,
      by_dealer: {
        A: {
          spine_evaluated: 1,
          comm_evaluated: 1,
          evaluated: 3,
          unresolved: 0,
        },
        B: okComm.by_dealer.B,
      },
    }
    expect(() => derivePortfolio(2, ['A', 'B'], okSpine, bad, [])).toThrow(
      ReconcileError,
    )
  })
})
