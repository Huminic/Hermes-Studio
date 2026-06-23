#!/usr/bin/env npx tsx
/**
 * Sentinel daemon — long-running, in-container application health monitor.
 *
 * Runs one `runSentinelPass()` immediately, then every SENTINEL_TICK_INTERVAL_MS
 * (default 5m). Lives as its OWN process (spawned by server-entry.js) so it
 * keeps watching — and emailing — even if the web request handler crashes,
 * while still running inside the app container where the per-profile data and
 * provider keys live.
 *
 * Output is email-only (Resend → SENTINEL_ALERT_EMAIL, default
 * duanekwells@gmail.com) plus the in-app feed. It never sends to customers and
 * never sends SMS. A failing pass is logged and the next tick retries; the
 * daemon never exits on a pass error.
 */
import { runSentinelPass } from '../src/server/sentinel'

const INTERVAL_MS = (() => {
  const n = Number(process.env.SENTINEL_TICK_INTERVAL_MS)
  return Number.isFinite(n) && n > 0 ? n : 5 * 60_000
})()

let running = false

async function tick(): Promise<void> {
  if (running) return // never overlap passes
  running = true
  try {
    const s = await runSentinelPass()
    console.log(
      `[sentinel] pass: ${s.checksRun} checks, ${s.findings.length} finding(s), ` +
        `${s.alertsSent} alert(s), ${s.resolved} resolved, ` +
        `heartbeat=${s.heartbeatSent}, healthy=${s.healthy}` +
        (s.errors.length ? `, ${s.errors.length} check error(s)` : ''),
    )
  } catch (err) {
    console.error('[sentinel] pass failed:', err instanceof Error ? err.message : err)
  } finally {
    running = false
  }
}

console.log(`[sentinel] daemon starting; interval=${Math.round(INTERVAL_MS / 1000)}s`)
void tick()
const timer = setInterval(() => void tick(), INTERVAL_MS)

function shutdown(sig: string): void {
  console.log(`[sentinel] received ${sig}, shutting down`)
  clearInterval(timer)
  process.exit(0)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
