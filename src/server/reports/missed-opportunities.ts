/**
 * "Missed Opportunities (our fault)" report.
 *
 * Surfaces prospects we let down through an AI/automation gap — NOT through a
 * dealer rep's actions. Operator boundary (2026-07-13): once a rep takes a thread
 * over, follow-up is THEIR job; a taken-over thread is out of scope here. So this
 * report deliberately EXCLUDES human-assigned threads and honored opt-outs.
 *
 * Three internal-only signals (no external/VIN dependency, so it never blocks on
 * a broker timeout):
 *   1. Unanswered inbound   — a non-taken-over thread whose last message is an
 *                             inbound customer message aged past the SLA. The AI
 *                             should have replied and didn't; no human owns it.
 *   2. Reply held, unsent   — a Semantic-Guardian / text-gate hold still open or
 *                             escalated (never released) past the SLA.
 *   3. Failed customer send  — outbound SMS the provider rejected (comms_log
 *                             outcome=error) in the window.
 *
 * Pure + deterministic: renders to structured data first; the HTML renderer is a
 * separate pure function so it is unit-testable and reusable as a `report`
 * artifact output (format:'html'). Generic per-profile — no dealer specifics.
 */

import { listThreads } from '../messaging-hub-store'
import { listOpenHolds } from '../messaging-hub-store'
import { isHumanAssigned } from '../thread-takeover'
import { countCommsByRecipient } from '../comms-log'

/** Last-message content that is an opt-out — never counts as "waiting on us". */
const STOP_RE = /^\s*(stop|stopall|unsubscribe|cancel|end|quit|optout|opt-out|remove)\b/i

const DAY_MS = 24 * 60 * 60_000
const DEFAULT_WINDOW_DAYS = 30
/** Unanswered/held past this long counts as a miss. Default 60 min. */
const DEFAULT_SLA_MS = 60 * 60_000

export type MissedCategory = 'unanswered_inbound' | 'reply_held_unsent' | 'failed_send'

export type MissedItem = {
  category: MissedCategory
  contact: string
  thread_id: string | null
  age_hours: number
  occurred_at: number
  detail: string
}

export type MissedSection = {
  key: MissedCategory
  title: string
  description: string
  count: number
  items: Array<MissedItem>
}

export type MissedOpportunitiesReport = {
  profile: string
  generated_at: number
  window_days: number
  sla_minutes: number
  total: number
  sections: Array<MissedSection>
  /** Threads excluded because a human took them over (out of scope, shown for transparency). */
  excluded_taken_over: number
}

function ageHours(now: number, then: number): number {
  return Math.max(0, Math.round(((now - then) / 3_600_000) * 10) / 10)
}

/** Build the structured report. Pure aside from store reads. */
export function buildMissedOpportunities(
  profile: string,
  opts: { now?: number; windowDays?: number; slaMs?: number } = {},
): MissedOpportunitiesReport {
  const now = opts.now ?? Date.now()
  const windowDays = opts.windowDays ?? DEFAULT_WINDOW_DAYS
  const slaMs = opts.slaMs ?? DEFAULT_SLA_MS
  const sinceMs = now - windowDays * DAY_MS

  const unanswered: Array<MissedItem> = []
  const held: Array<MissedItem> = []
  const failed: Array<MissedItem> = []
  let excludedTakenOver = 0

  // 1. Unanswered inbound on non-taken-over threads.
  const threads = listThreads({ profile, limit: 5000 })
  for (const t of threads) {
    const msgs = t.messages
    if (!msgs || msgs.length === 0) continue
    const last = msgs[msgs.length - 1]
    if (last.direction !== 'inbound') continue // last word is ours → not waiting on us
    if (last.created_at < sinceMs) continue // outside window
    if (STOP_RE.test(last.content ?? '')) continue // honored opt-out, not a miss
    if (now - last.created_at < slaMs) continue // still inside SLA
    if (isHumanAssigned(profile, t.id)) {
      excludedTakenOver++ // a rep owns it → their follow-up, out of scope
      continue
    }
    unanswered.push({
      category: 'unanswered_inbound',
      contact: t.contact_handle,
      thread_id: t.id,
      age_hours: ageHours(now, last.created_at),
      occurred_at: last.created_at,
      detail: `"${(last.content ?? '').slice(0, 80)}" — no reply, no human takeover`,
    })
  }

  // 2. Guardian / text-gate holds that never released.
  for (const h of listOpenHolds(profile)) {
    if (h.created_at < sinceMs) continue
    if (now - h.created_at < slaMs) continue
    held.push({
      category: 'reply_held_unsent',
      contact: h.thread_id,
      thread_id: h.thread_id,
      age_hours: ageHours(now, h.created_at),
      occurred_at: h.created_at,
      detail: `reply held (${h.reason}), status ${h.status} — never released`,
    })
  }

  // 3. Failed outbound customer SMS (provider rejected).
  for (const r of countCommsByRecipient(profile, windowDays * DAY_MS, now, 'sms')) {
    if (r.error <= 0) continue
    failed.push({
      category: 'failed_send',
      contact: r.recipient,
      thread_id: null,
      age_hours: 0,
      occurred_at: now,
      detail: `${r.error} of ${r.total} SMS send(s) failed at the provider`,
    })
  }

  const byAge = (a: MissedItem, b: MissedItem) => b.age_hours - a.age_hours
  unanswered.sort(byAge)
  held.sort(byAge)
  failed.sort((a, b) => b.detail.localeCompare(a.detail))

  const sections: Array<MissedSection> = [
    {
      key: 'unanswered_inbound',
      title: 'Prospects waiting on a reply (no human took over)',
      description:
        'The customer sent the last message and no one — AI or human — has answered past the SLA. A rep has not taken the thread over, so this is ours to fix.',
      count: unanswered.length,
      items: unanswered,
    },
    {
      key: 'reply_held_unsent',
      title: 'Replies held by the Guardian and never released',
      description:
        'The Semantic Guardian / text-gate held a reply (unbacked or out-of-window) and it was never released or escalated.',
      count: held.length,
      items: held,
    },
    {
      key: 'failed_send',
      title: 'Outbound texts the provider rejected',
      description:
        'Messages we tried to send that failed delivery at the SMS provider — the prospect never received them.',
      count: failed.length,
      items: failed,
    },
  ]

  return {
    profile,
    generated_at: now,
    window_days: windowDays,
    sla_minutes: Math.round(slaMs / 60_000),
    total: unanswered.length + held.length + failed.length,
    sections,
    excluded_taken_over: excludedTakenOver,
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Render the report as a standalone, printable/exportable HTML document. */
export function renderMissedOpportunitiesHtml(report: MissedOpportunitiesReport): string {
  const asOf = new Date(report.generated_at).toISOString().replace('T', ' ').slice(0, 16)
  const rows = (items: Array<MissedItem>) =>
    items.length
      ? items
          .map(
            (i) =>
              `<tr><td>${esc(i.contact)}</td><td>${i.age_hours ? `${i.age_hours}h` : '—'}</td><td>${esc(i.detail)}</td></tr>`,
          )
          .join('')
      : `<tr><td colspan="3" class="empty">None in this window — nothing missed here.</td></tr>`

  const sections = report.sections
    .map(
      (s) => `
    <section>
      <h2>${esc(s.title)} <span class="count ${s.count ? 'bad' : 'ok'}">${s.count}</span></h2>
      <p class="desc">${esc(s.description)}</p>
      <table><thead><tr><th>Contact</th><th>Age</th><th>Detail</th></tr></thead>
      <tbody>${rows(s.items)}</tbody></table>
    </section>`,
    )
    .join('')

  return `<!doctype html><html><head><meta charset="utf-8">
<title>Missed Opportunities — ${esc(report.profile)}</title>
<style>
  body{font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;max-width:860px;margin:2rem auto;padding:0 1rem}
  h1{font-size:22px;margin:0 0 .25rem} .sub{color:#64748b;margin:0 0 1.5rem}
  h2{font-size:16px;margin:1.75rem 0 .25rem;display:flex;align-items:center;gap:.5rem}
  .desc{color:#64748b;margin:.1rem 0 .6rem}
  .count{font-size:12px;padding:.1rem .5rem;border-radius:999px}
  .count.bad{background:#fef2f2;color:#b91c1c} .count.ok{background:#f0fdf4;color:#15803d}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{text-align:left;padding:.4rem .5rem;border-bottom:1px solid #e2e8f0;vertical-align:top}
  th{color:#475569;font-weight:600} .empty{color:#94a3b8}
  .banner{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:.75rem 1rem;margin:1rem 0}
  .total{font-size:28px;font-weight:700} .foot{color:#94a3b8;font-size:12px;margin-top:2rem}
</style></head><body>
  <h1>Missed Opportunities — ${esc(report.profile)}</h1>
  <p class="sub">Prospects we let down through an AI/automation gap · last ${report.window_days} days · as of ${esc(asOf)} UTC</p>
  <div class="banner"><span class="total">${report.total}</span> total missed · SLA ${report.sla_minutes} min ·
    ${report.excluded_taken_over} thread(s) excluded because a rep took them over (their follow-up, not counted here).</div>
  ${sections}
  <p class="foot">Observations, not conclusions — verify against your own records. Human-taken-over threads and honored opt-outs are intentionally excluded.</p>
</body></html>`
}
