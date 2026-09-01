// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { assembleGate2Inputs } from '@/server/reports/evaluator/build-from-fresh'
import { EVALUATORS } from '@/server/reports/evaluator/evaluators'

// Focused Gate 4B guard: the Dashboard reader extracts the Visit Summary + Appts Show
// primitives (with cross-section verification) and SW-033/045/046 reproduce the
// controller-ratified results EXACTLY from the accepted dealership_performance bytes.

const REPO = path.resolve(__dirname, '..', '..')
const FRESH = process.env.HALO_FRESH_DIR ?? '/tmp/halo-295-fresh-20260831'
const HAVE = fs.existsSync(path.join(FRESH, 'manifest.json'))

type Prim = {
  apptsShow: number
  totalVisits: number
  initialVisits: number
  beBacks: number
  demo: number
  writeup: number
  sw033: number
  sw045: number
  sw046: number
}

const RATIFIED: Record<string, Prim> = {
  '21043': {
    apptsShow: 8,
    totalVisits: 26,
    initialVisits: 24,
    beBacks: 2,
    demo: 0,
    writeup: 0,
    sw033: 0,
    sw045: 2 / 24,
    sw046: 0,
  },
  '21044': {
    apptsShow: 2,
    totalVisits: 17,
    initialVisits: 17,
    beBacks: 0,
    demo: 4,
    writeup: 0,
    sw033: 0,
    sw045: 0,
    sw046: 4 / 17,
  },
  '21047': {
    apptsShow: 2,
    totalVisits: 14,
    initialVisits: 11,
    beBacks: 3,
    demo: 0,
    writeup: 0,
    sw033: 0,
    sw045: 3 / 11,
    sw046: 0,
  },
}

describe.runIf(HAVE)(
  'Dashboard reader + SW-033/045/046 evaluators reproduce the ratified primitives',
  () => {
    const inputs = assembleGate2Inputs({ freshDir: FRESH, repoRoot: REPO })

    for (const dealer of Object.keys(RATIFIED)) {
      const x = RATIFIED[dealer]
      const d = inputs.dealers.find((y) => y.dealer_id === dealer)!

      it(`${dealer}: readDashboardHeld extracts the Visit Summary + Appts Show primitives`, () => {
        const D = d.bundle.dashboard!
        expect(D.apptsShow).toBe(x.apptsShow)
        expect(D.totalVisits).toBe(x.totalVisits)
        expect(D.initialVisits).toBe(x.initialVisits)
        expect(D.beBacks).toBe(x.beBacks)
        expect(D.demo).toBe(x.demo)
        expect(D.writeup).toBe(x.writeup)
      })

      it(`${dealer}: SW-033 / SW-045 / SW-046 evaluators bind the exact ratios`, () => {
        const b = d.bundle
        const s33 = EVALUATORS['SW-033'](b)
        const s45 = EVALUATORS['SW-045'](b)
        const s46 = EVALUATORS['SW-046'](b)
        expect(s33.ok && s45.ok && s46.ok).toBe(true)
        if (s33.ok) {
          expect(s33.numerator).toBe(x.writeup)
          expect(s33.denominator).toBe(x.apptsShow)
          expect(s33.value).toBeCloseTo(x.sw033, 12)
        }
        if (s45.ok) {
          expect(s45.numerator).toBe(x.beBacks)
          expect(s45.denominator).toBe(x.initialVisits)
          expect(s45.value).toBeCloseTo(x.sw045, 12)
        }
        if (s46.ok) {
          expect(s46.numerator).toBe(x.demo)
          expect(s46.denominator).toBe(x.totalVisits)
          expect(s46.value).toBeCloseTo(x.sw046, 12)
        }
      })
    }

    it('SW-033 stays unresolved (NotEvaluable) when Appts Show is 0 (missing != zero)', () => {
      const d = inputs.dealers.find((y) => y.dealer_id === '21043')!
      const bundle = {
        ...d.bundle,
        dashboard: { ...d.bundle.dashboard!, apptsShow: 0 },
      }
      const r = EVALUATORS['SW-033'](bundle)
      expect(r.ok).toBe(false)
    })

    it('SW-045 with Initial Visits=0 & Be Backs>0 is NOT a finite evaluated row (inverted/infinite)', () => {
      const d = inputs.dealers.find((y) => y.dealer_id === '21043')!
      const bundle = {
        ...d.bundle,
        dashboard: { ...d.bundle.dashboard!, initialVisits: 0, beBacks: 3 },
      }
      const r = EVALUATORS['SW-045'](bundle)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toMatch(/inverted\/infinite/)
    })
  },
)
