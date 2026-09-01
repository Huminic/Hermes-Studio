// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { assembleGate2Inputs } from '@/server/reports/evaluator/build-from-fresh'
import { EVALUATORS } from '@/server/reports/evaluator/evaluators'

// Focused Gate 4A guard: the Leads reader + SW-011/012/015 evaluators must reproduce the
// controller-ratified aggregates EXACTLY from the accepted bytes (sha-verified in
// assembleGate2Inputs), and the persisted detail must carry NO Sales Rep identity.

const REPO = path.resolve(__dirname, '..', '..')
const FRESH = process.env.HALO_FRESH_DIR ?? '/tmp/halo-295-fresh-20260831'
const LEADS = process.env.HALO_LEADS_DIR ?? '/tmp/halo-295-leads-20260831'
const HAVE =
  fs.existsSync(path.join(FRESH, 'manifest.json')) &&
  fs.existsSync(path.join(LEADS, 'capture-manifest.json'))

type Ratified = {
  pop: number
  numeric: number
  missing: number
  median: number
  untouched: number
  reps: number
  triggered: number
  samples: Array<number>
  maxMean: number
  totalRows: number
  unassigned: number
}

const RATIFIED: Record<string, Ratified> = {
  '21043': {
    pop: 76,
    numeric: 27,
    missing: 49,
    median: 6,
    untouched: 15,
    reps: 4,
    triggered: 2,
    samples: [7, 8],
    maxMean: 424.75,
    totalRows: 119,
    unassigned: 0,
  },
  '21044': {
    pop: 51,
    numeric: 12,
    missing: 39,
    median: 4,
    untouched: 7,
    reps: 4,
    triggered: 3,
    samples: [2, 4, 4],
    maxMean: 469.5,
    totalRows: 68,
    unassigned: 0,
  },
  '21047': {
    pop: 32,
    numeric: 12,
    missing: 20,
    median: 4.5,
    untouched: 1,
    reps: 3,
    triggered: 2,
    samples: [2, 4],
    maxMean: 1264.5,
    totalRows: 43,
    unassigned: 0,
  },
}

describe.runIf(HAVE)(
  'Leads reader + SW-011/012/015 evaluators reproduce the ratified aggregates',
  () => {
    const inputs = assembleGate2Inputs({ freshDir: FRESH, repoRoot: REPO })
    const sortNum = (xs: Array<number>) => [...xs].sort((a, b) => a - b)

    for (const dealer of Object.keys(RATIFIED)) {
      const x = RATIFIED[dealer]
      const d = inputs.dealers.find((y) => y.dealer_id === dealer)!

      it(`${dealer}: readLeadsMetrics matches the ratified aggregates`, () => {
        const L = d.bundle.leads!
        expect(L.business_hours_population).toBe(x.pop)
        expect(L.response_numeric).toBe(x.numeric)
        expect(L.response_missing).toBe(x.missing)
        // missing is NOT zero: numeric + missing == business-hours population.
        expect(L.response_numeric + L.response_missing).toBe(
          L.business_hours_population,
        )
        expect(L.total_rows).toBe(x.totalRows)
        expect(L.unassigned_sales_rep).toBe(x.unassigned)
        expect(L.median_response_min).toBe(x.median)
        expect(L.store_median_min).toBe(x.median)
        expect(L.untouched_strict).toBe(x.untouched)
        expect(L.reps_with_numeric).toBe(x.reps)
        expect(L.triggered_reps).toBe(x.triggered)
        expect(sortNum(L.triggered_rep_sample_sizes)).toEqual(
          sortNum(x.samples),
        )
        expect(L.max_rep_mean_min).toBeCloseTo(x.maxMean, 6)
        expect(L.dealer_ids).toEqual([dealer])
      })

      it(`${dealer}: SW-011 (statistic) / SW-012 / SW-015 evaluators bind value + detail`, () => {
        const b = d.bundle
        const s11 = EVALUATORS['SW-011'](b)
        const s12 = EVALUATORS['SW-012'](b)
        const s15 = EVALUATORS['SW-015'](b)
        expect(s11.ok && s12.ok && s15.ok).toBe(true)
        if (s11.ok) {
          // median in minutes; numerator=coverage, denominator=business-hours population.
          expect(s11.value).toBe(x.median)
          expect(s11.numerator).toBe(x.numeric)
          expect(s11.denominator).toBe(x.pop)
          expect(s11.unit).toBe('minutes')
          expect(s11.detail).toMatchObject({
            coverage_numeric: x.numeric,
            business_hours_population: x.pop,
            missing: x.missing,
          })
        }
        if (s12.ok) {
          expect(s12.numerator).toBe(x.untouched)
          expect(s12.denominator).toBe(x.pop)
          expect(s12.value).toBeCloseTo(x.untouched / x.pop, 6)
        }
        if (s15.ok) {
          expect(s15.numerator).toBe(x.triggered)
          expect(s15.denominator).toBe(x.reps)
          expect(s15.detail).toMatchObject({
            reps_with_numeric: x.reps,
            triggered_rep_count: x.triggered,
            store_median_min: x.median,
          })
        }
      })

      it(`${dealer}: SW-090 unassigned-salesperson rate binds value + detail (no names)`, () => {
        const s90 = EVALUATORS['SW-090'](d.bundle)
        expect(s90.ok).toBe(true)
        if (s90.ok) {
          expect(s90.numerator).toBe(x.unassigned)
          expect(s90.denominator).toBe(x.totalRows)
          expect(s90.value).toBe(x.unassigned / x.totalRows)
          expect(s90.detail).toMatchObject({
            unassigned_sales_rep: x.unassigned,
            total_rows: x.totalRows,
          })
        }
      })

      it(`${dealer}: persisted Leads detail is aggregates only (no Sales Rep name)`, () => {
        const s15 = EVALUATORS['SW-015'](d.bundle)
        expect(s15.ok).toBe(true)
        if (s15.ok && s15.detail) {
          for (const [k, v] of Object.entries(s15.detail)) {
            if (k === 'footnote') {
              expect(typeof v).toBe('string')
              continue
            }
            if (k === 'triggered_rep_sample_sizes') {
              expect(Array.isArray(v)).toBe(true)
              for (const n of v as Array<unknown>)
                expect(typeof n).toBe('number')
              continue
            }
            expect(typeof v === 'number' || v === null).toBe(true)
          }
        }
      })
    }

    it('ADVERSARIAL: a nonzero blank Sales Rep count does NOT auto-fire (unassigned_age_unproved)', () => {
      const d = inputs.dealers.find((y) => y.dealer_id === '21043')!
      // Inject unassigned rows WITHOUT any row-level age evidence: the condition is
      // ">2 hours after creation", so a blank Sales Rep count alone must NOT fire.
      const bundle = {
        ...d.bundle,
        leads: { ...d.bundle.leads!, unassigned_sales_rep: 5 },
      }
      const r = EVALUATORS['SW-090'](bundle)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toMatch(/^unassigned_age_unproved/)
    })

    it('the authentic zero-unassigned SW-090 is evaluated with numerator 0 (no age needed)', () => {
      const d = inputs.dealers.find((y) => y.dealer_id === '21043')!
      const r = EVALUATORS['SW-090'](d.bundle)
      expect(r.ok).toBe(true)
      if (r.ok) {
        expect(r.numerator).toBe(0)
        expect(r.value).toBe(0)
      }
    })
  },
)
