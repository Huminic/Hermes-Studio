// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { EvalRow } from '@/server/reports/evaluator/types'
import { evaluateStrictPredicate } from '@/server/reports/evaluator/strict-predicate'

const REPO = path.resolve(__dirname, '..', '..')
const LEDGER = JSON.parse(
  fs.readFileSync(
    path.join(REPO, 'docs/halo/evidence/m1r/evaluator/spine-ledger.json'),
    'utf8',
  ),
) as { rows: Array<EvalRow> }

// A real evaluated row is the mutation base.
const base: EvalRow = LEDGER.rows.find(
  (r) =>
    r.metric_id === 'SW-032' &&
    r.dealer_id === '21044' &&
    r.status === 'evaluated',
)!

function clone(): EvalRow {
  return JSON.parse(JSON.stringify(base)) as EvalRow
}

describe('Strict predicate — the base evaluated row passes (req 8)', () => {
  it('unmutated row is ok', () => {
    expect(base).toBeDefined()
    expect(evaluateStrictPredicate(clone()).ok).toBe(true)
  })
})

describe('Strict predicate — removing each required proof field FAILS it (req 8 mutation tests)', () => {
  const mutations: Array<{
    name: string
    mutate: (r: EvalRow) => void
    clause: RegExp
  }> = [
    {
      name: 'value',
      mutate: (r) => (r.value = null),
      clause: /value_is_computed/,
    },
    {
      name: 'source_family',
      mutate: (r) => (r.source_family = null),
      clause: /source_family_is_held/,
    },
    {
      name: 'source_family=quarantined',
      mutate: (r) => (r.source_family = 'lead_source_roi'),
      clause: /source_family_(is_held|not_quarantined)/,
    },
    {
      name: 'numerator',
      mutate: (r) => (r.numerator = null),
      clause: /numerator_is_explicit/,
    },
    {
      name: 'denominator=null',
      mutate: (r) => (r.denominator = null),
      clause: /denominator_is_explicit_positive/,
    },
    {
      name: 'denominator=0',
      mutate: (r) => (r.denominator = 0),
      clause: /denominator_is_explicit_positive/,
    },
    {
      name: 'formula',
      mutate: (r) => (r.formula = null),
      clause: /formula_is_explicit/,
    },
    {
      name: 'reporting_period',
      mutate: (r) => (r.reporting_period = null),
      clause: /reporting_period_proved/,
    },
    {
      name: 'captured_at',
      mutate: (r) => (r.captured_at = null),
      clause: /captured_at_proved/,
    },
    {
      name: 'baseline',
      mutate: (r) => (r.baseline = null),
      clause: /baseline_or_labeled_operational_target/,
    },
    {
      name: 'baseline.value',
      mutate: (r) => {
        if (r.baseline) r.baseline.value = null
      },
      clause: /baseline_or_labeled_operational_target/,
    },
    {
      name: 'variance',
      mutate: (r) => (r.variance = null),
      clause: /variance_computed/,
    },
    {
      name: 'rating',
      mutate: (r) => (r.rating = null),
      clause: /rating_computed/,
    },
    { name: 'rank', mutate: (r) => (r.rank = null), clause: /rank_computed/ },
    {
      name: 'evaluation_confidence',
      mutate: (r) => (r.evaluation_confidence = null),
      clause: /evaluation_confidence_computed/,
    },
    {
      name: 'source_lineage',
      mutate: (r) => (r.source_lineage = null),
      clause: /source_lineage_complete/,
    },
    {
      name: 'source_lineage.artifact_sha256',
      mutate: (r) => {
        if (r.source_lineage) r.source_lineage.artifact_sha256 = 'short'
      },
      clause: /source_lineage_complete/,
    },
  ]

  for (const m of mutations) {
    it(`mutation "${m.name}" -> predicate fails with the expected clause`, () => {
      const r = clone()
      m.mutate(r)
      const v = evaluateStrictPredicate(r)
      expect(v.ok).toBe(false)
      expect(
        v.failed.some((f) => m.clause.test(f)),
        `failed=${v.failed.join(',')}`,
      ).toBe(true)
    })
  }
})
