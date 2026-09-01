// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadBaselineRegistry } from '@/server/reports/evaluator/baseline-registry'

const REPO = path.resolve(__dirname, '..', '..')
const RAW = JSON.parse(
  fs.readFileSync(
    path.join(REPO, 'docs/halo/contract/baseline-registry.json'),
    'utf8',
  ),
)
const CONTRACT = JSON.parse(
  fs.readFileSync(
    path.join(REPO, 'docs/halo/contract/gate2-evaluator-contract.json'),
    'utf8',
  ),
) as { evaluable_conditions: Record<string, { baseline_id: string }> }

describe('Baseline registry — definition-first, no fabricated numbers', () => {
  it('every operational target carries a numeric threshold + definition + direction', () => {
    for (const o of RAW.operational_targets) {
      expect(o.basis).toBe('operational_target')
      expect(typeof o.threshold).toBe('number')
      expect(o.definition.length).toBeGreaterThan(0)
      expect(['higher_is_better', 'lower_is_better']).toContain(o.direction)
      expect(['<', '>']).toContain(o.comparator)
    }
  })
  it('industry benchmark top-level VALUES stay null (fabrication guard), verified or not', () => {
    for (const b of RAW.industry_benchmarks) {
      expect(b.basis).toBe('industry_benchmark')
      // The top-level value is the fabrication guard: it stays null so no benchmark number can be
      // pulled into a variance computation, whether or not the benchmark's figures are verified.
      expect(b.value).toBeNull()
      expect([
        'verified_reference_only',
        'unverified_pending_operator_transcription',
      ]).toContain(b.value_status)
      expect(String(b.url)).toMatch(/^https?:\/\//)
      // definition-first: publisher/definition/compatibility recorded
      expect(b.exact_definition.length).toBeGreaterThan(0)
      expect(b.compatibility_constraints.length).toBeGreaterThan(0)
      // A VERIFIED benchmark carries a verified_date + machine-readable verified_metrics and stays
      // reference-only (mapped_to null) so no verified figure becomes a variance basis.
      if (b.value_status === 'verified_reference_only') {
        expect(b.verified_date).toBe('2026-09-01')
        expect(Array.isArray(b.verified_metrics)).toBe(true)
        expect(b.compatibility).toBe('reference_only')
        expect(b.mapped_to).toBeNull()
      }
    }
  })
})

describe('Baseline registry resolver', () => {
  const reg = loadBaselineRegistry(RAW)
  it('resolves operational targets with the exact threshold', () => {
    expect(reg.resolve('OT-SW-032')?.value).toBe(0.55)
    expect(reg.resolve('OT-SW-041')?.value).toBe(0.45)
    expect(reg.resolve('OT-SW-031')?.value).toBe(0.25)
    expect(reg.resolve('OT-SW-032')?.basis).toBe('operational_target')
  })
  it('industry benchmarks resolve with value=null (never a forced number)', () => {
    const ib = reg.resolve('IB-FOUREYES-APPT-H2-2023')
    expect(ib?.basis).toBe('industry_benchmark')
    expect(ib?.value).toBeNull()
  })
  it('unknown id resolves to null', () => {
    expect(reg.resolve('OT-DOES-NOT-EXIST')).toBeNull()
  })
  it('every evaluable condition baseline_id resolves to an operational target with a numeric value', () => {
    for (const [, spec] of Object.entries(CONTRACT.evaluable_conditions)) {
      const b = reg.resolve(spec.baseline_id)
      expect(b, spec.baseline_id).not.toBeNull()
      expect(b?.basis).toBe('operational_target')
      expect(typeof b?.value).toBe('number')
    }
  })
})
