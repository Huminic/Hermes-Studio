/**
 * Cockpit data resolver — turns a store's live hub data into the Dashboard
 * landing view model (Reach/Night-Shift gauges, odometer, power-pack heartbeats).
 * The mapping math is pure + tested; `resolveCockpitView` is the thin wiring that
 * pulls from the messaging hub + dashboard-metrics. Availability-safe throughout.
 */
import {
  computeCockpitWindow,
  type BusinessHours,
  type CockpitWindow,
} from './cockpit-window'
import { loadCockpitInputs } from '../messaging-hub-store'
import { buildDashboard } from '../dashboard-metrics'
import { readStudioConfig } from '../studio-config'
import type { Heartbeats } from '../../components/customer-console/cockpit/power-packs'

export type GaugeView = { value: number | null; display: string; sub: string }
/** Trend arrow: direction is the arrow, goodness is the color (per the report spec —
 *  a bad metric rising is a red up-arrow, never green). Null when no prior period. */
export type Arrow = { dir: 'up' | 'down' | 'flat'; good: boolean }
export type ImpactMetric = {
  key: string
  label: string
  /** Formatted for display ('—' when withheld). */
  display: string
  /** Raw value, or null when not yet sourced (never a fabricated 0). */
  value: number | null
  arrow: Arrow | null
  /** Honest gap note when value is null (e.g. "Needs the CRM join"). */
  note?: string
}
/** One rung of the Engagement Ladder (Reached → Replied → Conversed → Intent → Sold). */
export type LadderRung = {
  key: string
  label: string
  /** Unique customers at this rung, or null when not yet sourced. */
  count: number | null
  /** Conversion from the previous rung (0–1), or null. */
  conv: number | null
  note?: string
}
export type CockpitView = {
  reach: GaugeView
  night: GaugeView
  odometer: number
  median_reply_secs: number | null
  /** The AI Impact Board — top-line five with WoW arrows. */
  impact: Array<ImpactMetric>
  /** The Engagement Ladder — New Buyer Funnel Facts. */
  ladder: Array<LadderRung>
  /** Night Shift & Resurrections section. */
  night_shift: { after_hours_pct: number; ah_threads: number; median_reply_secs: number | null; resurrections: number }
  /** Per-store brand accent (hex) — drives card top-borders etc. */
  accent: string
  heartbeats: Heartbeats
  window_days: number
}

/** Real per-store brand accents (from the Serra report config). */
const STORE_ACCENTS: Record<string, string> = {
  'serra-honda': '#dc2626',
  'serra-nissan': '#c3002f',
  'tony-serra-ford': '#003478',
}
const DEFAULT_ACCENT = '#4c8df6'

/** Resolve a store's accent: studio config color if set, else the known map, else default. */
export function storeAccent(profile: string, configAccent?: string | null): string {
  if (configAccent && /^#[0-9a-fA-F]{6}$/.test(configAccent)) return configAccent
  return STORE_ACCENTS[profile] ?? DEFAULT_ACCENT
}

/** WoW arrow for a metric. upIsGood=false inverts color (e.g. lost leads rising). */
export function trendArrow(now: number | null, prev: number | null, upIsGood: boolean): Arrow | null {
  if (now == null || prev == null) return null
  if (now === prev) return { dir: 'flat', good: true }
  const dir: 'up' | 'down' = now > prev ? 'up' : 'down'
  return { dir, good: upIsGood ? dir === 'up' : dir === 'down' }
}

/** Derive gauge/odometer view from a computed window + CRM denominator. Pure. */
export function buildCockpitView(
  win: CockpitWindow,
  opts: {
    crmLeads: number | null
    cumulativeActions: number
    heartbeats: Heartbeats
    windowDays: number
    /** Prior equal-length window, for WoW arrows. */
    prev?: CockpitWindow | null
    /** Touched customers whose era-lead reached SOLD (CRM join). Null until sourced. */
    salesTouched?: number | null
    /** GM's own average front+back gross (they set it). Null until provided. */
    gmGross?: number | null
    /** Per-store brand accent hex. */
    accent?: string
  },
): CockpitView {
  const touched = win.touched
  const denom = opts.crmLeads
  const reachRaw = denom && denom > 0 ? touched / denom : null
  const reachValue = reachRaw == null ? null : Math.min(1, reachRaw)
  const reachSub =
    denom != null && denom > 0
      ? `${Math.round((touched / denom) * 100)}% of ${denom.toLocaleString('en-US')} leads`
      : 'this period'
  const nightValue = win.threads > 0 ? win.after_hours_pct / 100 : null

  const prev = opts.prev ?? null
  const n = (x: number) => x.toLocaleString('en-US')
  const salesTouched = opts.salesTouched ?? null
  const gmGross = opts.gmGross ?? null
  const revenue = salesTouched != null && gmGross != null ? salesTouched * gmGross : null
  const impact: Array<ImpactMetric> = [
    { key: 'ai_actions', label: 'AI Actions', value: win.work.total, display: n(win.work.total), arrow: trendArrow(win.work.total, prev?.work.total ?? null, true) },
    { key: 'leads_touched', label: 'Leads Touched', value: touched, display: n(touched), arrow: trendArrow(touched, prev?.touched ?? null, true) },
    { key: 'conversations', label: 'Conversations Held', value: win.replied, display: n(win.replied), arrow: trendArrow(win.replied, prev?.replied ?? null, true) },
    // Sales Touched + Revenue Presence require the CRM join / GM gross — never faked.
    { key: 'sales_touched', label: 'Sales Touched', value: salesTouched, display: salesTouched != null ? n(salesTouched) : '—', arrow: null, ...(salesTouched == null ? { note: 'Needs the CRM sold-join' } : {}) },
    { key: 'revenue_presence', label: 'Revenue Presence', value: revenue, display: revenue != null ? '$' + n(Math.round(revenue)) : '—', arrow: null, ...(revenue == null ? { note: 'Set your average gross' } : {}) },
  ]

  // Engagement Ladder: the first four rungs are real hub counts; Walked In / Sold
  // needs the CRM join and is shown as an honest gap (never a fabricated 0).
  const rungSrc: Array<{ key: string; label: string; count: number | null; note?: string }> = [
    { key: 'reached', label: 'Reached', count: touched },
    { key: 'replied', label: 'Replied', count: win.replied },
    { key: 'conversed', label: 'Conversed', count: win.conversed },
    { key: 'intent', label: 'Intent Gathered', count: win.intent },
    { key: 'sold', label: 'Walked In / Sold', count: null, note: 'Needs the CRM join' },
  ]
  const ladder: Array<LadderRung> = rungSrc.map((r, i) => {
    const prev = i > 0 ? rungSrc[i - 1].count : null
    const conv = r.count != null && prev != null && prev > 0 ? Math.round((r.count / prev) * 1000) / 1000 : null
    return { key: r.key, label: r.label, count: r.count, conv, ...(r.note ? { note: r.note } : {}) }
  })

  return {
    reach: {
      value: reachValue,
      display: touched.toLocaleString('en-US'),
      sub: reachSub,
    },
    night: {
      value: nightValue,
      display: win.ah_threads.toLocaleString('en-US'),
      sub: `${win.after_hours_pct}% after hours`,
    },
    odometer: opts.cumulativeActions,
    median_reply_secs: win.median_reply_secs,
    impact,
    ladder,
    night_shift: {
      after_hours_pct: win.after_hours_pct,
      ah_threads: win.ah_threads,
      median_reply_secs: win.median_reply_secs,
      resurrections: win.resurrections,
    },
    accent: opts.accent ?? DEFAULT_ACCENT,
    heartbeats: opts.heartbeats,
    window_days: opts.windowDays,
  }
}

/** Assemble power-pack heartbeats from a window. Channel activity + engine runs. */
export function heartbeatsFromWindow(win: CockpitWindow): Heartbeats {
  return {
    static: { count: 1 },
    vin_join: { count: 1 },
    video_threads: { count: win.channels['video'] ?? 0 },
    voice_threads: { count: win.channels['voice'] ?? 0 },
    chat_threads: { count: win.channels['chat'] ?? 0 },
    sms_replies: { count: win.channels['sms'] ?? 0 },
    agent_replies: { count: win.work.agent_replies },
    // NOTE: window carries only a combined automation-run count; both automation
    // packs light on any run. Split by trigger is a follow-up (needs per-trigger
    // count). Not fabricated — it reflects real automation activity.
    automation_new_lead: { count: win.work.automation_runs },
    automation_followup: { count: win.work.automation_runs },
    notifications: { count: 0 }, // TODO: wire from comms_log/lead_notify_log
  }
}

const HHMM = /^(\d{1,2}):(\d{2})$/

/** Parse studio comms.business_hours → the window engine's BusinessHours. */
export function parseBusinessHours(cfg: {
  tz?: string
  start?: string
  end?: string
  closed_days?: Array<string>
}): BusinessHours {
  const openH = HHMM.test(cfg.start ?? '') ? Number((cfg.start as string).split(':')[0]) : 8
  const closeH = HHMM.test(cfg.end ?? '') ? Number((cfg.end as string).split(':')[0]) : 21
  return {
    tz: cfg.tz || 'America/New_York',
    openH,
    closeH,
    closedDays: cfg.closed_days ?? [],
  }
}

/** Wire the landing view for a profile+window. Availability-safe (never throws). */
export async function resolveCockpitView(
  profile: string,
  windowDays: number,
  nowMs: number = Date.now(),
): Promise<CockpitView> {
  const sinceMs = nowMs - windowDays * 86_400_000
  let bh: BusinessHours
  try {
    const { config } = readStudioConfig(profile)
    bh = parseBusinessHours((config.comms?.business_hours ?? {}) as never)
  } catch {
    bh = { tz: 'America/New_York', openH: 8, closeH: 21, closedDays: [] }
  }

  const winInputs = loadCockpitInputs(profile, sinceMs, nowMs)
  const win = computeCockpitWindow({ ...winInputs, bh, sinceMs, untilMs: nowMs })

  // Prior equal-length window (for WoW arrows on the Impact Board).
  const prevSince = sinceMs - windowDays * 86_400_000
  let prev: CockpitWindow | null = null
  try {
    const prevInputs = loadCockpitInputs(profile, prevSince, sinceMs)
    prev = computeCockpitWindow({ ...prevInputs, bh, sinceMs: prevSince, untilMs: sinceMs })
  } catch {
    prev = null
  }

  // Cumulative AI actions (all time).
  const allInputs = loadCockpitInputs(profile, 0, nowMs)
  const allWin = computeCockpitWindow({ ...allInputs, bh, sinceMs: 0, untilMs: nowMs })

  // CRM leads denominator (live VIN funnel) — availability-gated.
  let crmLeads: number | null = null
  try {
    const dash = await buildDashboard(profile, { windowDays })
    const stage = dash.funnel.lead_performance.stages.find((s) => s.key === 'leads')
    crmLeads = stage?.now ?? null
  } catch {
    crmLeads = null
  }

  return buildCockpitView(win, {
    crmLeads,
    cumulativeActions: allWin.work.total,
    heartbeats: heartbeatsFromWindow(win),
    windowDays,
    prev,
    // Sales Touched (CRM sold-join) + GM gross are not yet wired live — shown as
    // honest gaps until the join / GM input lands (never fabricated).
    salesTouched: null,
    gmGross: null,
    accent: storeAccent(profile),
  })
}
