/**
 * Comms pipeline heartbeat.
 *
 * `runDueWork()` stamps this once per pass; the Sentinel reads it to detect a
 * dead driver (no tick ⇒ campaigns / follow-ups / escalations are all stalled).
 * Stored in the Sentinel's own Brain (`sentinel_meta`, key `comms_heartbeat`)
 * so the monitor and the pipeline share one source of truth. Best-effort and
 * never throws — a heartbeat write must never break a comms pass.
 */

import { openBrain } from './brain-store'

const SENTINEL_PROFILE = '_sentinel'

export function stampCommsHeartbeat(
  nowMs: number = Date.now(),
  errorCount = 0,
): void {
  try {
    const brain = openBrain(SENTINEL_PROFILE)
    brain.exec(`CREATE TABLE IF NOT EXISTS sentinel_meta (k TEXT PRIMARY KEY, v INTEGER)`)
    const put = (k: string, v: number) =>
      brain.run(
        `INSERT INTO sentinel_meta (k, v) VALUES (?, ?)
         ON CONFLICT(k) DO UPDATE SET v=excluded.v`,
        k,
        v,
      )
    put('comms_heartbeat', nowMs)
    put('comms_error_count', errorCount)
    put('comms_error_at', nowMs)
  } catch {
    // best effort — never block a comms pass on a heartbeat write
  }
}

export function readCommsHeartbeat(): number | null {
  try {
    const brain = openBrain(SENTINEL_PROFILE)
    const row = brain.get<{ v: number }>(
      `SELECT v FROM sentinel_meta WHERE k='comms_heartbeat'`,
    )
    return row?.v ?? null
  } catch {
    return null
  }
}
