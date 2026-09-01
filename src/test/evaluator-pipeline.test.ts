// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { EvalRow } from '@/server/reports/evaluator/types'
import {
  REQUIRED_CELLS,
  REQUIRED_CELLS_PER_DEALER,
  runPipeline,
} from '@/server/reports/evaluator/pipeline'

const REPO = path.resolve(__dirname, '..', '..')
const FRESH = process.env.HALO_FRESH_DIR ?? '/tmp/halo-295-fresh-20260831'
const HAVE = fs.existsSync(path.join(FRESH, 'manifest.json'))
const run = (o: Record<string, unknown>) =>
  runPipeline({ freshDir: FRESH, repoRoot: REPO, mode: 'preflight', ...o })

const EXPECTED_STAGES = [
  'ingest',
  'scope',
  'period',
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
const GOOD_PERIOD = {
  start: '2026-08-24',
  end: '2026-08-30',
  timezone: 'America/New_York',
}

describe.runIf(HAVE)(
  'Gate 3 pipeline — portfolio over all 885 cells (req 4)',
  () => {
    const pre = run({})
    it('runs the 12 stages in order over all 885 cells (portfolio)', () => {
      expect(pre.ok).toBe(true)
      expect(pre.stages.map((s) => s.name)).toEqual(EXPECTED_STAGES)
      expect(pre.preflight?.scope_mode).toBe('portfolio')
      expect(pre.preflight?.cells).toBe(REQUIRED_CELLS)
      expect(pre.preflight?.required_cells).toBe(REQUIRED_CELLS)
      expect(pre.preflight?.scope.dealer_ids).toEqual([
        '21043',
        '21044',
        '21047',
      ])
    })
    it('exposes exact counts (18 evaluated / 867 unresolved), never placeholders', () => {
      expect(pre.preflight?.evaluated).toBe(18)
      expect(pre.preflight?.unresolved).toBe(867)
      expect(pre.preflight?.evaluated_ids).toEqual([
        'SW-011',
        'SW-012',
        'SW-015',
        'SW-031',
        'SW-032',
        'SW-041',
      ])
      expect(pre.preflight?.is_customer_deliverable).toBe(false)
      expect(pre.preflight?.customer_final_allowed).toBe(false)
    })
    it('period + scope derived from validated inputs, not raw options', () => {
      expect(pre.preflight?.period).toEqual(GOOD_PERIOD)
    })
  },
)

describe.runIf(HAVE)(
  'Gate 3 pipeline — dealer scope = exactly 295 cells (req 4)',
  () => {
    it('serra-honda/21043 processes ONLY its 295 rows, all dealer 21043', () => {
      const d = run({ profile: 'serra-honda', dealerId: '21043' })
      expect(d.ok).toBe(true)
      expect(d.preflight?.scope_mode).toBe('dealer')
      expect(d.preflight?.cells).toBe(REQUIRED_CELLS_PER_DEALER)
      expect(d.preflight?.required_cells).toBe(295)
      expect(d.preflight?.scope.dealer_ids).toEqual(['21043'])
      expect(d.preflight?.evaluated).toBe(6) // SW-011/012/015/031/032/041 for this one dealer
    })
  },
)

describe.runIf(HAVE)(
  'Gate 3 pipeline — scope/period fail-closed (Defect 2 repair)',
  () => {
    const refused = (r: ReturnType<typeof run>) =>
      r.ok === false && r.preflight === null
    it('fake dealer 99999 with a known profile → ok=false, no preflight', () => {
      expect(
        refused(run({ profile: 'tony-serra-ford', dealerId: '99999' })),
      ).toBe(true)
    })
    it('mismatched known profile/dealer (honda/21044) → ok=false, no preflight', () => {
      expect(refused(run({ profile: 'serra-honda', dealerId: '21044' }))).toBe(
        true,
      )
    })
    it('only one scope value (profile without dealer, dealer without profile) → ok=false', () => {
      expect(refused(run({ profile: 'serra-honda' }))).toBe(true)
      expect(refused(run({ dealerId: '21043' }))).toBe(true)
    })
    it('1900 / stale period → ok=false, no preflight', () => {
      expect(
        refused(
          run({
            profile: 'serra-honda',
            dealerId: '21043',
            period: {
              start: '1900-01-01',
              end: '1900-01-02',
              timezone: 'America/New_York',
            },
          }),
        ),
      ).toBe(true)
    })
    it('wrong timezone → ok=false, no preflight', () => {
      expect(
        refused(
          run({
            profile: 'serra-honda',
            dealerId: '21043',
            period: { start: '2026-08-24', end: '2026-08-30', timezone: 'UTC' },
          }),
        ),
      ).toBe(true)
    })
    it('malformed period → ok=false, no preflight', () => {
      expect(
        refused(
          run({
            profile: 'serra-honda',
            dealerId: '21043',
            period: {
              start: 'not-a-date',
              end: '2026-08-30',
              timezone: 'America/New_York',
            },
          }),
        ),
      ).toBe(true)
    })
    it('customer_final still refused at 18/885 (portfolio) and 6/295 (dealer) — no partial-final PDF', () => {
      const cfPortfolio = runPipeline({
        freshDir: FRESH,
        repoRoot: REPO,
        mode: 'customer_final',
      })
      expect(cfPortfolio.ok).toBe(false)
      expect(cfPortfolio.preflight).toBeNull()
      const cfDealer = runPipeline({
        freshDir: FRESH,
        repoRoot: REPO,
        mode: 'customer_final',
        profile: 'serra-honda',
        dealerId: '21043',
      })
      expect(cfDealer.ok).toBe(false)
      expect(cfDealer.preflight).toBeNull()
      expect(String(cfDealer.refusal_reason)).toMatch(/295/)
    })
    it('deterministic: two portfolio runs produce identical preflight', () => {
      expect(JSON.stringify(run({}).preflight)).toBe(
        JSON.stringify(run({}).preflight),
      )
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
  it('no-quarantine: no evaluated cell sourced from a quarantined family', () => {
    const q = ['lead_source_roi', 'cage_kpi', 'sales_comm_log']
    for (const r of ledger.rows.filter((x) => x.status === 'evaluated'))
      expect(q.includes(r.source_family ?? '')).toBe(false)
  })
  it('missing-not-zero: no evaluated cell has a null/zero denominator', () => {
    for (const r of ledger.rows.filter((x) => x.status === 'evaluated'))
      expect(r.denominator as number).toBeGreaterThan(0)
  })
  it('295/885: exactly 885 cells, 295 unique conditions', () => {
    expect(ledger.rows.length).toBe(885)
    expect(new Set(ledger.rows.map((r) => r.metric_id)).size).toBe(295)
  })
  it('committed portfolio preflight artifact is not a customer deliverable', () => {
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
    expect(art.scope_mode).toBe('portfolio')
    expect(art.cells).toBe(885)
  })
})
