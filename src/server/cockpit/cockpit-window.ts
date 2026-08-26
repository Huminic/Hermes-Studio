/**
 * Cockpit window computation — a faithful TypeScript port of the Serra report's
 * `compute.py:compute_window()`, run against the studio's own messaging-hub data.
 * Pure (no DB / no I/O) so it is exactly unit-testable; the DB loader wraps it.
 *
 * Definitions match the report exactly:
 *  - touched      = distinct contacts among threads opened in the window
 *  - after_hours  = closed-day OR local hour < open OR >= close (store business hours)
 *  - median_reply = median of (first-outbound − first-inbound) where the customer
 *                   messaged first (the "answered in seconds" clock)
 * Everything is availability-safe: empty inputs yield zeros / null, never throws.
 */
export type HubThread = {
  id: string
  contact_handle: string | null
  channel: string
  created_at: number
}
export type HubMessage = {
  thread_id: string
  direction: 'inbound' | 'outbound'
  created_at: number
  content?: string | null
}
export type BusinessHours = {
  tz: string
  /** open hour (0-23) and close hour (0-23) in local tz */
  openH: number
  closeH: number
  /** weekday short names that are fully closed, e.g. ['Sun'] */
  closedDays: Array<string>
}

/** Intent language (test-drive / appointment) — same regex family as the report. */
export const INTENT_RE =
  /test.?drive|appointment|come (in|by)|swing by|stop (in|by)|schedule|what time|tomorrow|this (weekend|week)|available/i

/** True when a timestamp falls outside the store's posted sales hours. */
export function afterHours(ms: number, bh: BusinessHours): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: bh.tz,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date(ms))
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? ''
  let hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  if (hour === 24) hour = 0 // Intl can emit "24" at midnight
  if (bh.closedDays.includes(weekday)) return true
  return hour < bh.openH || hour >= bh.closeH
}

export type CockpitWindow = {
  threads: number
  touched: number
  replied: number
  conversed: number
  intent: number
  /** Customers silent after the first touch who replied only after a follow-up
   *  (≥2 outbound touches precede their first inbound) — the safety-net saves. */
  resurrections: number
  ah_threads: number
  after_hours_pct: number
  median_reply_secs: number | null
  channels: Record<string, number>
  work: {
    messages_sent: number
    messages_received: number
    messages_after_hours: number
    automation_runs: number
    agent_replies: number
    total: number
  }
}

export type ComputeInputs = {
  threads: Array<HubThread>
  messagesByThread: Map<string, Array<HubMessage>>
  handleToContact: Map<string, string>
  bh: BusinessHours
  /** window lower bound (epoch ms); threads/messages before it are excluded */
  sinceMs: number
  /** window upper bound (epoch ms), default +∞ */
  untilMs?: number
  automationRunsInWindow?: number
  agentRepliesInWindow?: number
}

export function computeCockpitWindow(input: ComputeInputs): CockpitWindow {
  const { threads, messagesByThread, handleToContact, bh, sinceMs } = input
  const untilMs = input.untilMs ?? Number.POSITIVE_INFINITY
  const inWin = (ms: number) => ms >= sinceMs && ms <= untilMs

  const wthreads = threads.filter((t) => inWin(t.created_at))
  const touched = new Set<string>()
  const replied = new Set<string>()
  const conversed = new Set<string>()
  const intent = new Set<string>()
  const resurrections = new Set<string>()
  const channels: Record<string, number> = {}
  let ahThreads = 0
  const latencies: Array<number> = []
  let msgsOut = 0
  let msgsIn = 0
  let msgsOutAh = 0

  for (const t of wthreads) {
    const msgs = messagesByThread.get(t.id) ?? []
    const cid = handleToContact.get(t.contact_handle ?? '') ?? t.contact_handle ?? t.id
    touched.add(cid)
    channels[t.channel] = (channels[t.channel] ?? 0) + 1
    if (afterHours(t.created_at, bh)) ahThreads++

    const ins = msgs.filter((m) => m.direction === 'inbound')
    const outs = msgs.filter((m) => m.direction === 'outbound')
    if (ins.length) {
      replied.add(cid)
      if (ins.length >= 2) conversed.add(cid)
      if (ins.some((m) => INTENT_RE.test(m.content ?? ''))) intent.add(cid)
      // Resurrection: the customer's first reply came only after ≥2 outbound touches
      // (they were silent after touch #1 and revived by the follow-up safety net).
      const firstIn = Math.min(...ins.map((m) => m.created_at))
      const outsBefore = outs.filter((m) => m.created_at < firstIn).length
      if (outsBefore >= 2) resurrections.add(cid)
    }
    if (ins.length && outs.length) {
      const fo = outs[0]
      const fi = ins[0]
      if (fi.created_at < fo.created_at) {
        latencies.push((fo.created_at - fi.created_at) / 1000)
      }
    }
    for (const m of msgs) {
      if (!inWin(m.created_at)) continue
      if (m.direction === 'outbound') {
        msgsOut++
        if (afterHours(m.created_at, bh)) msgsOutAh++
      } else {
        msgsIn++
      }
    }
  }

  latencies.sort((a, b) => a - b)
  const median =
    latencies.length > 0
      ? Math.round(latencies[Math.floor(latencies.length / 2)] * 10) / 10
      : null

  const runs = input.automationRunsInWindow ?? 0
  const replies = input.agentRepliesInWindow ?? 0
  const workTotal = msgsOut + runs + replies

  return {
    threads: wthreads.length,
    touched: touched.size,
    replied: replied.size,
    conversed: conversed.size,
    intent: intent.size,
    resurrections: resurrections.size,
    ah_threads: ahThreads,
    after_hours_pct:
      wthreads.length > 0 ? Math.round((1000 * ahThreads) / wthreads.length) / 10 : 0,
    median_reply_secs: median,
    channels,
    work: {
      messages_sent: msgsOut,
      messages_received: msgsIn,
      messages_after_hours: msgsOutAh,
      automation_runs: runs,
      agent_replies: replies,
      total: workTotal,
    },
  }
}
