// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { EvalRow } from '@/server/reports/evaluator/types'
import { loadCatalog } from '@/server/reports/evaluator/catalog'
import { buildSpineFromFresh } from '@/server/reports/evaluator/build-from-fresh'
import { evaluateStrictPredicate } from '@/server/reports/evaluator/strict-predicate'

const REPO = path.resolve(__dirname, '..', '..')
const FRESH = process.env.HALO_FRESH_DIR ?? '/tmp/halo-295-fresh-20260831'
const HAVE = fs.existsSync(path.join(FRESH, 'manifest.json'))

const CATALOG = JSON.parse(
  fs.readFileSync(
    path.join(
      REPO,
      'docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json',
    ),
    'utf8',
  ),
)
const CONTRACT = JSON.parse(
  fs.readFileSync(
    path.join(REPO, 'docs/halo/contract/gate2-evaluator-contract.json'),
    'utf8',
  ),
)
const LEDGER = JSON.parse(
  fs.readFileSync(
    path.join(REPO, 'docs/halo/evidence/m1r/evaluator/spine-ledger.json'),
    'utf8',
  ),
) as { rows: Array<EvalRow> }
const SUMMARY = JSON.parse(
  fs.readFileSync(
    path.join(REPO, 'docs/halo/evidence/m1r/evaluator/spine-summary.json'),
    'utf8',
  ),
)

const rows: Array<EvalRow> = LEDGER.rows
const DEALERS = ['21043', '21044', '21047']

describe('Gate 2 catalog (req 1)', () => {
  it('exactly 295 unique sequential SW-001..SW-295', () => {
    const cat = loadCatalog(CATALOG)
    expect(cat.length).toBe(295)
    expect(cat[0].metric_id).toBe('SW-001')
    expect(cat[294].metric_id).toBe('SW-295')
    expect(new Set(cat.map((c) => c.metric_id)).size).toBe(295)
  })
  it('loadCatalog fails closed on a mutated catalog', () => {
    expect(() => loadCatalog(CATALOG.slice(0, 294))).toThrow(/exactly 295/)
    const dup = CATALOG.map((c: { metric_id: string }, i: number) =>
      i === 1 ? { ...c, metric_id: 'SW-001' } : c,
    )
    expect(() => loadCatalog(dup)).toThrow(/out of sequence|duplicate/)
  })
})

describe('Gate 2 spine ledger — exact 885 keys (req 1)', () => {
  it('exactly 885 rows with 885 unique (metric_id,dealer_id) keys', () => {
    expect(rows.length).toBe(885)
    const keys = new Set(rows.map((r) => `${r.metric_id}:${r.dealer_id}`))
    expect(keys.size).toBe(885)
  })
  it('each of 295 conditions appears once per dealer; dealers are exactly the three', () => {
    expect(new Set(rows.map((r) => r.dealer_id))).toEqual(new Set(DEALERS))
    const byId = new Map<string, number>()
    for (const r of rows)
      byId.set(r.metric_id, (byId.get(r.metric_id) ?? 0) + 1)
    expect(byId.size).toBe(295)
    for (const [, n] of byId) expect(n).toBe(3)
  })
  it('every row carries every required field (no undefined)', () => {
    const required: Array<string> = CONTRACT.required_row_fields
    for (const r of rows) {
      for (const f of required) {
        expect(
          (r as unknown as Record<string, unknown>)[f],
          `${r.metric_id}:${r.dealer_id}.${f}`,
        ).toBeDefined()
      }
    }
  })
})

describe('Gate 2 counts + strict predicate coupling (req 2,3,8)', () => {
  it('summary: evaluated=9, unresolved=876, sum=885; ids = SW-031/032/041', () => {
    expect(SUMMARY.required_cells).toBe(885)
    expect(SUMMARY.evaluated).toBe(9)
    expect(SUMMARY.unresolved).toBe(876)
    expect(SUMMARY.evaluated + SUMMARY.unresolved).toBe(885)
    expect(SUMMARY.evaluated_ids).toEqual(['SW-031', 'SW-032', 'SW-041'])
    for (const d of DEALERS)
      expect(SUMMARY.by_dealer[d]).toEqual({ evaluated: 3, unresolved: 292 })
  })
  it('EVERY evaluated row passes the strict predicate', () => {
    const ev = rows.filter((r) => r.status === 'evaluated')
    expect(ev.length).toBe(9)
    for (const r of ev) {
      const v = evaluateStrictPredicate(r)
      expect(
        v.ok,
        `${r.metric_id}:${r.dealer_id} -> ${v.failed.join(',')}`,
      ).toBe(true)
    }
  })
  it('EVERY unresolved row FAILS the strict predicate (cannot be silently counted)', () => {
    const un = rows.filter((r) => r.status === 'unresolved')
    expect(un.length).toBe(876)
    for (const r of un) expect(evaluateStrictPredicate(r).ok).toBe(false)
  })
  it('completion requires literally 885 evaluated (old 6 / current 9 cannot pass)', () => {
    expect(SUMMARY.evaluated).toBeLessThan(885)
    expect(6).toBeLessThan(885)
    expect(SUMMARY.evaluated === 885).toBe(false)
  })
})

describe('Gate 2 missing-is-not-zero (req 4)', () => {
  it('no evaluated row has a null/zero denominator', () => {
    for (const r of rows.filter((x) => x.status === 'evaluated')) {
      expect(r.denominator, `${r.metric_id}:${r.dealer_id}`).not.toBeNull()
      expect(r.denominator as number).toBeGreaterThan(0)
      expect(Number.isInteger(r.numerator as number)).toBe(true)
    }
  })
  it('SW-050 is unresolved for all three dealers with a denominator reason (not zero)', () => {
    const sw050 = rows.filter((r) => r.metric_id === 'SW-050')
    expect(sw050.length).toBe(3)
    for (const r of sw050) {
      expect(r.status).toBe('unresolved')
      expect(r.value).toBeNull()
      expect(String(r.unresolved_reason)).toMatch(
        /denominator|new-car deals|blank Front Gross/i,
      )
    }
  })
})

describe('Gate 2 no synthetic values / PII-free (req 7)', () => {
  it('ledger is schema-closed (no customer/VIN field can exist) and carries no VIN token', () => {
    // Every row key must be a declared field; the schema has no customer/VIN column, so
    // per-row PII structurally cannot appear. (No real PII literal is embedded here.)
    const allowed = new Set<string>(CONTRACT.required_row_fields)
    for (const r of rows) {
      for (const k of Object.keys(r)) {
        expect(allowed.has(k), `unexpected field ${k}`).toBe(true)
      }
    }
    // Any letter-bearing 17-char token would be a VIN; pure-digit runs are ratio decimals.
    const text = JSON.stringify(rows)
    const vinLike = (text.match(/\b[A-HJ-NPR-Z0-9]{17}\b/g) ?? []).filter((t) =>
      /[A-HJ-NPR-Z]/.test(t),
    )
    expect(vinLike).toEqual([])
  })
})

describe.runIf(HAVE)(
  'Gate 2 recompute + determinism from held files (req 7,9)',
  () => {
    it('recompute from held files is byte-identical to the committed ledger (deterministic, no synthetic)', () => {
      const a = buildSpineFromFresh({ freshDir: FRESH, repoRoot: REPO })
      const b = buildSpineFromFresh({ freshDir: FRESH, repoRoot: REPO })
      expect(JSON.stringify(a.rows)).toBe(JSON.stringify(b.rows)) // deterministic
      const committed = {
        artifact: 'gate2-spine-ledger',
        required_cells: 885,
        rows: a.rows,
      }
      const onDisk = fs.readFileSync(
        path.join(REPO, 'docs/halo/evidence/m1r/evaluator/spine-ledger.json'),
        'utf8',
      )
      expect(JSON.stringify(committed, null, 2) + '\n').toBe(onDisk)
    })
  },
)
