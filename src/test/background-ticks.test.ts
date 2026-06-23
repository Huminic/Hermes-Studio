import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  startBackgroundTicks,
  stopBackgroundTicks,
  commsTickProfiles,
} from '@/server/background-ticks'

const ENV_KEYS = [
  'COMMS_TICK_ENABLED',
  'COMMS_TICK_PROFILES',
  'COMMS_TICK_INTERVAL_MS',
  'SENTINEL_TICK_ENABLED',
  'SENTINEL_TICK_INTERVAL_MS',
]

beforeEach(() => {
  vi.useFakeTimers()
  for (const k of ENV_KEYS) delete process.env[k]
})
afterEach(() => {
  stopBackgroundTicks()
  vi.useRealTimers()
  for (const k of ENV_KEYS) delete process.env[k]
})

describe('background ticks', () => {
  it('starts nothing when both flags are unset (fail-closed)', () => {
    const runComms = vi.fn().mockResolvedValue(undefined)
    const runSentinel = vi.fn().mockResolvedValue(undefined)
    const started = startBackgroundTicks({ runComms, runSentinel })
    expect(started).toEqual({ comms: false, sentinel: false })
    vi.advanceTimersByTime(10 * 60_000)
    expect(runComms).not.toHaveBeenCalled()
    expect(runSentinel).not.toHaveBeenCalled()
  })

  it('comms tick fires scoped to serra-honda by default when enabled', () => {
    process.env.COMMS_TICK_ENABLED = 'true'
    process.env.COMMS_TICK_INTERVAL_MS = '1000'
    const runComms = vi.fn().mockResolvedValue(undefined)
    const started = startBackgroundTicks({ runComms })
    expect(started.comms).toBe(true)
    vi.advanceTimersByTime(2500)
    expect(runComms).toHaveBeenCalled()
    expect(runComms).toHaveBeenLastCalledWith({ profiles: ['serra-honda'] })
  })

  it('honors COMMS_TICK_PROFILES override', () => {
    process.env.COMMS_TICK_ENABLED = 'true'
    process.env.COMMS_TICK_PROFILES = 'serra-honda, tony-serra-ford'
    process.env.COMMS_TICK_INTERVAL_MS = '1000'
    const runComms = vi.fn().mockResolvedValue(undefined)
    startBackgroundTicks({ runComms })
    vi.advanceTimersByTime(1000)
    expect(runComms).toHaveBeenLastCalledWith({
      profiles: ['serra-honda', 'tony-serra-ford'],
    })
  })

  it('sentinel tick fires when enabled; comms stays off', () => {
    process.env.SENTINEL_TICK_ENABLED = 'true'
    process.env.SENTINEL_TICK_INTERVAL_MS = '1000'
    const runComms = vi.fn().mockResolvedValue(undefined)
    const runSentinel = vi.fn().mockResolvedValue(undefined)
    const started = startBackgroundTicks({ runComms, runSentinel })
    expect(started).toEqual({ comms: false, sentinel: true })
    vi.advanceTimersByTime(1000)
    expect(runSentinel).toHaveBeenCalledTimes(1)
    expect(runComms).not.toHaveBeenCalled()
  })

  it('is idempotent — a second start does not stack timers', () => {
    process.env.SENTINEL_TICK_ENABLED = 'true'
    process.env.SENTINEL_TICK_INTERVAL_MS = '1000'
    const runSentinel = vi.fn().mockResolvedValue(undefined)
    startBackgroundTicks({ runSentinel })
    const second = startBackgroundTicks({ runSentinel })
    expect(second.sentinel).toBe(false)
    vi.advanceTimersByTime(1000)
    expect(runSentinel).toHaveBeenCalledTimes(1)
  })

  it('commsTickProfiles defaults to serra-honda', () => {
    expect(commsTickProfiles()).toEqual(['serra-honda'])
  })
})
