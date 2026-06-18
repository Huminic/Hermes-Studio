/**
 * Comms scheduler — the background cadence Nexxus runs on cron, ported to the
 * Studio. One `runDueWork()` pass:
 *   1. Tick due campaigns for every profile (scheduled outbound sends).
 *   2. Escalate threads whose last inbound has gone unanswered > 30 min
 *      (mirrors Nexxus `checkUnansweredEscalations`): mark + emit an event,
 *      once per thread (no repeats).
 *
 * Driven by `scripts/comms-cron.ts` (system/Hermes cron) and/or
 * `startCommsScheduler()` in a long-running process. Idempotent and never
 * throws — a bad profile is skipped, not fatal.
 */

import { listProfiles } from './profiles-browser'
import { listThreads, getThread } from './messaging-hub-store'
import { publishMessagingEvent } from './messaging-hub-bus'
import { tickCampaigns } from './campaign-worker'
import { tickVinWatcher } from './vin-watcher'
import { tickFlows } from './lead-flow'
import { tickAutomations } from './automations'
import { openBrain } from './brain-store'

export const ESCALATE_AFTER_MS = 30 * 60_000

export type DueWorkSummary = {
  profiles: number
  campaignsTicked: number
  campaignsSent: number
  escalated: number
  /** VIN-watcher new-lead follow-ups dispatched this pass. */
  watcherSent: number
  /** VIN-watcher immediate triggers queued for next 07:00 (out-of-hours). */
  watcherQueued: number
  /** Follow-up flow escalation steps advanced this pass. */
  flowSent: number
  /** Flow enrollments stopped because the lead replied. */
  flowStopped: number
  /** Marketing-automation follow-up sends advanced this pass. */
  automationSent: number
  /** Marketing-automation follow-ups stopped because the lead replied. */
  automationStopped: number
  errors: Array<{ profile: string; error: string }>
}

function escalationTable(profile: string, profileRoot?: string) {
  const h = openBrain(profile, { profileRoot })
  h.exec(
    `CREATE TABLE IF NOT EXISTS thread_escalation (thread_id TEXT PRIMARY KEY, ts INTEGER)`,
  )
  return h
}

function alreadyEscalated(profile: string, threadId: string, profileRoot?: string): boolean {
  try {
    const h = escalationTable(profile, profileRoot)
    return !!h.get<{ thread_id: string }>(
      `SELECT thread_id FROM thread_escalation WHERE thread_id=?`,
      threadId,
    )
  } catch {
    return false
  }
}

function markEscalated(profile: string, threadId: string, nowMs: number, profileRoot?: string) {
  try {
    escalationTable(profile, profileRoot).run(
      `INSERT INTO thread_escalation (thread_id, ts) VALUES (?, ?)
       ON CONFLICT(thread_id) DO NOTHING`,
      threadId,
      nowMs,
    )
  } catch {
    // best effort
  }
}

/** Threads whose last inbound is older than the escalation window and unanswered. */
export function checkEscalations(
  profile: string,
  nowMs: number,
  profileRoot?: string,
): Array<string> {
  const escalated: Array<string> = []
  let threads: Array<{ id: string }> = []
  try {
    threads = listThreads({ profile, status: 'open', limit: 500 })
  } catch {
    return escalated
  }
  for (const t of threads) {
    if (alreadyEscalated(profile, t.id, profileRoot)) continue
    const full = getThread(profile, t.id)
    if (!full || !full.messages.length) continue
    const last = full.messages[full.messages.length - 1]
    // Escalate only when the customer's last message sits unanswered.
    if (last.direction !== 'inbound') continue
    const age = nowMs - (last.created_at ?? 0)
    if (age < ESCALATE_AFTER_MS) continue
    markEscalated(profile, t.id, nowMs, profileRoot)
    try {
      publishMessagingEvent(profile, {
        type: 'thread_escalated',
        thread_id: t.id,
        reason: `unanswered ${Math.round(age / 60000)}m`,
      } as Parameters<typeof publishMessagingEvent>[1])
    } catch {
      // event bus best-effort
    }
    escalated.push(t.id)
  }
  return escalated
}

export async function runDueWork(
  opts: { profiles?: Array<string>; now?: number } = {},
): Promise<DueWorkSummary> {
  const now = opts.now ?? Date.now()
  const profiles = opts.profiles ?? listProfiles().map((p) => p.name)
  const summary: DueWorkSummary = {
    profiles: 0,
    campaignsTicked: 0,
    campaignsSent: 0,
    escalated: 0,
    watcherSent: 0,
    watcherQueued: 0,
    flowSent: 0,
    flowStopped: 0,
    automationSent: 0,
    automationStopped: 0,
    errors: [],
  }
  for (const profile of profiles) {
    summary.profiles++
    try {
      const ticks = await tickCampaigns({ profile, now })
      summary.campaignsTicked += ticks.length
      for (const t of ticks) {
        summary.campaignsSent += (t as { sent?: number }).sent ?? 0
      }
    } catch (err) {
      summary.errors.push({ profile, error: `campaigns: ${(err as Error).message}` })
    }
    try {
      summary.escalated += checkEscalations(profile, now).length
    } catch (err) {
      summary.errors.push({ profile, error: `escalations: ${(err as Error).message}` })
    }
    // VIN-watcher new-lead follow-ups (opt-in per profile; default OFF — an
    // unconfigured/opted-out profile returns a clean skip, not an error).
    try {
      const w = await tickVinWatcher({ profile, now })
      summary.watcherSent += w.sent
      summary.watcherQueued += w.queued
    } catch (err) {
      summary.errors.push({ profile, error: `vin-watcher: ${(err as Error).message}` })
    }
    // Follow-up flow escalation steps (opt-in per profile; a profile with no
    // configured/enabled flow returns a clean zero, not an error).
    try {
      const f = await tickFlows({ profile, now })
      summary.flowSent += f.sent
      summary.flowStopped += f.stopped
    } catch (err) {
      summary.errors.push({ profile, error: `lead-flow: ${(err as Error).message}` })
    }
    // Marketing-automation follow-up sends (opt-in per profile; a profile with no
    // active follow-up automations / due runs returns a clean zero, not an error).
    try {
      const a = await tickAutomations({ profile, now })
      summary.automationSent += a.sent
      summary.automationStopped += a.stopped
    } catch (err) {
      summary.errors.push({ profile, error: `automations: ${(err as Error).message}` })
    }
  }
  return summary
}

let timer: ReturnType<typeof setInterval> | null = null

/** Start the in-process scheduler (idempotent). intervalMs default 60s. */
export function startCommsScheduler(intervalMs = 60_000): void {
  if (timer) return
  timer = setInterval(() => {
    void runDueWork().catch(() => {
      // swallow — next tick retries
    })
  }, intervalMs)
  if (typeof timer.unref === 'function') timer.unref()
}

export function stopCommsScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
