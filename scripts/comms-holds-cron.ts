#!/usr/bin/env tsx
/**
 * Minimal reply-holds tick — releases Semantic Guardian / text-gate holds only.
 * Deliberately NOT the full runDueWork (that also fires campaigns/automations,
 * which are driven by their own crons). Releases out-of-window deferrals at
 * window open and unbacked holds once knowledge is patched. Self-guarding +
 * idempotent (atomic claim), so it's safe to run every minute.
 */
import { tickReplyHolds } from '../src/server/comms-scheduler'
const profiles = ['serra-honda'] // extend as more stores go live
const now = Date.now()
for (const p of profiles) {
  try {
    const r = await tickReplyHolds({ profile: p, now })
    if (r.released || r.escalated || r.cancelled) {
      console.log(`${new Date(now).toISOString()} ${p}: released=${r.released} escalated=${r.escalated} cancelled=${r.cancelled}`)
    }
  } catch (e) {
    console.error(`${p}: ${(e as Error).message}`)
  }
}
