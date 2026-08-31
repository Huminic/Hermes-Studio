import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  computeDataFreshness,
  formatDataThrough,
  isFreshEnoughToPublish,
  plainAge,
} from '../server/reports/data-freshness'

describe('data-freshness (pure, injected clock, fail-closed internally)', () => {
  it('formats the data-through date in plain style', () => {
    expect(formatDataThrough('2026-08-30')).toBe('Aug 30, 2026')
    expect(formatDataThrough('2026-01-01')).toBe('Jan 1, 2026')
  })

  it('plain-language age never uses internal words', () => {
    expect(plainAge(0)).toBe('updated today')
    expect(plainAge(1)).toBe('updated yesterday')
    expect(plainAge(3)).toBe('updated 3 days ago')
    expect(plainAge(16)).toBe('updated last week')
    for (const d of [0, 1, 3, 9, 16, 40]) {
      expect(plainAge(d)).not.toMatch(/stale|missing|expired|invalid/i)
    }
  })

  it('data-through = newest accepted period_end; age from injected now', () => {
    const now = new Date('2026-08-31T12:00:00Z')
    const f = computeDataFreshness(['2026-08-30', '2026-08-30', '2026-08-30'], now)
    expect(f.dataThrough).toBe('2026-08-30')
    expect(f.dataThroughLabel).toBe('Aug 30, 2026')
    expect(f.ageDays).toBe(1) // viewed Aug 31, data through Aug 30
    expect(f.state).toBe('current')
    expect(f.ageLabel).toBe('Data through Aug 30, 2026 · updated yesterday')
    expect(isFreshEnoughToPublish(f)).toBe(true)
  })

  it('picks the NEWEST period_end across mixed families', () => {
    const now = new Date('2026-08-31T12:00:00Z')
    const f = computeDataFreshness(['2026-08-23', '2026-08-30', null, undefined, 'bad'], now)
    expect(f.dataThrough).toBe('2026-08-30')
  })

  it('MISSING is fail-closed and never a fabricated date', () => {
    const f = computeDataFreshness([null, undefined, '', 'not-a-date'], new Date('2026-08-31T12:00:00Z'))
    expect(f.state).toBe('missing')
    expect(f.dataThrough).toBeNull()
    expect(f.dataThroughLabel).toBeNull()
    expect(f.ageDays).toBeNull()
    expect(isFreshEnoughToPublish(f)).toBe(false)
    expect(f.ageLabel).toBe('Data not yet available')
  })

  it('aging then STALE past the weekly window (fail-closed internal state)', () => {
    const now = new Date('2026-09-07T12:00:00Z') // 8 days after 2026-08-30
    const aging = computeDataFreshness(['2026-08-30'], now)
    expect(aging.state).toBe('aging')
    expect(isFreshEnoughToPublish(aging)).toBe(true)

    const later = new Date('2026-09-10T12:00:00Z') // 11 days → stale
    const stale = computeDataFreshness(['2026-08-30'], later)
    expect(stale.state).toBe('stale')
    expect(isFreshEnoughToPublish(stale)).toBe(false)
  })
})

import fs from 'node:fs'
import { resolveReportFreshness } from '../server/reports/data-freshness'
const REAL_ROOT = '/srv/ingest-dev/analytics'
const HAVE = fs.existsSync(`${REAL_ROOT}/serra-honda/brain/brain.db`)
describe.runIf(HAVE)('data-freshness from accepted provenance (isolated store)', () => {
  const saved = process.env.BRAIN_PROFILES_ROOT
  beforeAll(() => { process.env.BRAIN_PROFILES_ROOT = REAL_ROOT })
  afterAll(() => { if (saved === undefined) delete process.env.BRAIN_PROFILES_ROOT; else process.env.BRAIN_PROFILES_ROOT = saved })
  it('each store reports data-through 2026-08-30 from accepted families', () => {
    for (const p of ['serra-honda','serra-nissan','tony-serra-ford']) {
      const f = resolveReportFreshness(p, new Date('2026-08-31T12:00:00Z'))
      expect(f.dataThrough).toBe('2026-08-30')
      expect(f.dataThroughLabel).toBe('Aug 30, 2026')
      expect(f.state === 'current' || f.state === 'aging').toBe(true)
      expect(f.ageLabel).not.toMatch(/stale|missing|unavailable/i)
    }
  })
})
