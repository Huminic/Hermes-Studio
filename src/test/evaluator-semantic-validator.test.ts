// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { EvalRow } from '@/server/reports/evaluator/types'
import type { Gate2Inputs } from '@/server/reports/evaluator/build-from-fresh'
import type { ValidatorContext } from '@/server/reports/evaluator/semantic-validator'
import { assembleGate2Inputs } from '@/server/reports/evaluator/build-from-fresh'
import { buildSpine } from '@/server/reports/evaluator/spine'
import { validateEvaluatedRow } from '@/server/reports/evaluator/semantic-validator'

const REPO = path.resolve(__dirname, '..', '..')
const FRESH = process.env.HALO_FRESH_DIR ?? '/tmp/halo-295-fresh-20260831'
const HAVE = fs.existsSync(path.join(FRESH, 'manifest.json'))

function ctxFor(
  inputs: Gate2Inputs,
  dealerId: string,
  family: 'appointments' | 'dealership_performance',
): ValidatorContext {
  const d = inputs.dealers.find((x) => x.dealer_id === dealerId)!
  const fl = d.lineage[family]
  return {
    bundle: d.bundle,
    cohort: inputs.dealers.map((x) => ({
      dealer_id: x.dealer_id,
      bundle: x.bundle,
    })),
    dealerId: d.dealer_id,
    dealerName: d.dealer_name,
    period: d.reporting_period,
    envelope: fl.envelope,
    expectedProof: fl.sales_only_proof,
    registry: inputs.registry,
  }
}

describe.runIf(HAVE)(
  'Semantic validator — non-vacuous corruption detection (repair req 1)',
  () => {
    const inputs = assembleGate2Inputs({ freshDir: FRESH, repoRoot: REPO })
    const spine = buildSpine(inputs)
    const authentic = spine.rows.find(
      (r) => r.metric_id === 'SW-032' && r.dealer_id === '21044',
    )!
    const ctx = ctxFor(inputs, '21044', 'appointments')
    const clone = (): EvalRow =>
      JSON.parse(JSON.stringify(authentic)) as EvalRow

    it('the authentic evaluated row passes', () => {
      expect(authentic.status).toBe('evaluated')
      expect(validateEvaluatedRow(clone(), ctx).ok).toBe(true)
    })

    const mut: Array<{
      name: string
      mutate: (r: EvalRow) => void
      clause: string
      exact?: boolean
    }> = [
      {
        name: 'value',
        mutate: (r) => (r.value = 0.99),
        clause: 'value_inconsistent_with_source',
        exact: true,
      },
      {
        name: 'numerator',
        mutate: (r) => (r.numerator = 99),
        clause: 'numerator_mismatch',
      },
      {
        name: 'denominator',
        mutate: (r) => (r.denominator = 99),
        clause: 'denominator_mismatch',
      },
      {
        name: 'source_fields',
        mutate: (r) => (r.source_fields = []),
        clause: 'source_fields_mismatch',
        exact: true,
      },
      {
        name: 'unit',
        mutate: (r) => (r.unit = 'percent'),
        clause: 'unit_mismatch',
        exact: true,
      },
      {
        name: 'formula',
        mutate: (r) => (r.formula = 'made up'),
        clause: 'formula_mismatch',
        exact: true,
      },
      {
        name: 'source_family',
        mutate: (r) => (r.source_family = 'crm_sales_gross'),
        clause: 'source_family_mismatch',
      },
      {
        name: 'baseline.id',
        mutate: (r) => {
          if (r.baseline) r.baseline.id = 'OT-WRONG'
        },
        clause: 'baseline_id_mismatch',
        exact: true,
      },
      {
        name: 'baseline.value',
        mutate: (r) => {
          if (r.baseline) r.baseline.value = 0.9
        },
        clause: 'baseline_value_mismatch',
        exact: true,
      },
      {
        name: 'baseline.value=null',
        mutate: (r) => {
          if (r.baseline) r.baseline.value = null
        },
        clause: 'baseline_value_unverified',
      },
      {
        name: 'baseline.basis=industry',
        mutate: (r) => {
          if (r.baseline) r.baseline.basis = 'industry_benchmark'
        },
        clause: 'baseline_basis_mismatch',
        exact: true,
      },
      {
        name: 'baseline.direction',
        mutate: (r) => {
          if (r.baseline) r.baseline.direction = 'lower_is_better'
        },
        clause: 'baseline_direction_mismatch',
        exact: true,
      },
      {
        name: 'baseline.comparator',
        mutate: (r) => {
          if (r.baseline) r.baseline.comparator = '>'
        },
        clause: 'baseline_comparator_mismatch',
        exact: true,
      },
      {
        name: 'baseline.definition',
        mutate: (r) => {
          if (r.baseline) r.baseline.definition = ''
        },
        clause: 'baseline_definition_blank',
        exact: true,
      },
      {
        name: 'variance',
        mutate: (r) => (r.variance = 0),
        clause: 'variance_incorrect',
        exact: true,
      },
      {
        name: 'rating',
        mutate: (r) => (r.rating = 'healthy'),
        clause: 'rating_incorrect',
        exact: true,
      },
      {
        name: 'rank',
        mutate: (r) => (r.rank = 1),
        clause: 'rank_incorrect',
        exact: true,
      },
      {
        name: 'confidence',
        mutate: (r) => {
          if (r.evaluation_confidence) r.evaluation_confidence.label = 'high'
        },
        clause: 'confidence_incorrect',
        exact: true,
      },
      {
        name: 'lineage.sha',
        mutate: (r) => {
          if (r.source_lineage) r.source_lineage.artifact_sha256 = 'deadbeef'
        },
        clause: 'lineage_sha_mismatch',
        exact: true,
      },
      {
        name: 'lineage.filename',
        mutate: (r) => {
          if (r.source_lineage) r.source_lineage.artifact_filename = 'Evil.xlsx'
        },
        clause: 'lineage_filename_mismatch',
        exact: true,
      },
      {
        name: 'lineage.dealer_id',
        mutate: (r) => {
          if (r.source_lineage) r.source_lineage.dealer_id = '99999'
        },
        clause: 'lineage_dealer_id_mismatch',
        exact: true,
      },
      {
        name: 'lineage.period',
        mutate: (r) => {
          if (r.source_lineage)
            r.source_lineage.reporting_period = {
              start: '2000-01-01',
              end: '2000-01-07',
              timezone: 'UTC',
            }
        },
        clause: 'lineage_period_mismatch',
        exact: true,
      },
      {
        name: 'lineage.proof',
        mutate: (r) => {
          if (r.source_lineage)
            r.source_lineage.sales_only_proof = 'trust me, sales only'
        },
        clause: 'lineage_proof_falsified',
        exact: true,
      },
      {
        name: 'lineage.sender',
        mutate: (r) => {
          if (r.source_lineage) r.source_lineage.sender = 'evil@example.com'
        },
        clause: 'lineage_sender_mismatch',
        exact: true,
      },
      {
        name: 'lineage.subject',
        mutate: (r) => {
          if (r.source_lineage) r.source_lineage.subject = 'Re: lol'
        },
        clause: 'lineage_subject_mismatch',
        exact: true,
      },
      {
        name: 'lineage.message_id',
        mutate: (r) => {
          if (r.source_lineage)
            r.source_lineage.gmail_message_id = 'fabricated-id'
        },
        clause: 'lineage_message_id_mismatch',
        exact: true,
      },
      {
        name: 'lineage.period_hint',
        mutate: (r) => {
          if (r.source_lineage)
            r.source_lineage.period_hint = '2000-01-01/2000-01-07'
        },
        clause: 'lineage_period_hint_mismatch',
        exact: true,
      },
      {
        name: 'row.captured_at',
        mutate: (r) => (r.captured_at = '2000-01-01T00:00:00Z'),
        clause: 'row_captured_at_mismatch',
        exact: true,
      },
    ]

    for (const m of mut) {
      it(`mutation "${m.name}" -> ${m.clause}`, () => {
        const r = clone()
        m.mutate(r)
        const v = validateEvaluatedRow(r, ctx)
        expect(v.ok).toBe(false)
        expect(v.failed, v.failed.join(',')).toContain(m.clause)
        if (m.exact) expect(v.failed).toEqual([m.clause])
      })
    }

    it('a legitimate cohort difference changes ONLY rank (honda rank 1, nissan rank 3), both valid', () => {
      const honda = spine.rows.find(
        (r) => r.metric_id === 'SW-032' && r.dealer_id === '21043',
      )!
      const hondaCtx = ctxFor(inputs, '21043', 'appointments')
      expect(
        validateEvaluatedRow(
          JSON.parse(JSON.stringify(honda)) as EvalRow,
          hondaCtx,
        ).ok,
      ).toBe(true)
      expect(honda.rank).toBe(1) // highest show rate
      expect(authentic.rank).toBe(3) // lowest show rate
      expect(honda.value).not.toBe(authentic.value)
    })

    it('SW-031 dashboard-sourced row also validates and binds to the dashboard envelope', () => {
      const row = spine.rows.find(
        (r) => r.metric_id === 'SW-031' && r.dealer_id === '21044',
      )!
      const c = ctxFor(inputs, '21044', 'dealership_performance')
      expect(
        validateEvaluatedRow(JSON.parse(JSON.stringify(row)) as EvalRow, c).ok,
      ).toBe(true)
    })
  },
)
