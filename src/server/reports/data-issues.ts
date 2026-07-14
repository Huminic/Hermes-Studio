/**
 * "Data Issues / Pipeline Hygiene" report.
 *
 * Rule-based scan for problems in the workspace data that quietly cost sales —
 * NOT an LLM report. Internal-only (hub + comms_log), no live-VIN dependency.
 *
 *   1. Undeliverable contacts — recipients with a high send-failure rate (bad
 *      phone/email → leads we literally cannot reach).
 *   2. Unassigned conversations — open threads with no agent owner.
 *   3. Stuck automation holds — Guardian/text-gate holds aging past 24h.
 *   4. Fragmented contacts — the same phone spread across many threads.
 *
 * Generic per-profile.
 */

import { listThreads, listOpenHolds } from '../messaging-hub-store'
import { countCommsByRecipient } from '../comms-log'

const DAY_MS = 24 * 60 * 60_000
const DEFAULT_WINDOW_DAYS = 30
const FAILURE_RATE_MIN = 0.5 // >=50% failures = undeliverable
const FAILURE_MIN_VOLUME = 2 // need at least this many attempts to judge
const HOLD_STUCK_MS = 24 * 60 * 60_000
const FRAGMENT_MIN_THREADS = 3 // same handle across >= this many threads

export type DataIssue = { subject: string; detail: string }

export type DataIssueSection = {
  key: string
  title: string
  description: string
  count: number
  items: Array<DataIssue>
}

export type DataIssuesReport = {
  profile: string
  generated_at: number
  window_days: number
  total: number
  sections: Array<DataIssueSection>
}

export function buildDataIssues(
  profile: string,
  opts: { now?: number; windowDays?: number } = {},
): DataIssuesReport {
  const now = opts.now ?? Date.now()
  const windowDays = opts.windowDays ?? DEFAULT_WINDOW_DAYS
  const windowMs = windowDays * DAY_MS

  // 1. Undeliverable contacts (email + sms high failure rate).
  const undeliverable: Array<DataIssue> = []
  for (const channel of ['email', 'sms'] as const) {
    for (const r of countCommsByRecipient(profile, windowMs, now, channel)) {
      if (r.total < FAILURE_MIN_VOLUME) continue
      if (r.error / r.total < FAILURE_RATE_MIN) continue
      undeliverable.push({
        subject: r.recipient,
        detail: `${r.error}/${r.total} ${channel} send(s) failed (${Math.round((r.error / r.total) * 100)}%) — likely bad contact info`,
      })
    }
  }

  // 2. Unassigned open conversations + 4. Fragmented contacts (single thread read).
  const threads = listThreads({ profile, limit: 5000 })
  const unassigned: Array<DataIssue> = []
  const byHandle = new Map<string, number>()
  for (const t of threads) {
    byHandle.set(t.contact_handle, (byHandle.get(t.contact_handle) ?? 0) + 1)
    if (t.status === 'open' && !t.assigned_agent_id) {
      unassigned.push({
        subject: t.contact_handle,
        detail: `open ${t.channel} thread with no agent owner`,
      })
    }
  }
  const fragmented: Array<DataIssue> = [...byHandle.entries()]
    .filter(([, n]) => n >= FRAGMENT_MIN_THREADS)
    .sort((a, b) => b[1] - a[1])
    .map(([handle, n]) => ({ subject: handle, detail: `${n} separate threads for the same contact — possible fragmentation/duplication` }))

  // 3. Stuck automation holds (> 24h).
  const stuckHolds: Array<DataIssue> = listOpenHolds(profile)
    .filter((h) => now - h.created_at > HOLD_STUCK_MS)
    .map((h) => ({
      subject: h.thread_id,
      detail: `hold (${h.reason}) open ${Math.round((now - h.created_at) / DAY_MS)}d, status ${h.status} — automation stuck`,
    }))

  const sections: Array<DataIssueSection> = [
    {
      key: 'undeliverable',
      title: 'Undeliverable contacts (bad phone/email)',
      description: 'Recipients whose messages keep failing at the provider — the lead cannot be reached until the contact info is fixed.',
      count: undeliverable.length,
      items: undeliverable,
    },
    {
      key: 'unassigned',
      title: 'Open conversations with no owner',
      description: 'Open threads with no assigned agent — at risk of being missed.',
      count: unassigned.length,
      items: unassigned.slice(0, 100),
    },
    {
      key: 'stuck_holds',
      title: 'Automation holds stuck past 24h',
      description: 'Guardian / text-gate holds that never released or escalated.',
      count: stuckHolds.length,
      items: stuckHolds,
    },
    {
      key: 'fragmented',
      title: 'Fragmented / duplicated contacts',
      description: 'The same phone number spread across several threads — signals duplicate contact records or split history.',
      count: fragmented.length,
      items: fragmented.slice(0, 100),
    },
  ]

  return {
    profile,
    generated_at: now,
    window_days: windowDays,
    total: sections.reduce((t, s) => t + s.count, 0),
    sections,
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function renderDataIssuesHtml(report: DataIssuesReport): string {
  const sections = report.sections
    .map((s) => {
      const rows = s.items.length
        ? s.items
            .map((i) => `<tr><td>${esc(i.subject)}</td><td>${esc(i.detail)}</td></tr>`)
            .join('')
        : `<tr><td colspan="2" class="empty">None found — clean.</td></tr>`
      return `<section>
        <h2>${esc(s.title)} <span class="count ${s.count ? 'bad' : 'ok'}">${s.count}</span></h2>
        <p class="desc">${esc(s.description)}</p>
        <table><thead><tr><th>Contact / Thread</th><th>Issue</th></tr></thead><tbody>${rows}</tbody></table>
      </section>`
    })
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8">
<title>Data Issues — ${esc(report.profile)}</title>
<style>
 body{font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;max-width:860px;margin:2rem auto;padding:0 1rem}
 h1{font-size:22px;margin:0 0 .25rem}.sub{color:#64748b;margin:0 0 1rem}
 h2{font-size:16px;margin:1.5rem 0 .25rem;display:flex;align-items:center;gap:.5rem}
 .desc{color:#64748b;margin:.1rem 0 .5rem}
 .count{font-size:12px;padding:.1rem .5rem;border-radius:999px}
 .count.bad{background:#fef2f2;color:#b91c1c}.count.ok{background:#f0fdf4;color:#15803d}
 table{width:100%;border-collapse:collapse;font-size:13px}
 th,td{text-align:left;padding:.4rem .5rem;border-bottom:1px solid #e2e8f0;vertical-align:top}
 th{color:#475569;font-weight:600}.empty{color:#94a3b8}
 .total{font-size:28px;font-weight:700}
 .foot{color:#94a3b8;font-size:12px;margin-top:2rem}
</style></head><body>
 <h1>Data Issues &amp; Pipeline Hygiene — ${esc(report.profile)}</h1>
 <p class="sub"><span class="total">${report.total}</span> issue(s) found · last ${report.window_days} days</p>
 ${sections}
 <p class="foot">Observations, not conclusions — verify against your own records.</p>
</body></html>`
}
