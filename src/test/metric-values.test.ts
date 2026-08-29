import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveMetricValues } from '@/server/watchdog/metric-values'

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'metric-values-'))
  process.env.BRAIN_PROFILES_ROOT = path.join(tmp, '.hermes', 'profiles')
})
afterEach(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
})

describe('resolveMetricValues', () => {
  it('is availability-safe for a store with no source data — withholds everything, no throw', () => {
    const v = resolveMetricValues('nonexistent-store', 30, 1_700_000_000_000)
    // Missing-not-zero: no hub source (0 threads) → engagement.* WITHHELD (absent), not 0.
    expect(v.has('engagement.conversations')).toBe(false)
    expect(v.has('engagement.reply_rate')).toBe(false)
    expect(v.has('engagement.resurrections')).toBe(false)
    // VinSolutions-report metrics are absent on this branch (availability-gated)
    expect(v.has('appt.show_rate')).toBe(false)
    expect(v.has('roi.total_leads')).toBe(false)
    // Nothing fabricated → empty map.
    expect(v.size).toBe(0)
  })
})
