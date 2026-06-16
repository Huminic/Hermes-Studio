/**
 * customer-console.performance — the per-store Performance Dashboard.
 *
 * Combines read-only performance metrics with a custom dashboard builder.
 * Fetches data from /api/customer/performance and /api/customer/reports,
 * loads/saves custom dashboard cards through /api/customer/dashboards,
 * and provides print-to-PDF export functionality.
 *
 * WF-017: Gunmetal workspace theme, stacked layout, real dashboard builder,
 * PDF export via browser print.
 */

import { useCallback, useEffect, useState } from 'react'
import type { StudioConfig } from '../../lib/studio-config'

// WF-017: workspace gunmetal theme
const PRIMARY = '#2f3b4d'
const DASHBOARD_METRIC_SOURCES = [
  'calls',
  'video',
  'sms',
  'email',
  'chat',
  'leads',
  'service',
  'sales',
  'campaigns',
  'followups',
] as const

const DASHBOARD_SOURCES = [...DASHBOARD_METRIC_SOURCES, 'federated'] as const

type DashboardMetricSource = (typeof DASHBOARD_METRIC_SOURCES)[number]

type Grouped = {
  total: number
  by_channel: Record<string, number>
  by_domain: Record<string, number>
}
type Performance = {
  threads: Grouped
  messages: Grouped
}
type PerformanceResponse = {
  ok: boolean
  profile: string
  window_days: number | null
  generated_at: number
  performance?: Performance
  error?: string
}

type MessageStats = {
  total: number
  inbound: number
  outbound: number
  by_channel: Record<string, { inbound: number; outbound: number }>
}
type ThreadStats = {
  total: number
  open: number
  closed: number
  by_domain: Record<string, number>
}
type CampaignStats = {
  campaigns: number
  by_status: Record<string, number>
  deliveries_sent: number
  deliveries_failed: number
}
type FollowupStats = {
  immediate_triggers: number
  checkin_triggers: number
  last_fire: number | null
  sends: { total: number; outbound: number; by_channel: Record<string, number> }
}
type LeadFunnel =
  | { available: true; source: 'vin-live'; total: number; by_status: Record<string, number> }
  | { available: false; source: 'vin-live' | 'none'; reason: string }

type Reports = {
  profile: string
  generated_at: number
  comms: {
    window_days: number
    messages: MessageStats
    threads: ThreadStats
    calls_in: number
    texts_out: number
  }
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

type DashboardsResponse = {
  ok: boolean
  dashboards?: Array<DashboardCard>
  sources?: ReadonlyArray<string>
  error?: string
}

type View = 'overview' | 'channel' | 'type'
type Window = '7' | '30' | 'all'

const WINDOWS: Array<{ id: Window; label: string }> = [
  { id: '7', label: 'Last 7 days' },
  { id: '30', label: 'Last 30 days' },
  { id: 'all', label: 'All time' },
]

const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'channel', label: 'By channel' },
  { id: 'type', label: 'By type' },
]

const CHANNEL_LABELS: Record<string, string> = {
  voice: 'Calls',
  vapi: 'Calls',
  phone: 'Calls',
  tavus: 'Video',
  video: 'Video',
  chat: 'Chat',
  sms: 'Text (SMS)',
  form: 'Forms',
  callback: 'Callbacks',
  email: 'Email',
  'email-adf': 'Email',
}

const DOMAIN_LABELS: Record<string, string> = {
  sales: 'Sales',
  service: 'Service',
}

const SOURCE_LABELS: Record<string, string> = {
  calls: 'Calls',
  video: 'Video',
  sms: 'Texts',
  email: 'Emails',
  chat: 'Web chats',
  leads: 'Leads',
  service: 'Service threads',
  sales: 'Sales threads',
  campaigns: 'Campaigns',
  followups: 'Follow-ups',
  federated: 'Combined sources',
}

const SOURCE_GROUPS: Array<{
  label: string
  sources: Array<(typeof DASHBOARD_SOURCES)[number]>
}> = [
  { label: 'Combined', sources: ['federated'] },
  { label: 'Communications', sources: ['calls', 'sms', 'email', 'chat', 'video'] },
  { label: 'Customers', sources: ['leads', 'sales', 'service'] },
  { label: 'Campaigns', sources: ['campaigns', 'followups'] },
]

const VISUALIZATIONS: Array<{
  id: NonNullable<DashboardCard['visualization']>
  label: string
}> = [
  { id: 'number', label: 'Number' },
  { id: 'bar', label: 'Bar' },
  { id: 'table', label: 'Table' },
]

const DISPLAYS: Array<{
  id: NonNullable<DashboardCard['display']>
  label: string
}> = [
  { id: 'summary', label: 'Summary' },
  { id: 'detail', label: 'Detailed' },
]

export function CustomerPerformanceRenderer(props: {
  profile: string
  config: StudioConfig
}) {
  const [perf, setPerf] = useState<Performance | null>(null)
  const [reports, setReports] = useState<Reports | null>(null)
  const [dashboards, setDashboards] = useState<Array<DashboardCard>>([])
  const [availableSources, setAvailableSources] = useState<ReadonlyArray<string>>(
    DASHBOARD_SOURCES,
  )
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('overview')
  const [windowSel, setWindowSel] = useState<Window>('30')
  const [showAddCard, setShowAddCard] = useState(false)
  const [cardTitle, setCardTitle] = useState('')
  const [cardSource, setCardSource] = useState('')
  const [cardSources, setCardSources] = useState<Array<DashboardMetricSource>>([
    'calls',
    'sms',
    'leads',
  ])
  const [cardVisualization, setCardVisualization] =
    useState<NonNullable<DashboardCard['visualization']>>('number')
  const [cardDisplay, setCardDisplay] =
    useState<NonNullable<DashboardCard['display']>>('summary')
  const [expandedCard, setExpandedCard] = useState<number | null>(null)
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    try {
      const wq = windowSel === 'all' ? '' : `&window_days=${windowSel}`
      const perfRes = await fetch(
        `/api/customer/performance?profile=${encodeURIComponent(props.profile)}${wq}`,
        { credentials: 'include' },
      )
      const perfJ = (await perfRes.json().catch(() => ({}))) as PerformanceResponse
      if (!perfRes.ok || !perfJ.ok || !perfJ.performance) {
        setFailed(true)
        return
      }
      setPerf(perfJ.performance)

      const [reportsResult, dashboardsResult] = await Promise.allSettled([
        fetch(`/api/customer/reports?profile=${encodeURIComponent(props.profile)}`, {
          credentials: 'include',
        }),
        fetch(`/api/customer/dashboards?profile=${encodeURIComponent(props.profile)}`, {
          credentials: 'include',
        }),
      ])
      if (reportsResult.status === 'fulfilled') {
        const reportsJ = (await reportsResult.value.json().catch(() => ({}))) as {
          ok: boolean
          reports?: Reports
        }
        if (reportsResult.value.ok && reportsJ.ok && reportsJ.reports) {
          setReports(reportsJ.reports)
        }
      }
      if (dashboardsResult.status === 'fulfilled') {
        const dashJ = (await dashboardsResult.value.json().catch(() => ({}))) as DashboardsResponse
        if (dashboardsResult.value.ok && dashJ.ok) {
          setDashboards(dashJ.dashboards ?? [])
          setAvailableSources(dashJ.sources ?? DASHBOARD_SOURCES)
        }
      }
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [props.profile, windowSel])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (availableSources.length > 0 && !cardSource) {
      setCardSource(availableSources[0] ?? '')
    }
  }, [availableSources, cardSource])

  const addCard = useCallback(async () => {
    const title = cardTitle.trim()
    if (!title || !cardSource) return
    if (cardSource === 'federated' && cardSources.length < 2) {
      setSaveError('Choose at least two sources for a combined card.')
      return
    }
    setSaveBusy(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/customer/dashboards', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: props.profile,
          dashboards: [
            ...dashboards,
            {
              title,
              source: cardSource,
              sources: cardSource === 'federated' ? cardSources : [],
              visualization: cardVisualization,
              display: cardDisplay,
            },
          ],
        }),
      })
      const j = (await res.json().catch(() => ({}))) as DashboardsResponse
      if (!res.ok || !j.ok) {
        setSaveError(j.error ?? 'Could not save dashboard card.')
        return
      }
      setDashboards(j.dashboards ?? [])
      setCardTitle('')
      setShowAddCard(false)
      setCardVisualization('number')
      setCardDisplay('summary')
    } catch {
      setSaveError('Could not save dashboard card.')
    } finally {
      setSaveBusy(false)
    }
  }, [
    cardDisplay,
    cardSource,
    cardSources,
    cardTitle,
    cardVisualization,
    dashboards,
    props.profile,
  ])

  const removeCard = useCallback(
    async (index: number) => {
      setSaveBusy(true)
      setSaveError(null)
      try {
        const next = dashboards.filter((_, i) => i !== index)
        const res = await fetch('/api/customer/dashboards', {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profile: props.profile,
            dashboards: next,
          }),
        })
        const j = (await res.json().catch(() => ({}))) as DashboardsResponse
        if (!res.ok || !j.ok) {
          setSaveError(j.error ?? 'Could not remove dashboard card.')
          return
        }
        setDashboards(j.dashboards ?? [])
        setExpandedCard(null)
      } catch {
        setSaveError('Could not remove dashboard card.')
      } finally {
        setSaveBusy(false)
      }
    },
    [dashboards, props.profile],
  )

  const exportPDF = useCallback(() => {
    if (!perf || !reports) return
    const win = window.open('', '_blank')
    if (!win) return
    const windowLabel = WINDOWS.find((w) => w.id === windowSel)?.label ?? 'All time'
    win.document.write(buildPrintDocument(
      props.profile,
      windowLabel,
      perf,
      reports,
      dashboards,
    ))
    win.document.close()
    setTimeout(() => {
      win.print()
    }, 250)
  }, [perf, reports, dashboards, windowSel, props.profile])

  if (loading && !perf) {
    return (
      <div className="p-4 text-sm text-slate-500">Loading your dashboard…</div>
    )
  }
  if (failed && !perf) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        We couldn't load your dashboard just now.
        <button
          type="button"
          onClick={() => void load()}
          className="ml-3 font-medium hover:underline"
          style={{ color: PRIMARY }}
        >
          Try again
        </button>
      </div>
    )
  }
  if (!perf) return null

  const starterCards: Array<DashboardCard> = [
    { title: 'Total calls', source: 'calls', visualization: 'bar', display: 'detail' },
    { title: 'Texts sent', source: 'sms', visualization: 'number', display: 'summary' },
    { title: 'Total leads', source: 'leads', visualization: 'table', display: 'detail' },
    { title: 'Campaigns', source: 'campaigns', visualization: 'bar', display: 'detail' },
    { title: 'Follow-up triggers', source: 'followups', visualization: 'bar', display: 'detail' },
    {
      title: 'Customer engagement',
      source: 'federated',
      sources: ['calls', 'sms', 'chat', 'campaigns'],
      visualization: 'table',
      display: 'detail',
    },
  ]
  const cardsToRender = dashboards.length > 0 ? dashboards : starterCards
  const isCustom = dashboards.length > 0

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Performance Dashboard
          </h2>
          <p className="text-xs text-slate-500">
            Activity from conversations, leads, campaigns, and follow-up
            triggers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Time window"
            className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700"
            value={windowSel}
            onChange={(e) => setWindowSel(e.target.value as Window)}
          >
            {WINDOWS.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
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
            disabled={!perf || !reports}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-95 disabled:opacity-50"
            style={{ background: PRIMARY }}
          >
            Export PDF
          </button>
        </div>
      </div>

      {/* View filter */}
      <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(v.id)}
            className={
              'flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ' +
              (view === v.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-900')
            }
            style={view === v.id ? { color: PRIMARY } : undefined}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Aggregate headline */}
      <div className="grid grid-cols-2 gap-3">
        <Tile label="Total leads" value={perf.threads.total} empty="No leads yet" />
        <Tile
          label="Total messages"
          value={perf.messages.total}
          empty="No messages yet"
        />
      </div>

      {/* Custom dashboard cards */}
      {reports && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">
              {isCustom ? 'Custom dashboard' : 'Dashboard (sample cards)'}
            </h3>
            <button
              type="button"
              onClick={() => setShowAddCard(!showAddCard)}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              {showAddCard ? 'Cancel' : '+ Add card'}
            </button>
          </div>
          {!isCustom && (
            <p className="text-xs text-slate-500">
              These sample cards pull from the sources below. Use{' '}
              <strong>+ Add card</strong> to create a saved dashboard view.
            </p>
          )}
          {showAddCard && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 text-sm font-medium text-slate-900">
                Add dashboard card
              </div>
              <div className="flex flex-col gap-3">
                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_150px_140px_auto]">
                  <input
                    type="text"
                    value={cardTitle}
                    onChange={(e) => setCardTitle(e.target.value)}
                    placeholder="Card title"
                    className="min-w-0 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
                  />
                  <select
                    value={cardSource}
                    onChange={(e) => setCardSource(e.target.value)}
                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
                  >
                    {SOURCE_GROUPS.map((group) => {
                      const groupSources = group.sources.filter((s) =>
                        availableSources.includes(s),
                      )
                      if (groupSources.length === 0) return null
                      return (
                        <optgroup key={group.label} label={group.label}>
                          {groupSources.map((s) => (
                            <option key={s} value={s}>
                              {SOURCE_LABELS[s] ?? s}
                            </option>
                          ))}
                        </optgroup>
                      )
                    })}
                  </select>
                  <select
                    aria-label="Visualization"
                    value={cardVisualization}
                    onChange={(e) =>
                      setCardVisualization(
                        e.target.value as NonNullable<
                          DashboardCard['visualization']
                        >,
                      )
                    }
                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
                  >
                    {VISUALIZATIONS.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Display"
                    value={cardDisplay}
                    onChange={(e) =>
                      setCardDisplay(
                        e.target.value as NonNullable<DashboardCard['display']>,
                      )
                    }
                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
                  >
                    {DISPLAYS.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void addCard()}
                    disabled={saveBusy || !cardTitle.trim()}
                    className="rounded-md px-4 py-1.5 text-sm font-medium text-white transition hover:brightness-95 disabled:opacity-50"
                    style={{ background: PRIMARY }}
                  >
                    {saveBusy ? 'Saving…' : 'Add'}
                  </button>
                </div>
                {saveError && (
                  <div className="text-xs text-red-600">{saveError}</div>
                )}
                {cardSource === 'federated' && (
                  <div className="rounded-md border border-slate-200 bg-white p-3">
                    <div className="mb-2 text-xs font-medium text-slate-600">
                      Choose sources to combine
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {DASHBOARD_METRIC_SOURCES.map((source) => {
                        const checked = cardSources.includes(source)
                        return (
                          <label
                            key={source}
                            className="flex items-center gap-2 rounded-md border border-slate-100 px-2 py-1.5 text-xs text-slate-700"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setCardSources((prev) =>
                                  checked
                                    ? prev.filter((s) => s !== source)
                                    : [...prev, source],
                                )
                              }
                            />
                            {SOURCE_LABELS[source] ?? source}
                          </label>
                        )
                      })}
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">
                      Combined cards summarize several sources in one saved
                      dashboard card and show each source in the breakdown.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {cardsToRender.map((card, i) => (
              <DashboardTile
                key={i}
                index={i}
                title={card.title}
                source={card.source}
                visualization={card.visualization ?? 'number'}
                display={card.display ?? 'summary'}
                value={resolveCardValue(reports, card)}
                rows={resolveCardRows(reports, card)}
                expanded={expandedCard === i || card.display === 'detail'}
                onToggle={() =>
                  setExpandedCard((current) => (current === i ? null : i))
                }
                onRemove={isCustom ? () => void removeCard(i) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {view === 'channel' && (
        <BreakdownCard
          title="By channel"
          labels={CHANNEL_LABELS}
          leadsBy={perf.threads.by_channel}
          messagesBy={perf.messages.by_channel}
          colName="Channel"
        />
      )}

      {view === 'type' && (
        <BreakdownCard
          title="By type"
          labels={DOMAIN_LABELS}
          leadsBy={perf.threads.by_domain}
          messagesBy={perf.messages.by_domain}
          colName="Type"
        />
      )}
    </div>
  )
}

function metricSources(card: DashboardCard): Array<string> {
  if (card.source !== 'federated') return [card.source]
  return (card.sources ?? []).filter((source): source is DashboardMetricSource =>
    (DASHBOARD_METRIC_SOURCES as readonly string[]).includes(source),
  )
}

function resolveMetricValue(reports: Reports, source: string): number {
  const chTotal = (ch: string) => {
    const c = reports.comms.messages.by_channel[ch]
    return c ? c.inbound + c.outbound : 0
  }
  switch (source) {
    case 'calls':
      return reports.comms.calls_in || chTotal('voice') || chTotal('vapi') || chTotal('phone')
    case 'video':
      return chTotal('video') + chTotal('tavus')
    case 'sms':
      return reports.comms.texts_out || chTotal('sms')
    case 'email':
      return chTotal('email') + chTotal('email-adf')
    case 'chat':
      return chTotal('chat')
    case 'leads':
      return reports.lead_funnel.available
        ? reports.lead_funnel.total
        : reports.comms.threads.total
    case 'service':
      return reports.comms.threads.by_domain['service'] ?? 0
    case 'sales':
      return reports.comms.threads.by_domain['sales'] ?? 0
    case 'campaigns':
      return reports.campaigns.campaigns
    case 'followups':
      return reports.followups.immediate_triggers + reports.followups.checkin_triggers
    default:
      return 0
  }
}

function resolveCardValue(reports: Reports, card: DashboardCard): number {
  return metricSources(card).reduce(
    (total, source) => total + resolveMetricValue(reports, source),
    0,
  )
}

function resolveMetricRows(
  reports: Reports,
  source: string,
): Array<{ label: string; value: number }> {
  const channelValue = (channel: string) => {
    const row = reports.comms.messages.by_channel[channel]
    return row ? row.inbound + row.outbound : 0
  }
  switch (source) {
    case 'calls':
      return [
        { label: 'Inbound calls', value: reports.comms.calls_in },
        { label: 'Voice messages', value: channelValue('voice') + channelValue('vapi') },
      ]
    case 'video':
      return [
        { label: 'Video sessions', value: channelValue('video') + channelValue('tavus') },
      ]
    case 'sms':
      return [
        { label: 'Texts sent', value: reports.comms.texts_out },
        {
          label: 'SMS messages',
          value: channelValue('sms') + channelValue('textmagic'),
        },
      ]
    case 'email':
      return [
        { label: 'Email messages', value: channelValue('email') + channelValue('email-adf') },
      ]
    case 'chat':
      return [{ label: 'Web chat messages', value: channelValue('chat') }]
    case 'leads':
      if (reports.lead_funnel.available) {
        return Object.entries(reports.lead_funnel.by_status).map(([label, value]) => ({
          label: label.replace(/_/g, ' '),
          value,
        }))
      }
      return [
        { label: 'Open threads', value: reports.comms.threads.open },
        { label: 'Closed threads', value: reports.comms.threads.closed },
      ]
    case 'service':
    case 'sales':
      return [
        {
          label: `${SOURCE_LABELS[source]} threads`,
          value: reports.comms.threads.by_domain[source] ?? 0,
        },
      ]
    case 'campaigns':
      return [
        { label: 'Campaigns', value: reports.campaigns.campaigns },
        { label: 'Delivered', value: reports.campaigns.deliveries_sent },
        { label: 'Failed', value: reports.campaigns.deliveries_failed },
        ...Object.entries(reports.campaigns.by_status).map(([label, value]) => ({
          label: label.replace(/_/g, ' '),
          value,
        })),
      ]
    case 'followups':
      return [
        { label: 'Immediate triggers', value: reports.followups.immediate_triggers },
        { label: '24h check-in triggers', value: reports.followups.checkin_triggers },
        { label: 'Outbound follow-ups', value: reports.followups.sends.outbound },
      ]
    default:
      return []
  }
}

function resolveCardRows(
  reports: Reports,
  card: DashboardCard,
): Array<{ label: string; value: number }> {
  if (card.source !== 'federated') return resolveMetricRows(reports, card.source)
  return metricSources(card).map((source) => ({
    label: SOURCE_LABELS[source] ?? source,
    value: resolveMetricValue(reports, source),
  }))
}

function buildPrintDocument(
  profile: string,
  windowLabel: string,
  perf: Performance,
  reports: Reports,
  dashboards: Array<DashboardCard>,
): string {
  const cardsToRender: Array<DashboardCard> = dashboards.length > 0 ? dashboards : [
    { title: 'Total calls', source: 'calls' },
    { title: 'Texts sent', source: 'sms' },
    { title: 'Total leads', source: 'leads' },
    { title: 'Campaigns', source: 'campaigns' },
    { title: 'Follow-up triggers', source: 'followups' },
    {
      title: 'Customer engagement',
      source: 'federated',
      sources: ['calls', 'sms', 'chat', 'campaigns'],
    },
  ]
  const channelRows = Object.entries(perf.threads.by_channel).map(([ch, lv]) => {
    const mv = perf.messages.by_channel[ch] ?? 0
    const label = escapeHtml(CHANNEL_LABELS[ch] ?? ch)
    return `<tr><td>${label}</td><td>${lv.toLocaleString()}</td><td>${mv.toLocaleString()}</td></tr>`
  }).join('')
  const domainRows = Object.entries(perf.threads.by_domain).map(([d, lv]) => {
    const mv = perf.messages.by_domain[d] ?? 0
    const label = escapeHtml(DOMAIN_LABELS[d] ?? d)
    return `<tr><td>${label}</td><td>${lv.toLocaleString()}</td><td>${mv.toLocaleString()}</td></tr>`
  }).join('')
  const safeProfile = escapeHtml(profile)
  const safeWindowLabel = escapeHtml(windowLabel)

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Performance Dashboard - ${safeProfile}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      padding: 40px;
      color: #0f172a;
    }
    h1 { font-size: 24px; margin-bottom: 8px; }
    h2 { font-size: 18px; margin: 24px 0 12px; }
    .meta { color: #64748b; font-size: 14px; margin-bottom: 24px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 16px 0; }
    .card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      background: #fff;
    }
    .card-value { font-size: 24px; font-weight: 600; margin-bottom: 4px; }
    .card-label { font-size: 12px; color: #64748b; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid #e2e8f0; }
    th { font-weight: 600; color: #64748b; font-size: 14px; }
    td { font-size: 14px; }
    .section { margin: 24px 0; page-break-inside: avoid; }
    @media print {
      body { padding: 20px; }
      .grid { grid-template-columns: repeat(2, 1fr); }
    }
  </style>
</head>
<body>
  <h1>Performance Dashboard</h1>
  <div class="meta">${safeProfile} • ${safeWindowLabel} • Generated ${new Date().toLocaleDateString()}</div>

  <div class="section">
    <h2>Summary</h2>
    <div class="grid">
      <div class="card">
        <div class="card-value">${perf.threads.total.toLocaleString()}</div>
        <div class="card-label">Total leads</div>
      </div>
      <div class="card">
        <div class="card-value">${perf.messages.total.toLocaleString()}</div>
        <div class="card-label">Total messages</div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>${dashboards.length > 0 ? 'Custom Dashboard' : 'Dashboard'}</h2>
    <div class="grid">
      ${cardsToRender.map(c => `<div class="card">
        <div class="card-value">${resolveCardValue(reports, c).toLocaleString()}</div>
        <div class="card-label">${escapeHtml(c.title)}</div>
      </div>`).join('')}
    </div>
  </div>

  <div class="section">
    <h2>By Channel</h2>
    <table>
      <thead><tr><th>Channel</th><th>Leads</th><th>Messages</th></tr></thead>
      <tbody>${channelRows || '<tr><td colspan="3">No data</td></tr>'}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>By Type</h2>
    <table>
      <thead><tr><th>Type</th><th>Leads</th><th>Messages</th></tr></thead>
      <tbody>${domainRows || '<tr><td colspan="3">No data</td></tr>'}</tbody>
    </table>
  </div>
</body>
</html>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function BreakdownCard({
  title,
  labels,
  leadsBy,
  messagesBy,
  colName,
}: {
  title: string
  labels: Record<string, string>
  leadsBy: Record<string, number>
  messagesBy: Record<string, number>
  colName: string
}) {
  const keys = Array.from(
    new Set([...Object.keys(leadsBy), ...Object.keys(messagesBy)]),
  ).sort(
    (a, b) =>
      (leadsBy[b] ?? 0) +
      (messagesBy[b] ?? 0) -
      ((leadsBy[a] ?? 0) + (messagesBy[a] ?? 0)),
  )
  return (
    <Card title={title}>
      {keys.length > 0 ? (
        <table className="w-full text-sm">
          <thead className="text-slate-500">
            <tr className="border-b border-slate-200">
              <th className="pb-2 text-left font-medium">{colName}</th>
              <th className="pb-2 text-right font-medium">Leads</th>
              <th className="pb-2 text-right font-medium">Messages</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k} className="border-b border-slate-100 last:border-0">
                <td className="py-2 capitalize text-slate-700">
                  {labels[k] ?? k}
                </td>
                <td className="py-2 text-right text-slate-700">
                  {(leadsBy[k] ?? 0).toLocaleString()}
                </td>
                <td className="py-2 text-right text-slate-700">
                  {(messagesBy[k] ?? 0).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="mt-3 text-sm text-slate-400">No activity yet.</div>
      )}
    </Card>
  )
}

function Card({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 text-sm font-semibold text-slate-900">{title}</div>
      {children}
    </section>
  )
}

function Tile({
  label,
  value,
  empty,
}: {
  label: string
  value: number
  empty: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {value > 0 ? (
        <div className="text-2xl font-semibold text-slate-900">
          {value.toLocaleString()}
        </div>
      ) : (
        <div className="text-sm font-medium text-slate-400">{empty}</div>
      )}
      <div className="mt-1 text-xs text-slate-500">{label}</div>
    </div>
  )
}

function DashboardTile({
  title,
  source,
  visualization,
  display,
  value,
  rows,
  expanded,
  onToggle,
  onRemove,
}: {
  index: number
  title: string
  source: string
  visualization: 'number' | 'bar' | 'table'
  display: 'summary' | 'detail'
  value: number
  rows: Array<{ label: string; value: number }>
  expanded: boolean
  onToggle: () => void
  onRemove?: () => void
}) {
  const max = Math.max(value, ...rows.map((row) => row.value), 1)
  const sourceLabel = SOURCE_LABELS[source] ?? source
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold text-slate-900">
            {value.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-slate-500">{title}</div>
          <div className="mt-1 text-[11px] text-slate-400">
            {sourceLabel} · {display === 'detail' ? 'Detailed' : 'Summary'}
          </div>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onToggle}
            className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
          >
            {expanded ? 'Collapse' : 'Details'}
          </button>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-50"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {visualization === 'bar' && rows.length > 0 ? (
        <div className="mt-4 space-y-2">
          {rows.map((row) => (
            <div key={row.label}>
              <div className="mb-1 flex justify-between text-[11px] text-slate-500">
                <span className="truncate capitalize">{row.label}</span>
                <span>{row.value.toLocaleString()}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(4, Math.round((row.value / max) * 100))}%`,
                    background: PRIMARY,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : visualization === 'bar' ? (
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.max(4, Math.round((value / max) * 100))}%`,
              background: PRIMARY,
            }}
          />
        </div>
      ) : null}

      {source === 'federated' && rows.length > 0 && (
        <p className="mt-3 text-[11px] text-slate-500">
          Combined from {rows.map((row) => row.label).join(', ')}.
        </p>
      )}

      {(expanded || visualization === 'table') && rows.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-md border border-slate-100">
          {rows.map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-slate-100 px-3 py-2 text-xs last:border-0"
            >
              <span className="truncate capitalize text-slate-500">
                {row.label}
              </span>
              <span className="font-semibold text-slate-800">
                {row.value.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
