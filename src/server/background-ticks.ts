/**
 * In-process background ticks — the comms pipeline driver and the Sentinel
 * monitor, run inside the app process.
 *
 * BOTH are env-gated OFF by default: deploying this code does NOT wake outbound
 * sends or the monitor. Going live is an explicit env change, not a code change.
 *
 *   COMMS_TICK_ENABLED=true     → runDueWork({ profiles }) on an interval.
 *   COMMS_TICK_PROFILES=a,b     → which profiles the comms tick drives.
 *                                 DEFAULT 'serra-honda' (NOT all profiles): the
 *                                 pipeline is otherwise dormant and an unscoped
 *                                 wake would fire every store's automations.
 *   COMMS_TICK_INTERVAL_MS      → default 60000.
 *   SENTINEL_TICK_ENABLED=true  → runSentinelPass() on an interval (monitor
 *                                 only; never sends to customers).
 *   SENTINEL_TICK_INTERVAL_MS   → default 300000 (5m).
 *
 * Engage the prelaunch lock BEFORE enabling the comms tick. Timers are unref'd
 * (never hold the process open) and the starter is idempotent.
 */

import { runDueWork } from './comms-scheduler'
import { runSentinelPass } from './sentinel'

let commsTimer: ReturnType<typeof setInterval> | null = null
let sentinelTimer: ReturnType<typeof setInterval> | null = null

function envInt(name: string, dflt: number): number {
  const n = Number(process.env[name])
  return Number.isFinite(n) && n > 0 ? n : dflt
}

/** Profiles the comms tick drives. Default: serra-honda only (scoped wake). */
export function commsTickProfiles(): Array<string> {
  const raw = process.env.COMMS_TICK_PROFILES
  if (!raw || !raw.trim()) return ['serra-honda']
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export type BackgroundTickDeps = {
  runComms?: (opts: { profiles?: Array<string> }) => Promise<unknown>
  runSentinel?: () => Promise<unknown>
}

/**
 * Start whichever ticks are enabled by env. Idempotent (a second call does not
 * stack timers). Returns which ticks were started this call.
 */
export function startBackgroundTicks(
  deps: BackgroundTickDeps = {},
): { comms: boolean; sentinel: boolean } {
  const runComms = deps.runComms ?? ((opts) => runDueWork(opts))
  const runSentinel = deps.runSentinel ?? (() => runSentinelPass())
  const started = { comms: false, sentinel: false }

  if (process.env.COMMS_TICK_ENABLED === 'true' && !commsTimer) {
    const intervalMs = envInt('COMMS_TICK_INTERVAL_MS', 60_000)
    const profiles = commsTickProfiles()
    commsTimer = setInterval(() => {
      void Promise.resolve(runComms({ profiles })).catch(() => {
        // swallow — the next tick retries; per-pass errors surface via Sentinel.
      })
    }, intervalMs)
    if (typeof commsTimer.unref === 'function') commsTimer.unref()
    started.comms = true
  }

  if (process.env.SENTINEL_TICK_ENABLED === 'true' && !sentinelTimer) {
    const intervalMs = envInt('SENTINEL_TICK_INTERVAL_MS', 5 * 60_000)
    sentinelTimer = setInterval(() => {
      void Promise.resolve(runSentinel()).catch(() => {
        // swallow — the monitor must never crash the host process.
      })
    }, intervalMs)
    if (typeof sentinelTimer.unref === 'function') sentinelTimer.unref()
    started.sentinel = true
  }

  return started
}

export function stopBackgroundTicks(): void {
  if (commsTimer) {
    clearInterval(commsTimer)
    commsTimer = null
  }
  if (sentinelTimer) {
    clearInterval(sentinelTimer)
    sentinelTimer = null
  }
}
