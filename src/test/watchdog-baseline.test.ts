import { describe, it, expect } from 'vitest'
import {
  classifyDeviation,
  deviationPriority,
  driftDirection,
  mean,
  stddev,
  zScore,
} from '@/server/watchdog/baseline'

describe('baseline stats', () => {
  it('mean + population stddev', () => {
    expect(mean([2, 4, 6])).toBe(4)
    expect(stddev([2, 4, 6])).toBeCloseTo(Math.sqrt(8 / 3), 6)
    expect(stddev([5])).toBe(0)
    expect(mean([])).toBe(0)
  })

  it('zScore needs >=3 samples and non-zero variance, else null (no alarm)', () => {
    expect(zScore(10, [1, 2])).toBeNull() // too few
    expect(zScore(10, [5, 5, 5])).toBeNull() // zero variance
    const z = zScore(10, [2, 4, 6]) // mean 4, sd sqrt(8/3)=1.633
    expect(z).toBeCloseTo((10 - 4) / Math.sqrt(8 / 3), 5)
  })

  it('classifyDeviation: |z|>=3 hard, >=2 soft, else none; null → none', () => {
    expect(classifyDeviation(null)).toBe('none')
    expect(classifyDeviation(1.5)).toBe('none')
    expect(classifyDeviation(-2.2)).toBe('soft')
    expect(classifyDeviation(3.1)).toBe('hard')
  })

  it('deviationPriority maps tiers to Low/Med/High', () => {
    expect(deviationPriority('hard')).toBe('high')
    expect(deviationPriority('soft')).toBe('medium')
    expect(deviationPriority('none')).toBe('low')
  })

  it('driftDirection detects 3 consecutive same-direction steps', () => {
    expect(driftDirection([1, 2, 3, 4])).toBe('up')
    expect(driftDirection([9, 7, 5, 3])).toBe('down')
    expect(driftDirection([1, 2, 1, 2])).toBeNull() // not monotone
    expect(driftDirection([1, 2, 3])).toBeNull() // too short (needs k+1=4)
    expect(driftDirection([5, 5, 5, 5])).toBeNull() // flat is not drift
  })
})
