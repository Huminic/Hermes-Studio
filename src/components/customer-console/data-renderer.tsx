/**
 * customer-console.data — the customer Data dashboard.
 *
 * Light-themed, customer-grade dashboard over /api/customer/reports. Surfaces
 * real metrics in customer language (calls received, texts sent, follow-up
 * performance, leads, campaigns) as clean labeled tiles. Every empty/zero/
 * unavailable case shows a friendly state — no backend strings (no central-mcp,
 * env vars, tokens, Metabase/DuckDB internals) ever reach the customer.
 *
 * The "Build your own dashboard" area shows the embedded builder when wired,
 * otherwise an honest, friendly "coming soon" placeholder. Real metrics always
 * render even when the custom builder is still being provisioned.
 */

import { useCallback, useEffect, useState } from 'react'
import type { StudioConfig } from '../../lib/studio-config'

type MessageStats = {
  total: number
  inbound: number
  outbound: number
  by_channel: Record<string, { inbound: number; outbound: number }>
}
type FollowupStats = {
  immediate_triggers: number
  checkin_triggers: number
  last_fire: number | null
  sends: { total: number; outbound: number; by_channel: Record<string, number> }
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
  | {
      available: true
      source: 'vin-live'
      total: number
      by_status: Record<string, number>
    }
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

/** Primary blue (storefront), purple active accent. */
const PRIMARY = '#3b82f6'

export function CustomerDataRenderer(props: {
  profile: string
  config: StudioConfig
}) {
  const [reports, setReports] = useState<Reports | null>(null)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setFailed(false)
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
        setFailed(true)
        return
      }
      setReports(j.reports)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [props.profile])

  useEffect(() => {
    void load()
  }, [load])

  if (loading && !reports) {
    return (
      <div className="p-4 text-sm text-slate-500">Loading your dashboard…</div>
    )
  }
  if (failed && !reports) {
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
  if (!reports) return null

  const { comms, followups, campaigns, lead_funnel } = reports
  const leads = lead_funnel.available ? lead_funnel.total : 0
  const channels = Object.entries(comms.messages.by_channel).sort(
    (a, b) => b[1].inbound + b[1].outbound - (a[1].inbound + a[1].outbound),
  )
  const domains = Object.entries(comms.threads.by_domain).sort(
    (a, b) => b[1] - a[1],
  )

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Dashboard</h2>
          <p className="text-xs text-slate-500">
            Your activity over the last {comms.window_days} days.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {/* Headline metrics — customer language */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile
          label="Calls received"
          value={comms.calls_in}
          empty="No calls yet"
        />
        <Tile label="Texts sent" value={comms.texts_out} empty="No texts yet" />
        <Tile label="Leads" value={leads} empty="No leads yet" />
        <Tile
          label="Campaigns"
          value={campaigns.campaigns}
          empty="No campaigns yet"
        />
      </div>

      {/* Messages */}
      <Card title="Messages">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Total" value={comms.messages.total} />
          <Stat label="Received" value={comms.messages.inbound} />
          <Stat label="Sent" value={comms.messages.outbound} />
        </div>
        {channels.length > 0 ? (
          <table className="mt-4 w-full text-sm">
            <thead className="text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="pb-2 text-left font-medium">Channel</th>
                <th className="pb-2 text-right font-medium">Received</th>
                <th className="pb-2 text-right font-medium">Sent</th>
              </tr>
            </thead>
            <tbody>
              {channels.map(([ch, v]) => (
                <tr key={ch} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 capitalize text-slate-700">
                    {channelLabel(ch)}
                  </td>
                  <td className="py-2 text-right text-slate-700">{v.inbound}</td>
                  <td className="py-2 text-right text-slate-700">
                    {v.outbound}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyNote>No messages yet.</EmptyNote>
        )}
      </Card>

      {/* Conversations */}
      <Card title="Conversations">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Total" value={comms.threads.total} />
          <Stat label="Open" value={comms.threads.open} />
          <Stat label="Closed" value={comms.threads.closed} />
        </div>
        {domains.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {domains.map(([d, n]) => (
              <span
                key={d}
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 capitalize text-slate-600"
              >
                {d}: <span className="font-semibold text-slate-900">{n}</span>
              </span>
            ))}
          </div>
        ) : (
          <EmptyNote>No conversations yet.</EmptyNote>
        )}
      </Card>

      {/* Follow-up performance */}
      <Card title="Follow-up performance">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Immediate" value={followups.immediate_triggers} />
          <Stat label="24h check-in" value={followups.checkin_triggers} />
          <Stat label="Texts sent" value={followups.sends.outbound} />
        </div>
        <p className="mt-3 text-xs text-slate-400">
          {followups.last_fire
            ? `Last follow-up sent ${new Date(
                followups.last_fire,
              ).toLocaleString()}`
            : 'No automated follow-ups sent yet.'}
        </p>
      </Card>

      {/* Campaigns */}
      <Card title="Campaigns">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Campaigns" value={campaigns.campaigns} />
          <Stat label="Delivered" value={campaigns.deliveries_sent} />
          <Stat label="Failed" value={campaigns.deliveries_failed} />
        </div>
        {Object.keys(campaigns.by_status).length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {Object.entries(campaigns.by_status).map(([s, n]) => (
              <span
                key={s}
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 capitalize text-slate-600"
              >
                {s}: <span className="font-semibold text-slate-900">{n}</span>
              </span>
            ))}
          </div>
        ) : (
          <EmptyNote>No campaigns yet.</EmptyNote>
        )}
      </Card>

      {/* Leads */}
      <Card title="Leads">
        {lead_funnel.available && lead_funnel.total > 0 ? (
          <>
            <Stat label="Total leads" value={lead_funnel.total} />
            <table className="mt-4 w-full text-sm">
              <thead className="text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="pb-2 text-left font-medium">Status</th>
                  <th className="pb-2 text-right font-medium">Leads</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(lead_funnel.by_status)
                  .sort((a, b) => b[1] - a[1])
                  .map(([s, n]) => (
                    <tr
                      key={s}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="py-2 capitalize text-slate-700">{s}</td>
                      <td className="py-2 text-right text-slate-700">{n}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </>
        ) : (
          <EmptyNote>
            No leads yet. New leads will appear here automatically.
          </EmptyNote>
        )}
      </Card>

      {/* Build your own dashboard */}
      <BuildYourOwn />
    </div>
  )
}

/**
 * "Build your own dashboard" affordance. When an embed URL is provisioned for
 * this account (server-injected at build/deploy time) we render it; otherwise
 * an honest, friendly "coming soon" placeholder. Never leaks backend internals.
 */
function BuildYourOwn() {
  const embedUrl =
    typeof window !== 'undefined'
      ? ((window as unknown as { __HUMINIC_DASHBOARD_EMBED__?: string })
          .__HUMINIC_DASHBOARD_EMBED__ ?? null)
      : null

  if (embedUrl) {
    return (
      <Card title="Build your own dashboard">
        <iframe
          title="Custom dashboard builder"
          src={embedUrl}
          className="h-[480px] w-full rounded-md border border-slate-200"
        />
      </Card>
    )
  }

  return (
    <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
      <div
        className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full"
        style={{ background: '#eff6ff' }}
      >
        <span className="text-lg" style={{ color: PRIMARY }}>
          ＋
        </span>
      </div>
      <h3 className="text-sm font-semibold text-slate-900">
        Build your own dashboard
      </h3>
      <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
        Custom dashboards are coming to your account soon. You’ll be able to drag
        and drop your own tiles and charts from the metrics above.
      </p>
    </section>
  )
}

function channelLabel(ch: string): string {
  const map: Record<string, string> = {
    sms: 'Text',
    voice: 'Call',
    email: 'Email',
    chat: 'Chat',
  }
  return map[ch] ?? ch
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

/** Headline metric tile (top row). Shows a friendly empty label when zero. */
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

/** In-card stat (always numeric). */
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-2xl font-semibold text-slate-900">
        {value.toLocaleString()}
      </div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </div>
  )
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 text-sm text-slate-400">{children}</div>
}
