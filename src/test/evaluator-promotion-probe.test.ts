// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { EvalRow } from '@/server/reports/evaluator/types'
import { loadCatalogDetail } from '@/server/reports/evaluator/closure'
import { probeConditions } from '@/server/reports/evaluator/promotion-probe'

const REPO = path.resolve(__dirname, '..', '..')
const LEDGER = JSON.parse(
  fs.readFileSync(
    path.join(REPO, 'docs/halo/evidence/m1r/evaluator/spine-ledger.json'),
    'utf8',
  ),
) as { rows: Array<EvalRow> }
const PROBE = JSON.parse(
  fs.readFileSync(
    path.join(REPO, 'docs/halo/evidence/m1r/evaluator/promotion-probe.json'),
    'utf8',
  ),
) as {
  records: Array<Record<string, unknown>>
  summary: { promoted: number; promoted_ids: Array<string> }
}
const details = loadCatalogDetail(
  JSON.parse(
    fs.readFileSync(
      path.join(
        REPO,
        'docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json',
      ),
      'utf8',
    ),
  ),
)

describe('Gate 3 promotion probe — maximize from accepted bytes (req 2)', () => {
  it('tests all 295 conditions against all four accepted families', () => {
    expect(PROBE.records.length).toBe(295)
    for (const r of PROBE.records) {
      expect(r.tested_families).toEqual([
        'leads',
        'appointments',
        'crm_sales_gross',
        'dealership_performance',
      ])
    }
  })
  it('exactly SW-031/032/041 promote — no additional honest promotion, proven per condition', () => {
    expect(PROBE.summary.promoted).toBe(3)
    expect(PROBE.summary.promoted_ids).toEqual(['SW-031', 'SW-032', 'SW-041'])
    const promoted = PROBE.records
      .filter((r) => r.promoted === true)
      .map((r) => r.metric_id)
    expect(promoted.sort()).toEqual(['SW-031', 'SW-032', 'SW-041'])
  })
  it('every not-promotable condition carries a definition-first reason', () => {
    for (const r of PROBE.records) {
      if (r.promoted === false)
        expect(String(r.reason).length).toBeGreaterThan(0)
    }
  })
  it('Leads-plausible conditions (response/duplicate/close-rate) carry an explicit Leads note', () => {
    for (const r of PROBE.records) {
      const cond = String(r.condition)
      if (
        r.promoted === false &&
        /median time-to-first-touch|duplicate lead rate|close rate/i.test(cond)
      ) {
        expect(r.leads_definition_note, String(r.metric_id)).not.toBeNull()
      }
    }
  })
  it('recompute from catalog + ledger is byte-identical to the committed probe (deterministic)', () => {
    const reasonByMetric = new Map<string, string>()
    for (const r of LEDGER.rows.filter((x) => x.status === 'unresolved'))
      reasonByMetric.set(r.metric_id, r.unresolved_reason ?? '')
    const { records } = probeConditions(details, reasonByMetric)
    expect(JSON.stringify(records)).toBe(JSON.stringify(PROBE.records))
  })
  it('a promoted flag cannot silently exceed the evaluated ledger set', () => {
    const ledgerEvaluated = new Set(
      LEDGER.rows
        .filter((r) => r.status === 'evaluated')
        .map((r) => r.metric_id),
    )
    for (const r of PROBE.records) {
      if (r.promoted === true)
        expect(ledgerEvaluated.has(String(r.metric_id))).toBe(true)
    }
  })
})
