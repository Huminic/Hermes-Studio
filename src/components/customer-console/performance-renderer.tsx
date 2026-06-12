/**
 * customer-console.performance — the per-store Performance Dashboard.
 *
 * Light-themed, customer-grade dashboard over /api/customer/performance.
 * Surfaces lead (thread) and message volume across channels with three views:
 *   - Aggregate: headline totals (leads + messages)
 *   - By channel: per-channel breakdown (voice/video/chat/sms/form/callback/email)
 *   - By type: sales vs service split
 * A time-window selector switches between 7 / 30 days and all-time.
 *
 * Read-only reporting over existing messaging-hub data. Mirrors the Data page
 * (data-renderer.tsx) for fetch + layout style; no new design system.
 */

import { useCallback, useEffect, useState } from 'react'
import type { StudioConfig } from '../../lib/studio-config'

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

type View = 'aggregate' | 'channel' | 'type'
type Window = '7' | '30' | 'all'

const WINDOWS: Array<{ id: Window; label: string }> = [
  { id: '7', label: 'Last 7 days' },
  { id: '30', label: 'Last 30 days' },
  { id: 'all', label: 'All time' },
]

const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'aggregate', label: 'Aggregate' },
  { id: 'channel', label: 'By channel' },
  { id: 'type', label: 'By type' },
]

const CHANNEL_LABELS: Record<string, string> = {
  voice: 'Calls',
  video: 'Video',
  chat: 'Chat',
  sms: 'Text (SMS)',
  form: 'Forms',
  callback: 'Callbacks',
  email: 'Email',
}

const DOMAIN_LABELS: Record<string, string> = {
  sales: 'Sales',
  service: 'Service',
}

const PRIMARY = '#3b82f6'

export function CustomerPerformanceRenderer(props: {
  profile: string
  config: StudioConfig
}) {
  const [perf, setPerf] = useState<Performance | null>(null)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('aggregate')
  const [windowSel, setWindowSel] = useState<Window>('30')

  const load = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    try {
      const wq = windowSel === 'all' ? '' : `&window_days=${windowSel}`
      const res = await fetch(
        `/api/customer/performance?profile=${encodeURIComponent(props.profile)}${wq}`,
        { credentials: 'include' },
      )
      const j = (await res.json().catch(() => ({}))) as PerformanceResponse
      if (!res.ok || !j.ok || !j.performance) {
        setFailed(true)
        return
      }
      setPerf(j.performance)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [props.profile, windowSel])

  useEffect(() => {
    void load()
  }, [load])

  if (loading && !perf) {
    return (
      <div className="p-4 text-sm text-slate-500">Loading your dashboard…</div>
    )
  }
  if (failed && !perf) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        We couldn’t load your dashboard just now.
        <button
          type="button"
          onClick={() => void load()}
          className="ml-3 font-medium text-blue-600 underline hover:text-blue-700"
        >
          Try again
        </button>
      </div>
    )
  }
  if (!perf) return null

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Performance Dashboard
          </h2>
          <p className="text-xs text-slate-500">
            Leads and messages across your channels.
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

      {/* Aggregate headline (always visible) */}
      <div className="grid grid-cols-2 gap-3">
        <Tile label="Total leads" value={perf.threads.total} empty="No leads yet" />
        <Tile
          label="Total messages"
          value={perf.messages.total}
          empty="No messages yet"
        />
      </div>

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

/**
 * Table breakdown of leads + messages by a grouping key (channel or domain).
 * Rows are the union of keys present on either metric, sorted by total volume.
 */
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

/** Headline metric tile. Shows a friendly empty label when zero. */
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
