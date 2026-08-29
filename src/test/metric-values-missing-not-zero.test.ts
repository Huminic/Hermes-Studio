// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Missing-not-zero for the catalog resolver: an empty/unreadable hub must WITHHOLD
 * engagement.* (absent), not emit the pure helper's absent-as-zero
 * (conversations/resurrections = 0). Real modules, isolated temp root, no data.
 */
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-mnz-'))
const saved = process.env.BRAIN_PROFILES_ROOT
process.env.BRAIN_PROFILES_ROOT = ROOT

import { resolveMetricValues } from '@/server/watchdog/metric-values'

describe('resolveMetricValues — missing-not-zero on an empty hub', () => {
  afterAll(() => {
    if (saved === undefined) delete process.env.BRAIN_PROFILES_ROOT
    else process.env.BRAIN_PROFILES_ROOT = saved
    fs.rmSync(ROOT, { recursive: true, force: true })
  })

  it('withholds all engagement.* (and native) for a store with no source data', () => {
    const v = resolveMetricValues('nobody-empty', 30)
    for (const s of ['engagement.reply_rate', 'engagement.conversations', 'engagement.resurrections']) {
      expect(v.has(s)).toBe(false)
      expect(v.get(s)).toBeUndefined()
    }
    // No native families either → the map is empty (nothing fabricated as 0).
    expect(v.size).toBe(0)
  })
})
