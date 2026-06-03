/**
 * customer-console.data — P3 native reports.
 *
 * Replaces the C.0 stub. Fetches /api/customer/reports and renders three
 * blocks matching the Nexxus Insights model:
 *   - Comms volume (in/out totals, per-channel breakdown, window)
 *   - Sales vs Service thread split + open/closed
 *   - Campaign rollup (counts by status, deliveries sent/failed)
 *   - Lead funnel — LIVE VinSolutions (or a clear "unavailable + reason"
 *     panel when the profile has no VIN scope or VIN is unconfigured).
 */

import { useCallback, useEffect, useState } from 'react'
import type { StudioConfig } from '../../lib/studio-config'

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
type LeadFunnel =
  | { available: true; source: 'vin-live'; total: number; by_status: Record<string, number> }
  | { available: false; source: 'vin-live' | 'none'; reason: string }

type Reports = {
  profile: string
  generated_at: number
  comms: { window_days: number; messages: MessageStats; threads: ThreadStats }
  campaigns: CampaignStats
  lead_funnel: LeadFunnel
}

export function CustomerDataRenderer(props: {
  profile: string
  config: StudioConfig
}) {
  const [reports, setReports] = useState<Reports | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const accent = props.config.branding.accent_color ?? '#1e40af'

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/customer/reports?profile=${encodeURIComponent(props.profile)}`,
        { credentials: 'include' },
      )
      const j = (await res.json().catch(() => ({}))) as {
        ok: boolean
        reports?: Reports
        error?: string
      }
      if (!res.ok || !j.ok || !j.reports) {
        setError(j.error ?? `HTTP ${res.status}`)
        return
      }
      setReports(j.reports)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'fetch failed')
    } finally {
      setLoading(false)
    }
  }, [props.profile])

  useEffect(() => {
    void load()
  }, [load])

  if (loading && !reports) {
    return <div className="p-4 text-sm opacity-60">Loading reports…</div>
  }
  if (error) {
    return (
      <div className="rounded border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-300">
        {error}
        <button
          type="button"
          onClick={() => void load()}
          className="ml-3 underline opacity-80 hover:opacity-100"
        >
          Retry
        </button>
      </div>
    )
  }
  if (!reports) return null

  const { comms, campaigns, lead_funnel } = reports
  const channels = Object.entries(comms.messages.by_channel).sort(
    (a, b) =>
      b[1].inbound + b[1].outbound - (a[1].inbound + a[1].outbound),
  )
  const domains = Object.entries(comms.threads.by_domain).sort(
    (a, b) => b[1] - a[1],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold opacity-80">
          Reports · last {comms.window_days} days
        </h2>
        <button
          type="button"
          onClick={() => void load()}
          className="text-[11px] underline opacity-60 hover:opacity-100"
        >
          Refresh
        </button>
      </div>

      {/* Comms volume */}
      <Card title="Comms volume" accent={accent}>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Messages" value={comms.messages.total} accent={accent} />
          <Stat label="Inbound" value={comms.messages.inbound} accent={accent} />
          <Stat label="Outbound" value={comms.messages.outbound} accent={accent} />
        </div>
        {channels.length > 0 ? (
          <table className="mt-3 w-full text-xs">
            <thead className="opacity-60">
              <tr>
                <th className="text-left font-medium">Channel</th>
                <th className="text-right font-medium">In</th>
                <th className="text-right font-medium">Out</th>
              </tr>
            </thead>
            <tbody>
              {channels.map(([ch, v]) => (
                <tr key={ch} className="border-t border-white/5">
                  <td className="py-1">{ch}</td>
                  <td className="py-1 text-right">{v.inbound}</td>
                  <td className="py-1 text-right">{v.outbound}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyNote>No messages in this window yet.</EmptyNote>
        )}
      </Card>

      {/* Sales vs Service threads */}
      <Card title="Conversations (sales / service)" accent={accent}>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Threads" value={comms.threads.total} accent={accent} />
          <Stat label="Open" value={comms.threads.open} accent={accent} />
          <Stat label="Closed" value={comms.threads.closed} accent={accent} />
        </div>
        {domains.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {domains.map(([d, n]) => (
              <span
                key={d}
                className="rounded-full border border-white/10 px-2 py-0.5"
              >
                {d}: <span className="font-semibold">{n}</span>
              </span>
            ))}
          </div>
        ) : (
          <EmptyNote>No conversations yet.</EmptyNote>
        )}
      </Card>

      {/* Campaigns */}
      <Card title="Campaigns" accent={accent}>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Campaigns" value={campaigns.campaigns} accent={accent} />
          <Stat
            label="Delivered"
            value={campaigns.deliveries_sent}
            accent={accent}
          />
          <Stat
            label="Failed"
            value={campaigns.deliveries_failed}
            accent={accent}
          />
        </div>
        {Object.keys(campaigns.by_status).length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {Object.entries(campaigns.by_status).map(([s, n]) => (
              <span
                key={s}
                className="rounded-full border border-white/10 px-2 py-0.5"
              >
                {s}: <span className="font-semibold">{n}</span>
              </span>
            ))}
          </div>
        ) : (
          <EmptyNote>No campaigns yet.</EmptyNote>
        )}
      </Card>

      {/* Lead funnel — live VinSolutions */}
      <Card title="Lead funnel · live VinSolutions" accent={accent}>
        {lead_funnel.available ? (
          <>
            <Stat label="Live leads" value={lead_funnel.total} accent={accent} />
            <table className="mt-3 w-full text-xs">
              <thead className="opacity-60">
                <tr>
                  <th className="text-left font-medium">Status</th>
                  <th className="text-right font-medium">Leads</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(lead_funnel.by_status)
                  .sort((a, b) => b[1] - a[1])
                  .map(([s, n]) => (
                    <tr key={s} className="border-t border-white/5">
                      <td className="py-1 capitalize">{s}</td>
                      <td className="py-1 text-right">{n}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <div className="mt-2 text-[10px] opacity-50">
              Queried live from VinSolutions — not synced or stored.
            </div>
          </>
        ) : (
          <div className="rounded border border-amber-400/30 bg-amber-400/10 p-3 text-xs">
            <div className="font-medium opacity-80">Lead funnel unavailable</div>
            <div className="mt-1 opacity-70">{lead_funnel.reason}</div>
          </div>
        )}
      </Card>
    </div>
  )
}

function Card({
  title,
  accent,
  children,
}: {
  title: string
  accent: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/5 p-4">
      <div
        className="mb-3 text-xs font-semibold uppercase tracking-wide"
        style={{ color: accent }}
      >
        {title}
      </div>
      {children}
    </section>
  )
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent: string
}) {
  return (
    <div className="rounded border border-white/10 bg-black/20 p-3">
      <div className="text-2xl font-semibold" style={{ color: accent }}>
        {value.toLocaleString()}
      </div>
      <div className="text-[11px] opacity-60">{label}</div>
    </div>
  )
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 text-xs opacity-50">{children}</div>
}
