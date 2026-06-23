import { describe, expect, it } from 'vitest'
import { sampleHostStats, formatUptime } from '@/server/host-stats'

describe('sampleHostStats', () => {
  it('returns finite, sane numbers', () => {
    const s = sampleHostStats()
    expect(s.cpuCores).toBeGreaterThan(0)
    expect(s.memTotalGb).toBeGreaterThan(0)
    expect(s.memUsedPct).toBeGreaterThanOrEqual(0)
    expect(s.memUsedPct).toBeLessThanOrEqual(100)
    expect(s.cpuPct).toBeGreaterThanOrEqual(0)
    expect(s.cpuPct).toBeLessThanOrEqual(100)
    expect(s.diskUsedPct).toBeGreaterThanOrEqual(0)
    expect(s.diskUsedPct).toBeLessThanOrEqual(100)
    expect(Number.isFinite(s.uptimeSec)).toBe(true)
  })
})

describe('formatUptime', () => {
  it('formats days/hours/minutes', () => {
    expect(formatUptime(90_000)).toBe('1d 1h')
    expect(formatUptime(3_660)).toBe('1h 1m')
    expect(formatUptime(120)).toBe('2m')
    expect(formatUptime(0)).toBe('unknown')
  })
})
