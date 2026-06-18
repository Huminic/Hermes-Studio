/**
 * Dashboard metrics — the Workspace Dashboard backend (Funnel / Leads /
 * Pipeline / AI Activity tabs).
 *
 * Federates three honest sources, per docs/dashboard-brain-schema.md:
 *   - Uploaded VinSolutions ROI/KPI snapshots in the Brain (report_* tables,
 *     populated by report-ingest.ts) → Funnel + Pipeline + Leads-by-source.
 *   - LIVE local comms (messaging-hub.db) → AI Activity comms metrics, with
 *     period-over-period windows.
 *   - LIVE federated VinSolutions lead funnel (via buildCustomerReports) →
 *     Leads tab statuses + names.
 *
 * Anything a source does not provide is returned with status:'pending' and
 * value:null so the UI renders "data source pending" — never a fabricated
 * number (spec honesty rule G).
 */

import { openBrain } from './brain-store'
import { aggregateMessages, listThreads } from './messaging-hub-store'
import { listHunches } from './hunches-store'
import { buildCustomerReports } from './customer-reports'
import type { CustomerReports } from './customer-reports'

const DAY_MS = 24 * 60 * 60 * 1000

// ── Public shapes ───────────────────────────────────────────────────────────

/** Whether a higher value is good ('up') or a lower value is good ('down'). */
export type Polarity = 'up' | 'down'

export type Trend = {
  current: number | null
  prior: number | null
  /** current - prior, or null when either side is unknown. */
  delta: number | null
  direction: 'up' | 'down' | 'flat' | null
  /** True = the change is favorable given the metric's polarity. */
  good: boolean | null
}

export type MetricStatus = 'sourced' | 'pending'
export type MetricUnit = 'count' | 'days' | 'percent' | 'currency'

export type Metric = {
  key: string
  label: string
  unit: MetricUnit
  value: number | null
  polarity: Polarity
  status: MetricStatus
  /** Short human note on where the number came from (or why it's pending). */
  source: string
  trend?: Trend
}

/** One layer of a conversion funnel. */
export type FunnelStage = {
  key: string
  label: string
  now: number | null
  comparison: number | null
  /** % of the previous stage that reached this one (0-1); null for stage 1. */
  conversion: number | null
  /** Period-over-period trend of `now` vs `comparison` (more = better). */
  trend: Trend
  status: MetricStatus
}

export type FunnelTab = {
  /** Green "Lead Performance" conversion funnel + secondary timing metrics. */
  lead_performance: {
    stages: Array<FunnelStage>
    /** Time-to-X metrics (sourced or "data source pending"). */
    timings: Array<Metric>
    comparison_label: string
  }
  /** Blue "Pipeline Performance" conversion funnel. */
  pipeline_performance: { stages: Array<FunnelStage>; comparison_label: string }
  /** Ranked lead-source rows with performance rating + trend. */
  lead_sources: Array<LeadSourceRow>
}

/** Contextual read on a lead source's performance. */
export type LeadRating = 'good' | 'watch' | 'alarm'

export type LeadSourceRow = {
  lead_source: string
  total_leads: number | null
  good_leads: number | null
  appts_set: number | null
  sold_from_leads: number | null
  sold_from_leads_pct: number | null
  total_gross: number | null
  /** good = converts at/above the store average; alarm = volume with no sales. */
  rating: LeadRating
  /** Volume trend vs the prior uploaded report (more = better). */
  trend: Trend
}

export type WidgetUsage = {
  key: string
  label: string
  /** Customer-initiated engagements through this storefront widget surface. */
  engagements: number
  trend: Trend
}

export type LeadsTab = {
  statuses: {
    new: LeadBucket
    active: LeadBucket
    abandoned: LeadBucket
  }
  by_source: Array<{ lead_source: string; total_leads: number | null }>
  source: 'vin-live' | 'pending'
  reason?: string
  /** StoreFront widget usage (engagement by widget surface) over the window. */
  widgets: Array<WidgetUsage>
}

export type LeadBucket = {
  count: number
  /** Resolved names when available (≤ name_resolve_cap); else empty. */
  names: Array<string>
}

export type PipelineTab = {
  rows: Array<{
    salesperson: string
    leads: number | null
    opportunities: number | null
    appointments: number | null
    sales: number | null
    /** leads in the door but no sales — worth a look. */
    alarm: boolean
    /** Sales trend vs the prior uploaded report (more = better). */
    trend: Trend
  }>
  status: MetricStatus
  reason?: string
  comparison_label: string
}

export type AiObservation = {
  overview: string
  what_is_good: Array<string>
  opportunities: Array<string>
}

export type AiActivityTab = {
  metrics: Array<Metric>
  observation: AiObservation
}

export type DashboardPayload = {
  profile: string
  generated_at: number
  window_days: number
  comparison_window_days: number
  funnel: FunnelTab
  leads: LeadsTab
  pipeline: PipelineTab
  ai_activity: AiActivityTab
}

// ── Trend helpers ───────────────────────────────────────────────────────────

function trend(
  current: number | null,
  prior: number | null,
  polarity: Polarity,
): Trend {
  if (current == null || prior == null) {
    return { current, prior, delta: null, direction: null, good: null }
  }
  const delta = current - prior
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  const good =
    direction === 'flat'
      ? null
      : polarity === 'up'
        ? direction === 'up'
        : direction === 'down'
  return { current, prior, delta, direction, good }
}

const PENDING = (
  key: string,
  label: string,
  unit: MetricUnit,
  polarity: Polarity,
  reason: string,
): Metric => ({ key, label, unit, value: null, polarity, status: 'pending', source: reason })

// ── Brain report reads ──────────────────────────────────────────────────────

type RoiRow = {
  lead_source: string
  total_leads: number | null
  good_leads: number | null
  customers_influenced: number | null
  sold_in_timeframe: number | null
  sold_from_leads: number | null
  sold_from_leads_pct: number | null
  avg_days_to_sale: number | null
  avg_days_to_appt_set: number | null
  internet_actual_contact: number | null
  appts_set: number | null
  appts_shown: number | null
  total_gross: number | null
}

type KpiRow = {
  salesperson: string
  internet_leads: number | null
  internet_actual_contact: number | null
  appts_set: number | null
  appts_shown_sold: number | null
}

type ImportRef = { id: string; period_start: string | null; ts: number }

function tableExists(
  handle: ReturnType<typeof openBrain>,
  table: string,
): boolean {
  try {
    const r = handle.get<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      table,
    )
    return !!r
  } catch {
    return false
  }
}

/** The two most-recent imports for a kind (current, prior). */
function latestImports(
  handle: ReturnType<typeof openBrain>,
  kind: 'lead_source_roi' | 'kpi_salesperson',
): { current: ImportRef | null; prior: ImportRef | null } {
  if (!tableExists(handle, 'report_imports')) return { current: null, prior: null }
  // Order by report PERIOD (newest report = current), not ingest time, so the
  // comparison is period-over-period regardless of upload order. Imports with no
  // derivable period fall back to ingest time.
  const rows = handle.all<ImportRef>(
    `SELECT id, period_start, ts FROM report_imports
     WHERE report_kind = ?
     ORDER BY (period_start IS NULL), period_start DESC, ts DESC LIMIT 2`,
    kind,
  )
  return { current: rows[0] ?? null, prior: rows[1] ?? null }
}

function roiRows(
  handle: ReturnType<typeof openBrain>,
  importId: string,
): Array<RoiRow> {
  return handle.all<RoiRow>(
    `SELECT lead_source, total_leads, good_leads, customers_influenced,
            sold_in_timeframe, sold_from_leads, sold_from_leads_pct,
            avg_days_to_sale, avg_days_to_appt_set, internet_actual_contact,
            appts_set, appts_shown, total_gross
       FROM report_lead_source_roi WHERE import_id = ?`,
    importId,
  )
}

function kpiRows(
  handle: ReturnType<typeof openBrain>,
  importId: string,
): Array<KpiRow> {
  return handle.all<KpiRow>(
    `SELECT salesperson, internet_leads, internet_actual_contact,
            appts_set, appts_shown_sold
       FROM report_kpi_salesperson WHERE import_id = ?`,
    importId,
  )
}

const sum = (rows: Array<Record<string, unknown>>, col: string): number | null => {
  const vals = rows.map((r) => r[col]).filter((v): v is number => typeof v === 'number')
  if (vals.length === 0) return null
  return vals.reduce((a, b) => a + b, 0)
}

/** Lead-count-weighted average of a per-source rate/days column. */
const weightedAvg = (
  rows: Array<RoiRow>,
  col: keyof RoiRow,
): number | null => {
  let num = 0
  let den = 0
  for (const r of rows) {
    const v = r[col]
    const w = r.total_leads ?? 0
    if (typeof v === 'number' && w > 0) {
      num += v * w
      den += w
    }
  }
  return den > 0 ? num / den : null
}

// ── Funnel tab ──────────────────────────────────────────────────────────────

/** Build conversion-funnel stages: count per stage, conversion % vs the stage
 *  above (null for the first), and a period-over-period trend vs the prior import. */
function conversionStages(
  rows: Array<RoiRow>,
  priorRows: Array<RoiRow>,
  specs: ReadonlyArray<{ key: string; label: string; col: keyof RoiRow }>,
): Array<FunnelStage> {
  const hasData = rows.length > 0
  return specs.map((s, i) => {
    const now = hasData ? sum(rows, s.col) : null
    const comparison = priorRows.length ? sum(priorRows, s.col) : null
    const prevNow = i > 0 && hasData ? sum(rows, specs[i - 1].col) : null
    const conversion =
      i > 0 && now != null && prevNow != null && prevNow > 0 ? now / prevNow : null
    return {
      key: s.key,
      label: s.label,
      now,
      comparison,
      conversion,
      trend: trend(now, comparison, 'up'),
      status: hasData ? 'sourced' : 'pending',
    }
  })
}

export function buildFunnelTab(
  profile: string,
  opts: { profileRoot?: string } = {},
): FunnelTab {
  const handle = openBrain(profile, { profileRoot: opts.profileRoot })
  try {
    const { current, prior } = latestImports(handle, 'lead_source_roi')
    const rows = current ? roiRows(handle, current.id) : []
    const priorRows = prior ? roiRows(handle, prior.id) : []
    const hasData = rows.length > 0

    const cmpLabel = prior
      ? prior.period_start ?? 'prior import'
      : 'no prior period'

    // Green Lead Performance = a real conversion funnel from the count columns:
    // Leads → Contacted → Appointments Set → Appointments Shown → Sold.
    const leadStages = conversionStages(rows, priorRows, [
      { key: 'leads', label: 'Leads', col: 'total_leads' },
      { key: 'contacted', label: 'Contacted', col: 'internet_actual_contact' },
      { key: 'appt_set', label: 'Appointments Set', col: 'appts_set' },
      { key: 'appt_shown', label: 'Appointments Shown', col: 'appts_shown' },
      { key: 'sold', label: 'Sold', col: 'sold_from_leads' },
    ])
    // Secondary timing metrics (sourced where present; pending otherwise — the
    // current export has days-to-appt-set and days-to-sale, not the others).
    const timing = (key: string, label: string, col: keyof RoiRow): Metric => {
      const value = hasData ? weightedAvg(rows, col) : null
      return {
        key,
        label,
        unit: 'days',
        value,
        polarity: 'down',
        status: value != null ? 'sourced' : 'pending',
        source: value != null ? 'Uploaded lead-source report' : 'data source pending — not in the current report',
        trend: trend(value, priorRows.length ? weightedAvg(priorRows, col) : null, 'down'),
      }
    }
    const timings: Array<Metric> = [
      PENDING('time_to_first_contact', 'Time to First Contact', 'days', 'down', 'data source pending — not in the current report'),
      PENDING('time_to_first_discussion', 'Time to First Discussion', 'days', 'down', 'data source pending — not in the current report'),
      timing('time_to_appt_set', 'Time to Appointment Set', 'avg_days_to_appt_set'),
      PENDING('time_to_appointment', 'Time to Appointment', 'days', 'down', 'data source pending — not in the current report'),
      timing('time_to_sale', 'Time to Sale', 'avg_days_to_sale'),
    ]
    const lead_performance = { stages: leadStages, timings, comparison_label: cmpLabel }

    const pipeline_performance = {
      stages: conversionStages(rows, priorRows, [
        { key: 'leads', label: 'Leads', col: 'total_leads' },
        { key: 'opportunities', label: 'Opportunities', col: 'good_leads' },
        { key: 'appointments', label: 'Appointments', col: 'appts_set' },
        { key: 'sales', label: 'Sales', col: 'sold_from_leads' },
      ]),
      comparison_label: cmpLabel,
    }

    // Contextual rating per lead source: alarm = volume with no sales; good =
    // converts at/above the store-wide sold rate; else watch. Trend = volume vs
    // the same source in the prior uploaded report.
    const priorBySource = new Map(priorRows.map((r) => [r.lead_source, r]))
    const totalLeadsAll = sum(rows, 'total_leads') ?? 0
    const totalSoldAll = sum(rows, 'sold_from_leads') ?? 0
    const overallSoldRate = totalLeadsAll > 0 ? totalSoldAll / totalLeadsAll : 0
    const lead_sources: Array<LeadSourceRow> = rows
      .map((r) => {
        const leads = r.total_leads ?? 0
        const sold = r.sold_from_leads ?? 0
        const rate = r.sold_from_leads_pct ?? (leads > 0 ? sold / leads : 0)
        let rating: LeadRating = 'watch'
        if (leads >= 10 && sold === 0) rating = 'alarm'
        else if (sold > 0 && rate >= overallSoldRate) rating = 'good'
        const prior = priorBySource.get(r.lead_source)
        return {
          lead_source: r.lead_source,
          total_leads: r.total_leads,
          good_leads: r.good_leads,
          appts_set: r.appts_set,
          sold_from_leads: r.sold_from_leads,
          sold_from_leads_pct: r.sold_from_leads_pct,
          total_gross: r.total_gross,
          rating,
          trend: trend(r.total_leads, prior ? prior.total_leads : null, 'up'),
        }
      })
      .sort((a, b) => (b.total_leads ?? 0) - (a.total_leads ?? 0))

    return { lead_performance, pipeline_performance, lead_sources }
  } finally {
    handle.close()
  }
}

// ── Pipeline tab ────────────────────────────────────────────────────────────

export function buildPipelineTab(
  profile: string,
  opts: { profileRoot?: string } = {},
): PipelineTab {
  const handle = openBrain(profile, { profileRoot: opts.profileRoot })
  try {
    const { current, prior } = latestImports(handle, 'kpi_salesperson')
    if (!current) {
      return {
        rows: [],
        status: 'pending',
        reason: 'Upload a salesperson KPI report to populate the pipeline.',
        comparison_label: 'no prior period',
      }
    }
    // Aggregate across lead types per salesperson (a salesperson may have
    // Internet + Phone + Walk-in rows).
    const byPerson = new Map<
      string,
      { leads: number; opportunities: number; appointments: number; sales: number }
    >()
    for (const r of kpiRows(handle, current.id)) {
      const cur = byPerson.get(r.salesperson) ?? {
        leads: 0,
        opportunities: 0,
        appointments: 0,
        sales: 0,
      }
      cur.leads += r.internet_leads ?? 0
      cur.opportunities += r.internet_actual_contact ?? 0
      cur.appointments += r.appts_set ?? 0
      cur.sales += r.appts_shown_sold ?? 0
      byPerson.set(r.salesperson, cur)
    }
    // Prior-import sales per salesperson, for the trend arrow.
    const priorSales = new Map<string, number>()
    if (prior) {
      for (const r of kpiRows(handle, prior.id)) {
        priorSales.set(
          r.salesperson,
          (priorSales.get(r.salesperson) ?? 0) + (r.appts_shown_sold ?? 0),
        )
      }
    }
    const rows = Array.from(byPerson.entries())
      .map(([salesperson, v]) => ({
        salesperson,
        ...v,
        alarm: v.leads > 0 && v.sales === 0,
        trend: trend(v.sales, prior ? (priorSales.get(salesperson) ?? 0) : null, 'up'),
      }))
      .sort((a, b) => b.sales - a.sales || b.leads - a.leads)
    return {
      rows,
      status: 'sourced',
      comparison_label: prior
        ? prior.period_start ?? 'prior import'
        : 'no prior period',
    }
  } finally {
    handle.close()
  }
}

// ── Leads tab ───────────────────────────────────────────────────────────────

/** Status buckets keyed off VinSolutions lead-status families. */
const ACTIVE_HINTS = ['active', 'new', 'working', 'open', 'pending', 'engaged']
const ABANDONED_HINTS = ['lost', 'dead', 'inactive', 'closed', 'abandon', 'bad']

function classifyStatus(status: string): 'new' | 'active' | 'abandoned' {
  const s = status.toLowerCase()
  if (s.includes('new')) return 'new'
  if (ABANDONED_HINTS.some((h) => s.includes(h))) return 'abandoned'
  if (ACTIVE_HINTS.some((h) => s.includes(h))) return 'active'
  return 'active'
}

export function buildLeadsTab(
  reports: CustomerReports,
  funnel: FunnelTab,
  widgets: Array<WidgetUsage> = [],
): LeadsTab {
  const by_source = funnel.lead_sources.map((r) => ({
    lead_source: r.lead_source,
    total_leads: r.total_leads,
  }))

  const lf = reports.lead_funnel
  if (!lf.available) {
    return {
      statuses: {
        new: { count: 0, names: [] },
        active: { count: 0, names: [] },
        abandoned: { count: 0, names: [] },
      },
      by_source,
      source: 'pending',
      reason: lf.reason,
      widgets,
    }
  }
  const buckets = {
    new: { count: 0, names: [] as Array<string> },
    active: { count: 0, names: [] as Array<string> },
    abandoned: { count: 0, names: [] as Array<string> },
  }
  for (const [status, n] of Object.entries(lf.by_status)) {
    buckets[classifyStatus(status)].count += n
  }
  // Attach resolved names from the recent sample where present.
  for (const entry of lf.recent) {
    if (!entry.name) continue
    const b = buckets[classifyStatus(entry.status)]
    if (b.names.length < 25) b.names.push(entry.name)
  }
  return { statuses: buckets, by_source, source: 'vin-live', widgets }
}

/**
 * StoreFront widget usage — customer-initiated engagements per widget surface
 * over the window, with a prior-window trend. Sourced from live messaging-hub
 * inbound messages (the storefront widgets land threads on these channels).
 */
const WIDGET_SURFACES: Array<{ key: string; label: string; channels: Array<string> }> = [
  { key: 'web_chat', label: 'Web Chat', channels: ['chat'] },
  { key: 'lead_form', label: 'Lead Form', channels: ['form'] },
  { key: 'video_chat', label: 'Video Chat', channels: ['video', 'tavus'] },
  { key: 'voice', label: 'Voice / Callback', channels: ['voice', 'vapi', 'callback'] },
]

export function buildWidgetUsage(
  profile: string,
  opts: { now: number; windowDays: number; profileRoot?: string },
): Array<WidgetUsage> {
  void opts.profileRoot
  const sinceMs = opts.now - opts.windowDays * DAY_MS
  const priorSince = opts.now - 2 * opts.windowDays * DAY_MS
  const cur = aggregateMessages(profile, sinceMs)
  const priorWin = aggregateMessages(profile, priorSince)
  const inbound = (
    by: Record<string, { inbound: number; outbound: number }>,
    chs: Array<string>,
  ) => chs.reduce((t, c) => t + (by[c]?.inbound ?? 0), 0)
  return WIDGET_SURFACES.map((w) => {
    const now = inbound(cur.by_channel, w.channels)
    const prior = inbound(priorWin.by_channel, w.channels) - now
    return {
      key: w.key,
      label: w.label,
      engagements: now,
      trend: trend(now, prior, 'up'),
    }
  })
}

// ── AI Activity tab ─────────────────────────────────────────────────────────

function uploadsCount(handle: ReturnType<typeof openBrain>): number {
  if (!tableExists(handle, 'uploads')) return 0
  const r = handle.get<{ c: number }>(`SELECT COUNT(*) AS c FROM uploads`)
  return r?.c ?? 0
}

function chTotal(
  by: Record<string, { inbound: number; outbound: number }>,
  ch: string,
  dir?: 'inbound' | 'outbound',
): number {
  const e = by[ch]
  if (!e) return 0
  return dir ? e[dir] : e.inbound + e.outbound
}

/** Conversations started in the current window and the immediately-prior one,
 *  from a single thread read. */
function conversationCounts(
  profile: string,
  sinceMs: number,
  priorSince: number,
): { current: number; prior: number } {
  const threads = listThreads({ profile, limit: 5000 })
  let current = 0
  let prior = 0
  for (const t of threads) {
    if (t.created_at >= sinceMs) current++
    else if (t.created_at >= priorSince) prior++
  }
  return { current, prior }
}

export function buildAiActivityTab(
  profile: string,
  opts: {
    now: number
    windowDays: number
    profileRoot?: string
    observationContext?: ObservationContext
  },
): AiActivityTab {
  const { now, windowDays } = opts
  const sinceMs = now - windowDays * DAY_MS
  const priorSince = now - 2 * windowDays * DAY_MS

  const cur = aggregateMessages(profile, sinceMs)
  const priorWin = aggregateMessages(profile, priorSince)
  // Prior-period-only = [priorSince, sinceMs): subtract current-window channel
  // counts from the [priorSince, now) aggregate.
  const priorCh = (ch: string, dir?: 'inbound' | 'outbound') =>
    chTotal(priorWin.by_channel, ch, dir) - chTotal(cur.by_channel, ch, dir)

  const handle = openBrain(profile, { profileRoot: opts.profileRoot })
  let uploads = 0
  try {
    uploads = uploadsCount(handle)
  } finally {
    handle.close()
  }
  const hunches = listHunches(profile, { limit: 1000 }).length
  const convo = conversationCounts(profile, sinceMs, priorSince)
  const conversations = convo.current
  const priorConversations = convo.prior

  const m = (
    key: string,
    label: string,
    value: number,
    prior: number | null,
    polarity: Polarity = 'up',
  ): Metric => ({
    key,
    label,
    unit: 'count',
    value,
    polarity,
    status: 'sourced',
    source: 'Live workspace activity',
    trend: trend(value, prior, polarity),
  })

  const metrics: Array<Metric> = [
    m('conversations', 'Conversations', conversations, priorConversations),
    m(
      'calls_received',
      'Calls Received',
      chTotal(cur.by_channel, 'voice', 'inbound') + chTotal(cur.by_channel, 'vapi', 'inbound'),
      priorCh('voice', 'inbound') + priorCh('vapi', 'inbound'),
    ),
    m(
      'video_sessions',
      'Video Sessions',
      chTotal(cur.by_channel, 'video') + chTotal(cur.by_channel, 'tavus'),
      priorCh('video') + priorCh('tavus'),
    ),
    m('web_chats', 'Web Chats', chTotal(cur.by_channel, 'chat'), priorCh('chat')),
    m(
      'emails_sent',
      'Emails Sent',
      chTotal(cur.by_channel, 'email', 'outbound') + chTotal(cur.by_channel, 'email-adf', 'outbound'),
      priorCh('email', 'outbound') + priorCh('email-adf', 'outbound'),
    ),
    m(
      'texts_sent',
      'Texts Sent',
      chTotal(cur.by_channel, 'sms', 'outbound') + chTotal(cur.by_channel, 'textmagic', 'outbound'),
      priorCh('sms', 'outbound') + priorCh('textmagic', 'outbound'),
    ),
    m(
      'calls_made',
      'Calls Made',
      chTotal(cur.by_channel, 'voice', 'outbound') + chTotal(cur.by_channel, 'vapi', 'outbound'),
      priorCh('voice', 'outbound') + priorCh('vapi', 'outbound'),
    ),
    // Hunches + InfoStore updates are cumulative ledgers (not windowed) — no
    // prior-window comparison; trend stays neutral rather than fabricated.
    m('hunches', 'Hunches', hunches, null),
    m('infostore_updates', 'InfoStore Updates', uploads, null),
  ]

  return { metrics, observation: buildObservation(metrics, opts.observationContext) }
}

/**
 * Conservative, rule-based narrative derived ONLY from the real metrics above.
 * Frames anything notable as worth verifying, never as a definitive judgment
 * (spec AI-Observation tone rule).
 */
export type ObservationContext = {
  leadSources?: Array<LeadSourceRow>
  pipelineRows?: PipelineTab['rows']
}

export function buildObservation(
  metrics: Array<Metric>,
  context: ObservationContext = {},
): AiObservation {
  const get = (k: string) => metrics.find((x) => x.key === k)
  const val = (k: string) => get(k)?.value ?? 0
  const totalActivity =
    val('calls_received') +
    val('calls_made') +
    val('texts_sent') +
    val('emails_sent') +
    val('web_chats') +
    val('video_sessions')

  const what_is_good: Array<string> = []
  const opportunities: Array<string> = []

  for (const k of ['texts_sent', 'calls_made', 'web_chats', 'video_sessions']) {
    const mt = get(k)
    if (mt?.trend?.good === true && (mt.value ?? 0) > 0) {
      what_is_good.push(`${mt.label} rose to ${mt.value} this period.`)
    }
  }
  if (val('conversations') > 0) {
    what_is_good.push(`${val('conversations')} conversations were handled this period.`)
  }
  if (val('hunches') > 0) {
    opportunities.push(
      `There ${val('hunches') === 1 ? 'is' : 'are'} ${val('hunches')} open hunch${
        val('hunches') === 1 ? '' : 'es'
      } — it might be worth reviewing them.`,
    )
  }
  for (const k of ['calls_received', 'web_chats', 'texts_sent']) {
    const mt = get(k)
    if (mt?.trend?.good === false) {
      opportunities.push(
        `${mt.label} declined from ${mt.trend.prior} to ${mt.trend.current} — this might be worth verifying.`,
      )
    }
  }
  // Continuity with the Funnel / Leads / Pipeline tables: surface the standout
  // good and the things flagged as alarms so the narrative matches the tables.
  const sources = context.leadSources ?? []
  const topSource = sources
    .filter((s) => (s.sold_from_leads ?? 0) > 0)
    .sort((a, b) => (b.sold_from_leads ?? 0) - (a.sold_from_leads ?? 0))[0]
  if (topSource) {
    what_is_good.push(
      `"${topSource.lead_source}" is the top-selling lead source with ${topSource.sold_from_leads} sales.`,
    )
  }
  for (const s of sources.filter((x) => x.rating === 'alarm').slice(0, 3)) {
    opportunities.push(
      `"${s.lead_source}" brought ${s.total_leads} leads but no sales — this might be worth verifying.`,
    )
  }
  const pipe = context.pipelineRows ?? []
  const topRep = pipe
    .filter((r) => (r.sales ?? 0) > 0)
    .sort((a, b) => (b.sales ?? 0) - (a.sales ?? 0))[0]
  if (topRep) {
    what_is_good.push(`${topRep.salesperson} leads the team with ${topRep.sales} sales.`)
  }
  const stalled = pipe.filter((r) => r.alarm)
  if (stalled.length > 0) {
    opportunities.push(
      `${stalled.length} team member${stalled.length === 1 ? '' : 's'} ${
        stalled.length === 1 ? 'has' : 'have'
      } leads but no sales yet — it might be worth a check-in.`,
    )
  }
  if (what_is_good.length === 0) {
    what_is_good.push('Activity is being tracked; no standout positive change to call out yet.')
  }
  if (opportunities.length === 0) {
    opportunities.push('No declines detected this period that look worth flagging.')
  }

  const overview =
    totalActivity === 0
      ? 'No customer activity was recorded in this period yet. As conversations come in, observations will appear here.'
      : `Across ${totalActivity} customer touchpoints this period, activity looks steady. The notes below are observations, not conclusions — please verify against your own records before acting.`

  return { overview, what_is_good, opportunities }
}

// ── Top-level assembly ──────────────────────────────────────────────────────

export async function buildDashboard(
  profile: string,
  opts: { now?: number; windowDays?: number; profileRoot?: string } = {},
): Promise<DashboardPayload> {
  const now = opts.now ?? Date.now()
  const windowDays = opts.windowDays ?? 30
  const reports = await buildCustomerReports(profile, { now, windowDays })
  const funnel = buildFunnelTab(profile, { profileRoot: opts.profileRoot })
  const pipeline = buildPipelineTab(profile, { profileRoot: opts.profileRoot })
  const widgets = buildWidgetUsage(profile, {
    now,
    windowDays,
    profileRoot: opts.profileRoot,
  })
  const leads = buildLeadsTab(reports, funnel, widgets)
  const ai_activity = buildAiActivityTab(profile, {
    now,
    windowDays,
    profileRoot: opts.profileRoot,
    observationContext: {
      leadSources: funnel.lead_sources,
      pipelineRows: pipeline.rows,
    },
  })
  return {
    profile,
    generated_at: now,
    window_days: windowDays,
    comparison_window_days: windowDays,
    funnel,
    leads,
    pipeline,
    ai_activity,
  }
}
