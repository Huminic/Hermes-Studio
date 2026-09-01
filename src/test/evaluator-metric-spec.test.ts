// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { METRIC_SPECS } from '@/server/reports/evaluator/metric-spec'
import { EVALUABLE_IDS } from '@/server/reports/evaluator/evaluators'

const REPO = path.resolve(__dirname, '..', '..')
const CONTRACT = JSON.parse(
  fs.readFileSync(
    path.join(REPO, 'docs/halo/contract/gate2-evaluator-contract.json'),
    'utf8',
  ),
) as {
  evaluable_conditions: Record<
    string,
    {
      source_family: string
      metric_slug: string
      unit: string
      formula: string
      source_fields: Array<string>
      baseline_id: string
      baseline_basis: string
      comparator: string
      direction: string
    }
  >
}

describe('Canonical metric spec is bound to the contract (repair req 1,4)', () => {
  it('METRIC_SPECS matches the contract evaluable_conditions field-for-field', () => {
    expect(Object.keys(METRIC_SPECS).sort()).toEqual([...EVALUABLE_IDS].sort())
    for (const id of EVALUABLE_IDS) {
      const s = METRIC_SPECS[id]
      const c = CONTRACT.evaluable_conditions[id]
      expect(c, id).toBeDefined()
      expect(s.source_family).toBe(c.source_family)
      expect(s.metric_slug).toBe(c.metric_slug)
      expect(s.unit).toBe(c.unit)
      expect(s.formula).toBe(c.formula)
      expect(s.source_fields).toEqual(c.source_fields)
      expect(s.baseline_id).toBe(c.baseline_id)
      expect(s.baseline_basis).toBe(c.baseline_basis)
      expect(s.comparator).toBe(c.comparator)
      expect(s.direction).toBe(c.direction)
    }
  })
})
