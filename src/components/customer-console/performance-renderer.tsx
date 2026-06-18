/**
 * customer-console.performance — the per-store Workspace Dashboard.
 *
 * Five tabs (spec: Dashboard refactor):
 *   Funnel · Leads · Pipeline · AI Activity · Custom
 *
 * Data is federated server-side (uploaded VinSolutions ROI/KPI snapshots in the
 * Brain + live local comms + live VinSolutions lead funnel) via
 * /api/customer/dashboard. Unsourced metrics arrive as status:'pending' and
 * render "Data source pending" — never fabricated. Custom cards keep using
 * /api/customer/reports + /api/customer/dashboards. Ask AI grounds the existing
 * inference provider in the real dashboard data.
 *
 * Global controls (retained + restyled): date selector (7/30/90), Refresh,
 * Export PDF, Add card.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { StudioConfig } from '../../lib/studio-config'

// ── Theme ───────────────────────────────────────────────────────────────────
const PRIMARY = '#2f3b4d'
const GREEN_FUNNEL = ['#1b5e3f', '#2e7d52', '#3f9968', '#5bb585', '#7fcaa3', '#a7d8be', '#c9e9d6']
const BLUE_FUNNEL = ['#1c3d5a', '#27557d', '#3470a0', '#4f8cbd']
const CHART_PALETTE = [
  '#2f3b4d', '#3f7cac', '#5a9367', '#b5651d', '#7b5ea7', '#c14953', '#2a9d8f', '#e09f3e',
]

// ── Server payload types (mirror src/server/dashboard-metrics.ts) ───────────
type Polarity = 'up' | 'down'
type MetricStatus = 'sourced' | 'pending'
type MetricUnit = 'count' | 'days' | 'percent' | 'currency'
type Trend = {
  current: number | null
  prior: number | null
  delta: number | null
  direction: 'up' | 'down' | 'flat' | null
  good: boolean | null
}
type Metric = {
  key: string
  label: string
  unit: MetricUnit
  value: number | null
  polarity: Polarity
  status: MetricStatus
  source: string
  trend?: Trend
}
type LeadRating = 'good' | 'watch' | 'alarm'
type LeadSourceRow = {
  lead_source: string
  total_leads: number | null
  good_leads: number | null
  appts_set: number | null
  sold_from_leads: number | null
  sold_from_leads_pct: number | null
  total_gross: number | null
  rating: LeadRating
  trend: Trend
}
type FunnelStage = {
  key: string
  label: string
  now: number | null
  comparison: number | null
  conversion: number | null
  trend: Trend
  status: MetricStatus
}
type FunnelTab = {
  lead_performance: { stages: Array<FunnelStage>; timings: Array<Metric>; comparison_label: string }
  pipeline_performance: { stages: Array<FunnelStage>; comparison_label: string }
  lead_sources: Array<LeadSourceRow>
}
type LeadBucket = { count: number; names: Array<string> }
type WidgetUsage = { key: string; label: string; engagements: number; trend: Trend }
type LeadsTab = {
  statuses: { new: LeadBucket; active: LeadBucket; abandoned: LeadBucket }
  by_source: Array<{ lead_source: string; total_leads: number | null }>
  source: 'vin-live' | 'pending'
  reason?: string
  widgets: Array<WidgetUsage>
}
type PipelineRow = {
  salesperson: string
  leads: number | null
  opportunities: number | null
  appointments: number | null
  sales: number | null
  alarm: boolean
  trend: Trend
}
type PipelineTab = {
  rows: Array<PipelineRow>
  status: MetricStatus
  reason?: string
  comparison_label: string
}
type AiActivityTab = {
  metrics: Array<Metric>
  observation: { overview: string; what_is_good: Array<string>; opportunities: Array<string> }
}
type DashboardPayload = {
  profile: string
  generated_at: number
  window_days: number
  comparison_window_days: number
  funnel: FunnelTab
  leads: LeadsTab
  pipeline: PipelineTab
  ai_activity: AiActivityTab
}

// Custom-card types (legacy /api/customer/reports + /dashboards path, retained).
type MessageStats = { total: number; inbound: number; outbound: number; by_channel: Record<string, { inbound: number; outbound: number }> }
type ThreadStats = { total: number; open: number; closed: number; by_domain: Record<string, number> }
type CampaignStats = { campaigns: number; by_status: Record<string, number>; deliveries_sent: number; deliveries_failed: number }
type FollowupStats = { immediate_triggers: number; checkin_triggers: number; last_fire: number | null; sends: { total: number; outbound: number; by_channel: Record<string, number> } }
type LeadFunnel =
  | { available: true; source: 'vin-live'; total: number; by_status: Record<string, number> }
  | { available: false; source: 'vin-live' | 'none'; reason: string }
type Reports = {
  profile: string
  generated_at: number
  comms: { window_days: number; messages: MessageStats; threads: ThreadStats; calls_in: number; texts_out: number }
  followups: FollowupStats
  campaigns: CampaignStats
  lead_funnel: LeadFunnel
}
type DashboardCard = {
  title: string
  source: string
  sources?: Array<string>
  visualization?: 'number' | 'bar' | 'table'
  display?: 'summary' | 'detail'
}
type DashboardsResponse = { ok: boolean; dashboards?: Array<DashboardCard>; sources?: ReadonlyArray<string>; error?: string }
type SavedQuery = { id: string; text: string; created_at: number }

const DASHBOARD_METRIC_SOURCES = [
  'calls', 'video', 'sms', 'email', 'chat', 'leads', 'service', 'sales', 'campaigns', 'followups',
] as const
type DashboardMetricSource = (typeof DASHBOARD_METRIC_SOURCES)[number]
const DASHBOARD_SOURCES = [...DASHBOARD_METRIC_SOURCES, 'federated'] as const
const SOURCE_LABELS: Record<string, string> = {
  calls: 'Calls', video: 'Video', sms: 'Texts', email: 'Emails', chat: 'Web chats',
  leads: 'Leads', service: 'Service threads', sales: 'Sales threads', campaigns: 'Campaigns',
  followups: 'Follow-ups', federated: 'Combined sources',
}
const SOURCE_GROUPS: Array<{ label: string; sources: Array<(typeof DASHBOARD_SOURCES)[number]> }> = [
  { label: 'Combined', sources: ['federated'] },
  { label: 'Communications', sources: ['calls', 'sms', 'email', 'chat', 'video'] },
  { label: 'Customers', sources: ['leads', 'sales', 'service'] },
  { label: 'Campaigns', sources: ['campaigns', 'followups'] },
]

type TabId = 'funnel' | 'leads' | 'pipeline' | 'ai' | 'custom'
type Win = 7 | 30 | 90
const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'funnel', label: 'Funnel' },
  { id: 'leads', label: 'Leads' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'ai', label: 'AI Activity' },
  { id: 'custom', label: 'Custom' },
]
const WINDOWS: Array<{ id: Win; label: string }> = [
  { id: 7, label: '7 days' },
  { id: 30, label: '30 days' },
  { id: 90, label: '90 days' },
]

// ── Formatting ───────────────────────────────────────────────────────────────
function fmt(value: number | null, unit: MetricUnit): string {
  if (value == null) return '—'
  switch (unit) {
    case 'days':
      return `${value.toFixed(1)} days`
    case 'percent':
      return `${(value * 100).toFixed(1)}%`
    case 'currency':
      return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    default:
      return value.toLocaleString()
  }
}

// ── Root ──────────────────────────────────────────────────────────────────────
export function CustomerPerformanceRenderer(props: {
  profile: string
  config: StudioConfig
}) {
  const [tab, setTab] = useState<TabId>('funnel')
  const [windowDays, setWindowDays] = useState<Win>(30)
  const [data, setData] = useState<DashboardPayload | null>(null)
  const [reports, setReports] = useState<Reports | null>(null)
  const [dashboards, setDashboards] = useState<Array<DashboardCard>>([])
  const [availableSources, setAvailableSources] = useState<ReadonlyArray<string>>(DASHBOARD_SOURCES)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    try {
      const dashRes = await fetch(
        `/api/customer/dashboard?profile=${encodeURIComponent(props.profile)}&window_days=${windowDays}`,
        { credentials: 'include' },
      )
      const dashJ = (await dashRes.json().catch(() => ({}))) as { ok: boolean; dashboard?: DashboardPayload }
      if (!dashRes.ok || !dashJ.ok || !dashJ.dashboard) {
        setFailed(true)
        return
      }
      setData(dashJ.dashboard)

      const [reportsResult, dashboardsResult] = await Promise.allSettled([
        fetch(`/api/customer/reports?profile=${encodeURIComponent(props.profile)}`, { credentials: 'include' }),
        fetch(`/api/customer/dashboards?profile=${encodeURIComponent(props.profile)}`, { credentials: 'include' }),
      ])
      if (reportsResult.status === 'fulfilled') {
        const j = (await reportsResult.value.json().catch(() => ({}))) as { ok: boolean; reports?: Reports }
        if (reportsResult.value.ok && j.ok && j.reports) setReports(j.reports)
      }
      if (dashboardsResult.status === 'fulfilled') {
        const j = (await dashboardsResult.value.json().catch(() => ({}))) as DashboardsResponse
        if (dashboardsResult.value.ok && j.ok) {
          setDashboards(j.dashboards ?? [])
          setAvailableSources(j.sources ?? DASHBOARD_SOURCES)
        }
      }
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [props.profile, windowDays])

  useEffect(() => {
    void load()
  }, [load])

  const exportPDF = useCallback(() => {
    if (!data) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(buildPrintDocument(props.profile, data))
    win.document.close()
    setTimeout(() => win.print(), 250)
  }, [data, props.profile])

  if (loading && !data) {
    return <div className="p-4 text-sm text-slate-500">Loading your dashboard…</div>
  }
  if (failed && !data) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        We couldn't load your dashboard just now.
        <button type="button" onClick={() => void load()} className="ml-3 font-medium hover:underline" style={{ color: PRIMARY }}>
          Try again
        </button>
      </div>
    )
  }
  if (!data) return null

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      {/* Header + global controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Dashboard</h2>
          <p className="text-xs text-slate-500">
            Lead funnel, pipeline, and AI activity — last {windowDays} days vs the prior {windowDays}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
            {WINDOWS.map((w) => {
              const active = windowDays === w.id
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setWindowDays(w.id)}
                  className={
                    'rounded-md px-2.5 py-1 text-xs font-semibold transition ' +
                    (active
                      ? 'text-white'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900')
                  }
                  style={active ? { background: PRIMARY } : undefined}
                >
                  {w.label}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={exportPDF}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-95"
            style={{ background: PRIMARY }}
          >
            Export PDF
          </button>
        </div>
      </div>

      {/* Tab bar — standardized to the Marketing/Campaigns tab style. */}
      <div className="-mx-1 overflow-x-auto px-1">
        <div
          role="tablist"
          aria-label="Dashboard sections"
          className="flex min-w-max gap-1 rounded-lg border border-slate-200 bg-white p-1"
        >
          {TABS.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={
                  'whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition ' +
                  (active
                    ? 'text-white'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900')
                }
                style={active ? { background: PRIMARY } : undefined}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {tab === 'funnel' && <FunnelView funnel={data.funnel} />}
      {tab === 'leads' && <LeadsView leads={data.leads} leadSources={data.funnel.lead_sources} />}
      {tab === 'pipeline' && <PipelineView pipeline={data.pipeline} />}
      {tab === 'ai' && <AiActivityView ai={data.ai_activity} />}
      {tab === 'custom' && (
        <CustomView
          profile={props.profile}
          windowDays={windowDays}
          reports={reports}
          dashboards={dashboards}
          setDashboards={setDashboards}
          availableSources={availableSources}
        />
      )}
    </div>
  )
}

// ── Shared atoms ────────────────────────────────────────────────────────────
function TrendBadge({ trend, polarity }: { trend?: Trend; polarity: Polarity }) {
  void polarity
  if (!trend || trend.direction == null || trend.delta == null) {
    return <span className="text-[11px] text-slate-400">no prior period</span>
  }
  if (trend.direction === 'flat') {
    return <span className="text-[11px] text-slate-400">no change</span>
  }
  const color = trend.good === true ? '#15803d' : trend.good === false ? '#b91c1c' : '#64748b'
  const arrow = trend.direction === 'up' ? '▲' : '▼'
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color }}>
      <span>{arrow}</span>
      <span>{Math.abs(trend.delta).toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
    </span>
  )
}

function PendingPill() {
  return (
    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200">
      Data source pending
    </span>
  )
}

/** Compact colored arrow for table cells / between-layer labels. */
function TrendArrow({ trend }: { trend?: Trend }) {
  if (!trend || trend.direction == null || trend.direction === 'flat') {
    return <span className="text-[11px] text-slate-300">–</span>
  }
  const color = trend.good === true ? '#15803d' : trend.good === false ? '#b91c1c' : '#64748b'
  return (
    <span className="text-[11px] font-semibold" style={{ color }} title={`was ${trend.prior}`}>
      {trend.direction === 'up' ? '▲' : '▼'}
      {trend.delta != null ? ` ${Math.abs(trend.delta).toLocaleString(undefined, { maximumFractionDigits: 1 })}` : ''}
    </span>
  )
}

const RATING_STYLE: Record<LeadRating, { label: string; cls: string }> = {
  good: { label: 'Good', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  watch: { label: 'Watch', cls: 'bg-slate-50 text-slate-600 ring-slate-200' },
  alarm: { label: 'Alarm', cls: 'bg-red-50 text-red-700 ring-red-200' },
}
function RatingChip({ rating }: { rating: LeadRating }) {
  const s = RATING_STYLE[rating]
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${s.cls}`}>
      {s.label}
    </span>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
      {children}
    </div>
  )
}

// ── Funnel tab ──────────────────────────────────────────────────────────────

/** Tapered conversion funnel: conversion % inside each bar (first bare), the
 *  count + period-comparison arrow below each bar. */
function ConversionFunnel({
  stages,
  palette,
}: {
  stages: Array<FunnelStage>
  palette: Array<string>
}) {
  return (
    <div className="flex flex-col items-center">
      {stages.map((s, i) => {
        const width = 100 - i * (60 / Math.max(1, stages.length - 1))
        const bg = palette[Math.min(i, palette.length - 1)]
        return (
          <div key={s.key} className="flex w-full flex-col items-center">
            <div
              className="flex items-center justify-between gap-3 rounded-lg px-4 py-2.5 text-white shadow-sm"
              style={{ width: `${width}%`, background: bg }}
            >
              <span className="truncate text-xs font-medium opacity-95">{s.label}</span>
              {i > 0 && s.conversion != null && (
                <span
                  className="shrink-0 rounded-md bg-white/25 px-2 py-0.5 text-xs font-semibold"
                  title={`${(s.conversion * 100).toFixed(0)}% of ${stages[i - 1].label} converted`}
                >
                  {(s.conversion * 100).toFixed(0)}%
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 py-1.5">
              <span className="text-sm font-semibold text-slate-900">
                {s.now != null ? s.now.toLocaleString() : '—'}
              </span>
              <TrendArrow trend={s.trend} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function FunnelView({ funnel }: { funnel: FunnelTab }) {
  return (
    <div className="flex flex-col gap-6">
      <Section title="Lead Performance" subtitle="How is my lead performance?">
        {funnel.lead_performance.stages.every((s) => s.status === 'pending') ? (
          <EmptyNote>Upload a lead-source report in InfoStore to populate lead performance.</EmptyNote>
        ) : (
          <div className="flex flex-col gap-4">
            <ConversionFunnel stages={funnel.lead_performance.stages} palette={GREEN_FUNNEL} />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {funnel.lead_performance.timings.map((t) => (
                <div key={t.key} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <div className="mb-1 text-[11px] text-slate-500">{t.label}</div>
                  {t.status === 'pending' ? (
                    <PendingPill />
                  ) : (
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{fmt(t.value, t.unit)}</span>
                      <TrendArrow trend={t.trend} />
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section title="Pipeline Performance" subtitle="How is the Pipeline Performing?">
        {funnel.pipeline_performance.stages.every((s) => s.status === 'pending') ? (
          <EmptyNote>Upload a lead-source report to populate the pipeline.</EmptyNote>
        ) : (
          <ConversionFunnel stages={funnel.pipeline_performance.stages} palette={BLUE_FUNNEL} />
        )}
      </Section>

      <Section title="Lead Sources" subtitle="Where are my leads coming from?">
        {funnel.lead_sources.length === 0 ? (
          <EmptyNote>No lead-source data yet — upload a lead-source report in InfoStore.</EmptyNote>
        ) : (
          <>
            <ChartCard
              rows={funnel.lead_sources.slice(0, 8).map((r) => ({ label: r.lead_source, value: r.total_leads ?? 0 }))}
            />
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th className="px-3 py-2 text-left font-medium">Lead source</th>
                    <th className="px-3 py-2 text-right font-medium">Leads</th>
                    <th className="px-3 py-2 text-right font-medium">vs prior</th>
                  </tr>
                </thead>
                <tbody>
                  {funnel.lead_sources.map((r) => (
                    <tr key={r.lead_source} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2 text-slate-700">{r.lead_source}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{r.total_leads ?? '—'}</td>
                      <td className="px-3 py-2 text-right"><TrendArrow trend={r.trend} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Section>
    </div>
  )
}

// ── Leads tab ──────────────────────────────────────────────────────────────
function LeadsView({
  leads,
  leadSources,
}: {
  leads: LeadsTab
  leadSources: Array<LeadSourceRow>
}) {
  const buckets: Array<{ key: 'new' | 'active' | 'abandoned'; label: string }> = [
    { key: 'new', label: 'New' },
    { key: 'active', label: 'Active' },
    { key: 'abandoned', label: 'Abandoned' },
  ]
  return (
    <div className="flex flex-col gap-6">
      <Section title="Leads" subtitle="How are my leads doing right now?">
        {leads.source === 'pending' ? (
          <EmptyNote>{leads.reason ?? 'Lead reporting is not enabled for this store yet.'}</EmptyNote>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {buckets.map(({ key, label }) => {
              const b = leads.statuses[key]
              return (
                <div key={key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-2xl font-semibold text-slate-900">{b.count.toLocaleString()}</div>
                  <div className="mt-1 text-xs text-slate-500">{label}</div>
                  {b.names.length > 0 && (
                    <ul className="mt-2 max-h-32 space-y-0.5 overflow-y-auto text-[11px] text-slate-500">
                      {b.names.map((n, i) => (
                        <li key={i} className="truncate">{n}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Section>

      <Section title="Lead Source Performance" subtitle="Which lead sources are performing?">
        {leadSources.length === 0 ? (
          <EmptyNote>No lead-source data yet — upload a lead-source report in InfoStore.</EmptyNote>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="px-3 py-2 text-left font-medium">Lead source</th>
                  <th className="px-3 py-2 text-right font-medium">Leads</th>
                  <th className="px-3 py-2 text-right font-medium">Good</th>
                  <th className="px-3 py-2 text-right font-medium">Appts</th>
                  <th className="px-3 py-2 text-right font-medium">Sold</th>
                  <th className="px-3 py-2 text-right font-medium">Gross</th>
                  <th className="px-3 py-2 text-center font-medium">vs prior</th>
                  <th className="px-3 py-2 text-center font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {leadSources.map((r) => (
                  <tr key={r.lead_source} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 text-slate-700">{r.lead_source}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{r.total_leads ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{r.good_leads ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{r.appts_set ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{r.sold_from_leads ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{r.total_gross != null ? fmt(r.total_gross, 'currency') : '—'}</td>
                    <td className="px-3 py-2 text-center"><TrendArrow trend={r.trend} /></td>
                    <td className="px-3 py-2 text-center"><RatingChip rating={r.rating} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="StoreFront Widgets" subtitle="Which storefront widgets are customers using?">
        {leads.widgets.every((w) => w.engagements === 0) ? (
          <EmptyNote>No storefront widget engagements recorded in this period yet.</EmptyNote>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {leads.widgets.map((w) => (
                <div key={w.key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-2xl font-semibold text-slate-900">{w.engagements.toLocaleString()}</div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">{w.label}</span>
                    <TrendArrow trend={w.trend} />
                  </div>
                </div>
              ))}
            </div>
            <ChartCard rows={leads.widgets.map((w) => ({ label: w.label, value: w.engagements }))} />
          </>
        )}
      </Section>
    </div>
  )
}

// ── Pipeline tab ─────────────────────────────────────────────────────────────
function PipelineView({ pipeline }: { pipeline: PipelineTab }) {
  return (
    <Section title="Pipeline by Salesperson" subtitle="How is each salesperson performing?">
      {pipeline.status === 'pending' ? (
        <EmptyNote>{pipeline.reason ?? 'Upload a salesperson KPI report in InfoStore to populate the pipeline.'}</EmptyNote>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="px-3 py-2 text-left font-medium">Salesperson</th>
                <th className="px-3 py-2 text-right font-medium">Leads</th>
                <th className="px-3 py-2 text-right font-medium">Opportunities</th>
                <th className="px-3 py-2 text-right font-medium">Appointments</th>
                <th className="px-3 py-2 text-right font-medium">Sales</th>
                <th className="px-3 py-2 text-center font-medium">vs prior</th>
                <th className="px-3 py-2 text-center font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {pipeline.rows.map((r) => (
                <tr key={r.salesperson} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 text-slate-700">{r.salesperson}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{r.leads ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{r.opportunities ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{r.appointments ?? '—'}</td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-900">{r.sales ?? '—'}</td>
                  <td className="px-3 py-2 text-center"><TrendArrow trend={r.trend} /></td>
                  <td className="px-3 py-2 text-center">
                    {r.alarm ? (
                      <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 ring-1 ring-red-200">
                        No sales
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-300">–</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}

// ── AI Activity tab ──────────────────────────────────────────────────────────
function AiActivityView({ ai }: { ai: AiActivityTab }) {
  return (
    <div className="flex flex-col gap-6">
      <Section title="AI Observation" subtitle="Observations, not conclusions — please verify against your own records.">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-700">{ai.observation.overview}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">What is good</div>
              <ul className="list-disc space-y-1 pl-4 text-xs text-slate-600">
                {ai.observation.what_is_good.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">Opportunities to improve</div>
              <ul className="list-disc space-y-1 pl-4 text-xs text-slate-600">
                {ai.observation.opportunities.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          </div>
        </div>
      </Section>

      <Section title="AI Performance Data">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {ai.metrics.map((m) => (
            <div key={m.key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-2xl font-semibold text-slate-900">{m.value != null ? m.value.toLocaleString() : '—'}</div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500">{m.label}</span>
                <TrendBadge trend={m.trend} polarity={m.polarity} />
              </div>
            </div>
          ))}
        </div>
        <ChartCard rows={ai.metrics.map((m) => ({ label: m.label, value: m.value ?? 0 }))} />
      </Section>
    </div>
  )
}

// ── Custom tab (Ask AI + Saved + retained custom cards) ──────────────────────
function CustomView(props: {
  profile: string
  windowDays: Win
  reports: Reports | null
  dashboards: Array<DashboardCard>
  setDashboards: (cards: Array<DashboardCard>) => void
  availableSources: ReadonlyArray<string>
}) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [askError, setAskError] = useState<string | null>(null)
  const [saved, setSaved] = useState<Array<SavedQuery>>([])

  const loadSaved = useCallback(async () => {
    try {
      const res = await fetch(`/api/customer/dashboard-queries?profile=${encodeURIComponent(props.profile)}`, { credentials: 'include' })
      const j = (await res.json().catch(() => ({}))) as { ok: boolean; queries?: Array<SavedQuery> }
      if (res.ok && j.ok) setSaved(j.queries ?? [])
    } catch {
      /* best effort */
    }
  }, [props.profile])

  useEffect(() => {
    void loadSaved()
  }, [loadSaved])

  const ask = useCallback(
    async (q: string) => {
      const text = q.trim()
      if (!text) return
      setAsking(true)
      setAskError(null)
      setAnswer(null)
      try {
        const res = await fetch('/api/customer/dashboard-ask', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile: props.profile, question: text, window_days: props.windowDays }),
        })
        const j = (await res.json().catch(() => ({}))) as { ok: boolean; answer?: string; error?: string }
        if (!res.ok || !j.ok) {
          setAskError(j.error ?? 'Ask AI is unavailable right now.')
          return
        }
        setAnswer(j.answer ?? '')
      } catch {
        setAskError('Ask AI is unavailable right now.')
      } finally {
        setAsking(false)
      }
    },
    [props.profile, props.windowDays],
  )

  const save = useCallback(async () => {
    const text = question.trim()
    if (!text) return
    try {
      const res = await fetch('/api/customer/dashboard-queries', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: props.profile, text }),
      })
      const j = (await res.json().catch(() => ({}))) as { ok: boolean; queries?: Array<SavedQuery> }
      if (res.ok && j.ok) setSaved(j.queries ?? [])
    } catch {
      /* best effort */
    }
  }, [props.profile, question])

  const removeSaved = useCallback(
    async (id: string) => {
      try {
        const res = await fetch('/api/customer/dashboard-queries', {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile: props.profile, id }),
        })
        const j = (await res.json().catch(() => ({}))) as { ok: boolean; queries?: Array<SavedQuery> }
        if (res.ok && j.ok) setSaved(j.queries ?? [])
      } catch {
        /* best effort */
      }
    },
    [props.profile],
  )

  const reset = () => {
    setAnswer(null)
    setAskError(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <Section title="Ask AI" subtitle="Ask a question about your dashboard data in plain language.">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {answer == null ? (
            <div className="flex flex-col gap-3">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. Which lead source produced the most sales this period?"
                rows={3}
                className="w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void ask(question)}
                  disabled={asking || !question.trim()}
                  className="rounded-md px-4 py-1.5 text-sm font-medium text-white transition hover:brightness-95 disabled:opacity-50"
                  style={{ background: PRIMARY }}
                >
                  {asking ? 'Thinking…' : 'Ask'}
                </button>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={!question.trim()}
                  className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
              {askError && <div className="text-xs text-red-600">{askError}</div>}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="text-xs font-medium text-slate-500">{question}</div>
                <button
                  type="button"
                  onClick={reset}
                  aria-label="Ask another question"
                  title="Ask another question"
                  className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
                >
                  ✏️ New
                </button>
              </div>
              <p className="whitespace-pre-wrap text-sm text-slate-800">{answer || '(no answer)'}</p>
            </div>
          )}
        </div>
      </Section>

      <Section title="Saved" subtitle="Click a saved question to run it again.">
        {saved.length === 0 ? (
          <EmptyNote>No saved questions yet.</EmptyNote>
        ) : (
          <div className="flex flex-col gap-1.5">
            {saved.map((q) => (
              <div key={q.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                <button
                  type="button"
                  onClick={() => {
                    setQuestion(q.text)
                    void ask(q.text)
                  }}
                  className="flex-1 truncate text-left text-sm text-slate-700 hover:text-slate-900"
                >
                  {q.text}
                </button>
                <button
                  type="button"
                  onClick={() => void removeSaved(q.id)}
                  aria-label="Delete saved question"
                  className="shrink-0 rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-50"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <CustomCards
        profile={props.profile}
        reports={props.reports}
        dashboards={props.dashboards}
        setDashboards={props.setDashboards}
        availableSources={props.availableSources}
      />
    </div>
  )
}

// ── Charts ────────────────────────────────────────────────────────────────────
function ChartCard({ rows }: { rows: Array<{ label: string; value: number }> }) {
  const data = rows.filter((r) => r.value > 0)
  if (data.length === 0) return null
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm" style={{ width: '100%', height: Math.max(160, data.length * 34 + 30) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 18, bottom: 4, left: 6 }}>
          <CartesianGrid horizontal={false} stroke="#eef2f6" />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
          <YAxis type="category" dataKey="label" width={130} tick={{ fontSize: 11, fill: '#64748b' }} />
          <Tooltip cursor={{ fill: '#f1f5f9' }} formatter={(v: number) => v.toLocaleString()} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {data.map((row, i) => (
              <Cell key={row.label} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Custom cards (retained Add-card builder over /api/customer/reports) ───────
const VISUALIZATIONS: Array<{ id: NonNullable<DashboardCard['visualization']>; label: string }> = [
  { id: 'number', label: 'Number' },
  { id: 'bar', label: 'Bar' },
  { id: 'table', label: 'Table' },
]
const DISPLAYS: Array<{ id: NonNullable<DashboardCard['display']>; label: string }> = [
  { id: 'summary', label: 'Summary' },
  { id: 'detail', label: 'Detailed' },
]

function CustomCards(props: {
  profile: string
  reports: Reports | null
  dashboards: Array<DashboardCard>
  setDashboards: (cards: Array<DashboardCard>) => void
  availableSources: ReadonlyArray<string>
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [title, setTitle] = useState('')
  const [source, setSource] = useState('')
  const [sources, setSources] = useState<Array<DashboardMetricSource>>(['calls', 'sms', 'leads'])
  const [visualization, setVisualization] = useState<NonNullable<DashboardCard['visualization']>>('number')
  const [display, setDisplay] = useState<NonNullable<DashboardCard['display']>>('summary')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (props.availableSources.length > 0 && !source) setSource(props.availableSources[0] ?? '')
  }, [props.availableSources, source])

  const persist = useCallback(
    async (cards: Array<DashboardCard>) => {
      setBusy(true)
      setError(null)
      try {
        const res = await fetch('/api/customer/dashboards', {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile: props.profile, dashboards: cards }),
        })
        const j = (await res.json().catch(() => ({}))) as DashboardsResponse
        if (!res.ok || !j.ok) {
          setError(j.error ?? 'Could not save card.')
          return false
        }
        props.setDashboards(j.dashboards ?? [])
        return true
      } catch {
        setError('Could not save card.')
        return false
      } finally {
        setBusy(false)
      }
    },
    [props],
  )

  const add = useCallback(async () => {
    const t = title.trim()
    if (!t || !source) return
    if (source === 'federated' && sources.length < 2) {
      setError('Choose at least two sources for a combined card.')
      return
    }
    const ok = await persist([
      ...props.dashboards,
      { title: t, source, sources: source === 'federated' ? sources : [], visualization, display },
    ])
    if (ok) {
      setTitle('')
      setShowAdd(false)
      setVisualization('number')
      setDisplay('summary')
    }
  }, [title, source, sources, visualization, display, props.dashboards, persist])

  return (
    <Section title="Your cards" subtitle="Build saved metric cards from your live activity.">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowAdd(!showAdd)}
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          {showAdd ? 'Cancel' : '+ Add card'}
        </button>
      </div>
      {showAdd && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_160px_130px_130px_auto]">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Card title"
              className="min-w-0 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
            />
            <select value={source} onChange={(e) => setSource(e.target.value)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700">
              {SOURCE_GROUPS.map((group) => {
                const gs = group.sources.filter((s) => props.availableSources.includes(s))
                if (gs.length === 0) return null
                return (
                  <optgroup key={group.label} label={group.label}>
                    {gs.map((s) => (
                      <option key={s} value={s}>{SOURCE_LABELS[s] ?? s}</option>
                    ))}
                  </optgroup>
                )
              })}
            </select>
            <select aria-label="Visualization" value={visualization} onChange={(e) => setVisualization(e.target.value as NonNullable<DashboardCard['visualization']>)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700">
              {VISUALIZATIONS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
            <select aria-label="Display" value={display} onChange={(e) => setDisplay(e.target.value as NonNullable<DashboardCard['display']>)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700">
              {DISPLAYS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
            <button type="button" onClick={() => void add()} disabled={busy || !title.trim()} className="rounded-md px-4 py-1.5 text-sm font-medium text-white transition hover:brightness-95 disabled:opacity-50" style={{ background: PRIMARY }}>
              {busy ? 'Saving…' : 'Add'}
            </button>
          </div>
          {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
          {source === 'federated' && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {DASHBOARD_METRIC_SOURCES.map((s) => {
                const checked = sources.includes(s)
                return (
                  <label key={s} className="flex items-center gap-2 rounded-md border border-slate-100 bg-white px-2 py-1.5 text-xs text-slate-700">
                    <input type="checkbox" checked={checked} onChange={() => setSources((prev) => (checked ? prev.filter((x) => x !== s) : [...prev, s]))} />
                    {SOURCE_LABELS[s] ?? s}
                  </label>
                )
              })}
            </div>
          )}
        </div>
      )}
      {props.reports == null ? (
        <EmptyNote>Live activity is loading…</EmptyNote>
      ) : props.dashboards.length === 0 ? (
        <EmptyNote>No custom cards yet. Use <strong>+ Add card</strong> to create one.</EmptyNote>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {props.dashboards.map((card, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-2xl font-semibold text-slate-900">{resolveCardValue(props.reports!, card).toLocaleString()}</div>
                  <div className="mt-1 text-xs text-slate-500">{card.title}</div>
                  <div className="mt-1 text-[11px] text-slate-400">{SOURCE_LABELS[card.source] ?? card.source}</div>
                </div>
                <button
                  type="button"
                  onClick={() => void persist(props.dashboards.filter((_, idx) => idx !== i))}
                  className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-50"
                >
                  Remove
                </button>
              </div>
              {(card.visualization === 'bar' || card.visualization === 'table') && (
                <div className="mt-3">
                  {card.visualization === 'bar' ? (
                    <ChartCard rows={resolveCardRows(props.reports!, card)} />
                  ) : (
                    <div className="overflow-hidden rounded-md border border-slate-100">
                      {resolveCardRows(props.reports!, card).map((row) => (
                        <div key={row.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-slate-100 px-3 py-2 text-xs last:border-0">
                          <span className="truncate text-slate-500">{row.label}</span>
                          <span className="font-semibold text-slate-800">{row.value.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

function metricSources(card: DashboardCard): Array<string> {
  if (card.source !== 'federated') return [card.source]
  return (card.sources ?? []).filter((s): s is DashboardMetricSource =>
    (DASHBOARD_METRIC_SOURCES as readonly string[]).includes(s),
  )
}
function resolveMetricValue(reports: Reports, source: string): number {
  const chTotal = (ch: string) => {
    const c = reports.comms.messages.by_channel[ch]
    return c ? c.inbound + c.outbound : 0
  }
  switch (source) {
    case 'calls': return reports.comms.calls_in || chTotal('voice') || chTotal('vapi') || chTotal('phone')
    case 'video': return chTotal('video') + chTotal('tavus')
    case 'sms': return reports.comms.texts_out || chTotal('sms')
    case 'email': return chTotal('email') + chTotal('email-adf')
    case 'chat': return chTotal('chat')
    case 'leads': return reports.lead_funnel.available ? reports.lead_funnel.total : reports.comms.threads.total
    case 'service': return reports.comms.threads.by_domain['service'] ?? 0
    case 'sales': return reports.comms.threads.by_domain['sales'] ?? 0
    case 'campaigns': return reports.campaigns.campaigns
    case 'followups': return reports.followups.immediate_triggers + reports.followups.checkin_triggers
    default: return 0
  }
}
function resolveCardValue(reports: Reports, card: DashboardCard): number {
  return metricSources(card).reduce((t, s) => t + resolveMetricValue(reports, s), 0)
}
function resolveCardRows(reports: Reports, card: DashboardCard): Array<{ label: string; value: number }> {
  if (card.source !== 'federated') {
    return [{ label: SOURCE_LABELS[card.source] ?? card.source, value: resolveMetricValue(reports, card.source) }]
  }
  return metricSources(card).map((s) => ({ label: SOURCE_LABELS[s] ?? s, value: resolveMetricValue(reports, s) }))
}

// ── PDF export ────────────────────────────────────────────────────────────────
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
function buildPrintDocument(profile: string, d: DashboardPayload): string {
  const safeProfile = escapeHtml(profile)
  const lp = [
    ...d.funnel.lead_performance.stages.map(
      (s) => `<tr><td>${escapeHtml(s.label)}${s.conversion != null ? ` (${(s.conversion * 100).toFixed(0)}%)` : ''}</td><td>${s.now ?? '—'}</td></tr>`,
    ),
    ...d.funnel.lead_performance.timings.map(
      (m) => `<tr><td>${escapeHtml(m.label)}</td><td>${m.status === 'pending' ? 'Data source pending' : escapeHtml(fmt(m.value, m.unit))}</td></tr>`,
    ),
  ].join('')
  const pipe = d.funnel.pipeline_performance.stages
    .map((s) => `<tr><td>${escapeHtml(s.label)}</td><td>${s.now ?? '—'}</td><td>${s.comparison ?? '—'}</td></tr>`)
    .join('')
  const sources = d.funnel.lead_sources
    .map((r) => `<tr><td>${escapeHtml(r.lead_source)}</td><td>${r.total_leads ?? '—'}</td><td>${r.sold_from_leads ?? '—'}</td></tr>`)
    .join('')
  const pipeRows = d.pipeline.status === 'pending'
    ? '<tr><td colspan="5">Data source pending</td></tr>'
    : d.pipeline.rows.map((r) => `<tr><td>${escapeHtml(r.salesperson)}</td><td>${r.leads ?? '—'}</td><td>${r.opportunities ?? '—'}</td><td>${r.appointments ?? '—'}</td><td>${r.sales ?? '—'}</td></tr>`).join('')
  const ai = d.ai_activity.metrics
    .map((m) => `<tr><td>${escapeHtml(m.label)}</td><td>${m.value ?? '—'}</td></tr>`)
    .join('')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Dashboard - ${safeProfile}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:40px;color:#0f172a}h1{font-size:24px;margin-bottom:4px}h2{font-size:16px;margin:20px 0 8px}.meta{color:#64748b;font-size:13px;margin-bottom:16px}table{width:100%;border-collapse:collapse;margin:8px 0}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:13px}th{color:#64748b;font-weight:600}.section{page-break-inside:avoid}</style></head><body>
<h1>Dashboard</h1><div class="meta">${safeProfile} • last ${d.window_days} days • Generated ${new Date().toLocaleDateString()}</div>
<div class="section"><h2>Lead Performance</h2><table><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>${lp}</tbody></table></div>
<div class="section"><h2>Pipeline Performance</h2><table><thead><tr><th>Stage</th><th>Now</th><th>Comparison</th></tr></thead><tbody>${pipe}</tbody></table></div>
<div class="section"><h2>Lead Source Performance</h2><table><thead><tr><th>Lead source</th><th>Leads</th><th>Sold</th></tr></thead><tbody>${sources || '<tr><td colspan="3">Data source pending</td></tr>'}</tbody></table></div>
<div class="section"><h2>Pipeline by Salesperson</h2><table><thead><tr><th>Salesperson</th><th>Leads</th><th>Opportunities</th><th>Appointments</th><th>Sales</th></tr></thead><tbody>${pipeRows}</tbody></table></div>
<div class="section"><h2>AI Activity</h2><table><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>${ai}</tbody></table></div>
</body></html>`
}
