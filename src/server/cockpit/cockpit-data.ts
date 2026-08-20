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
export type CockpitView = {
  reach: GaugeView
  night: GaugeView
  odometer: number
  median_reply_secs: number | null
  heartbeats: Heartbeats
  window_days: number
}

/** Derive gauge/odometer view from a computed window + CRM denominator. Pure. */
export function buildCockpitView(
  win: CockpitWindow,
  opts: {
    crmLeads: number | null
    cumulativeActions: number
    heartbeats: Heartbeats
    windowDays: number
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
  })
}
