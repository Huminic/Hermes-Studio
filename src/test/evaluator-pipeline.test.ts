// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { EvalRow } from '@/server/reports/evaluator/types'
import {
  REQUIRED_CELLS,
  runPipeline,
} from '@/server/reports/evaluator/pipeline'

const REPO = path.resolve(__dirname, '..', '..')
const FRESH = process.env.HALO_FRESH_DIR ?? '/tmp/halo-295-fresh-20260831'
const HAVE = fs.existsSync(path.join(FRESH, 'manifest.json'))

const EXPECTED_STAGES = [
  'ingest',
  'validate',
  'transform',
  'calculate',
  'baseline',
  'rank',
  'cross-analyze',
  'synthesize',
  'render-preflight',
  'verify',
]

describe.runIf(HAVE)(
  'Gate 3 pipeline — deterministic spine over all 885 cells (req 4)',
  () => {
    const pre = runPipeline({
      freshDir: FRESH,
      repoRoot: REPO,
      mode: 'preflight',
    })

    it('runs the 10 stages in order over all 885 cells', () => {
      expect(pre.ok).toBe(true)
      expect(pre.stages.map((s) => s.name)).toEqual(EXPECTED_STAGES)
      expect(pre.preflight?.cells).toBe(REQUIRED_CELLS)
    })
    it('exposes exact counts (9 evaluated / 876 unresolved), never placeholders', () => {
      expect(pre.preflight?.evaluated).toBe(9)
      expect(pre.preflight?.unresolved).toBe(876)
      expect(pre.preflight?.evaluated_ids).toEqual([
        'SW-031',
        'SW-032',
        'SW-041',
      ])
      const catSum = Object.values(
        pre.preflight?.unresolved_by_category ?? {},
      ).reduce((a, b) => a + b, 0)
      expect(catSum).toBe(876)
      expect(pre.preflight?.is_customer_deliverable).toBe(false)
    })
    it('REFUSES customer-final mode unless evaluated===885 (no partial-final PDF)', () => {
      const cf = runPipeline({
        freshDir: FRESH,
        repoRoot: REPO,
        mode: 'customer_final',
      })
      expect(cf.ok).toBe(false)
      expect(cf.preflight).toBeNull() // nothing rendered
      expect(String(cf.refusal_reason)).toMatch(
        /evaluated_count=9 != required 885/,
      )
      expect(pre.preflight?.customer_final_allowed).toBe(false)
    })
    it('deterministic: two runs produce identical preflight', () => {
      const a = runPipeline({
        freshDir: FRESH,
        repoRoot: REPO,
        mode: 'preflight',
      })
      const b = runPipeline({
        freshDir: FRESH,
        repoRoot: REPO,
        mode: 'preflight',
      })
      expect(JSON.stringify(a.preflight)).toBe(JSON.stringify(b.preflight))
    })
  },
)

describe.runIf(HAVE)('Gate 3 pipeline — negative guards (req 4)', () => {
  const ledger = JSON.parse(
    fs.readFileSync(
      path.join(REPO, 'docs/halo/evidence/m1r/evaluator/spine-ledger.json'),
      'utf8',
    ),
  ) as { rows: Array<EvalRow> }

  it('no-quarantine: no evaluated cell is sourced from a quarantined family', () => {
    const q = ['lead_source_roi', 'cage_kpi', 'sales_comm_log']
    for (const r of ledger.rows.filter((x) => x.status === 'evaluated')) {
      expect(q.includes(r.source_family ?? '')).toBe(false)
    }
  })
  it('missing-not-zero: no evaluated cell has a null/zero denominator', () => {
    for (const r of ledger.rows.filter((x) => x.status === 'evaluated')) {
      expect(r.denominator as number).toBeGreaterThan(0)
    }
  })
  it('295/885: exactly 885 cells, 295 unique conditions', () => {
    expect(ledger.rows.length).toBe(885)
    expect(new Set(ledger.rows.map((r) => r.metric_id)).size).toBe(295)
  })
  it('committed preflight artifact is not labeled a customer deliverable', () => {
    const art = JSON.parse(
      fs.readFileSync(
        path.join(
          REPO,
          'docs/halo/evidence/m1r/evaluator/pipeline-preflight.json',
        ),
        'utf8',
      ),
    )
    expect(art.is_customer_deliverable).toBe(false)
    expect(art.customer_final_allowed).toBe(false)
    expect(String(art.customer_final_refusal_reason)).toMatch(
      /876 cells unresolved/,
    )
  })
})
