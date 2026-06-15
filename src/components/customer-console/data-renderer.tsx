/**
 * customer-console.data — the customer Data Store (InfoStore sub-page).
 *
 * Shows user-friendly database stats and major data categories — contacts,
 * threads, campaigns, and follow-ups. This is the Data Store view within
 * InfoStore, not the Performance dashboard (which lives in the Dashboard tab).
 */

import { useCallback, useEffect, useState } from 'react'
import type { StudioConfig } from '../../lib/studio-config'

const PRIMARY = '#2f3b4d'

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
          className="ml-3 font-medium underline hover:brightness-90"
          style={{ color: PRIMARY }}
        >
          Try again
        </button>
      </div>
    )
  }
  if (!reports) return null

  const { comms, followups, campaigns } = reports

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Data Store</h2>
          <p className="text-xs text-slate-500">
            Database snapshots and major data categories.
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

      {/* Major data categories — database stats, not dashboard metrics */}
      <div className="grid gap-4 sm:grid-cols-2">
        <DataCategory
          title="Contacts"
          detail="Customer phone numbers, emails, and display names stored across all conversations."
          note="Contacts are created automatically when leads come in or conversations start."
        />
        <DataCategory
          title="Threads"
          detail={`${comms.threads.total} total conversations (${comms.threads.open} open, ${comms.threads.closed} closed).`}
          note="Each thread tracks one customer conversation across all channels."
        />
        <DataCategory
          title="Campaigns"
          detail={`${campaigns.campaigns} campaigns with ${campaigns.deliveries_sent} delivered messages.`}
          note="Outbound campaigns you've scheduled for service reminders or follow-ups."
        />
        <DataCategory
          title="Follow-ups"
          detail={`${followups.immediate_triggers + followups.checkin_triggers} triggers set up.`}
          note="Automated follow-up rules that send texts after a conversation starts or when a lead comes in."
        />
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
        <p>
          The Data Store shows what&apos;s in your database — not live activity
          or performance metrics. For dashboards, charts, and real-time
          activity, use the <strong>Dashboard</strong> tab.
        </p>
      </div>
    </div>
  )
}

function DataCategory({
  title,
  detail,
  note,
}: {
  title: string
  detail: string
  note: string
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">{detail}</p>
      <p className="mt-2 text-xs text-slate-500">{note}</p>
    </div>
  )
}
