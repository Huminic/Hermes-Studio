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

export type FunnelTab = {
  /** Green tapered "Lead Performance" funnel — 7 spec metrics. */
  lead_performance: Array<Metric>
  /** Blue tapered "Pipeline Performance" funnel with Now / Comparison. */
  pipeline_performance: {
    stages: Array<{
      key: string
      label: string
      now: number | null
      comparison: number | null
      status: MetricStatus
    }>
    comparison_label: string
  }
  /** Ranked lead-source rows (drives the funnel's "Lead Source Performance"). */
  lead_sources: Array<LeadSourceRow>
}

export type LeadSourceRow = {
  lead_source: string
  total_leads: number | null
  good_leads: number | null
  appts_set: number | null
  sold_from_leads: number | null
  sold_from_leads_pct: number | null
  total_gross: number | null
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
  appts_set: number | null
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
  const rows = handle.all<ImportRef>(
    `SELECT id, period_start, ts FROM report_imports
     WHERE report_kind = ? ORDER BY ts DESC LIMIT 2`,
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
            avg_days_to_sale, avg_days_to_appt_set, appts_set, total_gross
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

    // 7 spec metrics. Several are genuinely absent from the most-recent export
    // (see schema doc) → pending, not fabricated.
    const lead_performance: Array<Metric> = [
      {
        key: 'lead_source_performance',
        label: 'Lead Source Performance',
        unit: 'count',
        value: hasData ? sum(rows, 'total_leads') : null,
        polarity: 'up',
        status: hasData ? 'sourced' : 'pending',
        source: hasData ? 'Uploaded lead-source report' : 'Upload a lead-source report',
        trend: trend(
          sum(rows, 'total_leads'),
          priorRows.length ? sum(priorRows, 'total_leads') : null,
          'up',
        ),
      },
      PENDING(
        'time_to_first_contact',
        'Time to First Contact',
        'days',
        'down',
        'data source pending — not in the current report',
      ),
      PENDING(
        'time_to_first_discussion',
        'Time to First Discussion',
        'days',
        'down',
        'data source pending — not in the current report',
      ),
      {
        key: 'time_to_appt_set',
        label: 'Time to Appointment Set',
        unit: 'days',
        value: hasData ? weightedAvg(rows, 'avg_days_to_appt_set') : null,
        polarity: 'down',
        status: hasData && weightedAvg(rows, 'avg_days_to_appt_set') != null ? 'sourced' : 'pending',
        source: hasData ? 'Uploaded lead-source report' : 'Upload a lead-source report',
        trend: trend(
          weightedAvg(rows, 'avg_days_to_appt_set'),
          priorRows.length ? weightedAvg(priorRows, 'avg_days_to_appt_set') : null,
          'down',
        ),
      },
      PENDING(
        'time_to_appointment',
        'Time to Appointment',
        'days',
        'down',
        'data source pending — not in the current report',
      ),
      {
        key: 'time_to_sale',
        label: 'Time to Sale',
        unit: 'days',
        value: hasData ? weightedAvg(rows, 'avg_days_to_sale') : null,
        polarity: 'down',
        status: hasData && weightedAvg(rows, 'avg_days_to_sale') != null ? 'sourced' : 'pending',
        source: hasData ? 'Uploaded lead-source report' : 'Upload a lead-source report',
        trend: trend(
          weightedAvg(rows, 'avg_days_to_sale'),
          priorRows.length ? weightedAvg(priorRows, 'avg_days_to_sale') : null,
          'down',
        ),
      },
      {
        key: 'total_sales',
        label: 'Total Sales',
        unit: 'count',
        value: hasData ? sum(rows, 'sold_from_leads') : null,
        polarity: 'up',
        status: hasData ? 'sourced' : 'pending',
        source: hasData ? 'Uploaded lead-source report' : 'Upload a lead-source report',
        trend: trend(
          sum(rows, 'sold_from_leads'),
          priorRows.length ? sum(priorRows, 'sold_from_leads') : null,
          'up',
        ),
      },
    ]

    const stage = (
      key: string,
      label: string,
      col: keyof RoiRow,
    ) => ({
      key,
      label,
      now: hasData ? sum(rows, col as string) : null,
      comparison: priorRows.length ? sum(priorRows, col as string) : null,
      status: (hasData ? 'sourced' : 'pending') as MetricStatus,
    })

    const pipeline_performance = {
      stages: [
        stage('leads', 'Leads', 'total_leads'),
        stage('opportunities', 'Opportunities', 'good_leads'),
        stage('appointments', 'Appointments', 'appts_set'),
        stage('sales', 'Sales', 'sold_from_leads'),
      ],
      comparison_label: cmpLabel,
    }

    const lead_sources: Array<LeadSourceRow> = rows
      .map((r) => ({
        lead_source: r.lead_source,
        total_leads: r.total_leads,
        good_leads: r.good_leads,
        appts_set: r.appts_set,
        sold_from_leads: r.sold_from_leads,
        sold_from_leads_pct: r.sold_from_leads_pct,
        total_gross: r.total_gross,
      }))
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
    const rows = Array.from(byPerson.entries())
      .map(([salesperson, v]) => ({ salesperson, ...v }))
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
  return { statuses: buckets, by_source, source: 'vin-live' }
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

function windowedConversations(profile: string, sinceMs: number): number {
  // Conversations started in the window (created_at >= sinceMs).
  return listThreads({ profile, limit: 5000 }).filter((t) => t.created_at >= sinceMs)
    .length
}

export function buildAiActivityTab(
  profile: string,
  opts: { now: number; windowDays: number; profileRoot?: string },
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
  const conversations = windowedConversations(profile, sinceMs)
  const priorConversations =
    listThreads({ profile, limit: 5000 }).filter(
      (t) => t.created_at >= priorSince && t.created_at < sinceMs,
    ).length

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

  return { metrics, observation: buildObservation(metrics) }
}

/**
 * Conservative, rule-based narrative derived ONLY from the real metrics above.
 * Frames anything notable as worth verifying, never as a definitive judgment
 * (spec AI-Observation tone rule).
 */
export function buildObservation(metrics: Array<Metric>): AiObservation {
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
  const leads = buildLeadsTab(reports, funnel)
  const pipeline = buildPipelineTab(profile, { profileRoot: opts.profileRoot })
  const ai_activity = buildAiActivityTab(profile, {
    now,
    windowDays,
    profileRoot: opts.profileRoot,
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
