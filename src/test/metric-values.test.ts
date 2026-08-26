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
  it('is availability-safe for a store with no hub data — honest values, no throw', () => {
    const v = resolveMetricValues('nonexistent-store', 30, 1_700_000_000_000)
    // hub metrics present
    expect(v.has('engagement.conversations')).toBe(true)
    expect(v.get('engagement.conversations')).toBe(0) // no threads → 0 replied (a real zero)
    expect(v.get('engagement.reply_rate')).toBeNull() // no touched → null, never a fabricated 0
    expect(v.get('engagement.resurrections')).toBe(0)
    // VinSolutions-report metrics are absent on this branch (availability-gated)
    expect(v.has('appt.show_rate')).toBe(false)
    expect(v.has('roi.total_leads')).toBe(false)
  })
})
