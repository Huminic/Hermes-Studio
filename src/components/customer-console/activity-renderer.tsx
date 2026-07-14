/**
 * customer-console.activity — a read-only feed of comms / notification / send
 * events for the store (newest first), from /api/customer/activity. Shows a 24h
 * summary header (total sends + failures) and a table of recent events with
 * channel, direction, recipient, outcome, and detail. Generic per-profile.
 */
import { useCallback, useEffect, useState } from 'react'

const PRIMARY = '#2f3b4d'

type ActivityItem = {
  ts: number
  direction: 'outbound' | 'inbound'
  channel: string
  actor: string
  recipients: Array<string>
  outcome: 'ok' | 'error'
  summary: string | null
}
type Summary = { total: number; failures: number; byChannel: Record<string, number> }

export function CustomerActivityRenderer(props: { profile: string }) {
  const [items, setItems] = useState<Array<ActivityItem>>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    try {
      const res = await fetch(
        `/api/customer/activity?profile=${encodeURIComponent(props.profile)}&limit=100`,
        { credentials: 'include' },
      )
      const j = (await res.json().catch(() => ({}))) as {
        ok: boolean
        items?: Array<ActivityItem>
        summary?: Summary
      }
      if (!res.ok || !j.ok) {
        setFailed(true)
        return
      }
      setItems(j.items ?? [])
      setSummary(j.summary ?? null)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [props.profile])

  useEffect(() => {
    void load()
  }, [load])

  if (loading && items.length === 0) {
    return <div className="p-4 text-sm text-slate-500">Loading activity…</div>
  }
  if (failed && items.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        We couldn’t load activity just now.
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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Activity</h2>
        <p className="mt-1 text-sm text-slate-500">
          Recent messages and notifications for your store — what went out, to whom, and
          whether it was delivered.
        </p>
      </div>

      {summary && (
        <div className="flex flex-wrap gap-3">
          <SummaryCard label="Sends (24h)" value={summary.total} />
          <SummaryCard label="Failures (24h)" value={summary.failures} bad={summary.failures > 0} />
          {Object.entries(summary.byChannel).map(([ch, n]) => (
            <SummaryCard key={ch} label={ch} value={n} />
          ))}
        </div>
      )}

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="grid grid-cols-[130px_90px_minmax(0,1fr)_90px] gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <div>When</div>
          <div>Channel</div>
          <div>To / detail</div>
          <div>Status</div>
        </div>
        {items.length === 0 ? (
          <div className="px-3 py-4 text-xs text-slate-500">No activity recorded yet.</div>
        ) : (
          items.map((it, i) => (
            <div
              key={`${it.ts}-${i}`}
              className="grid grid-cols-[130px_90px_minmax(0,1fr)_90px] gap-2 border-b border-slate-100 px-3 py-2 text-xs last:border-0"
            >
              <div className="text-slate-500">{new Date(it.ts).toLocaleString()}</div>
              <div className="capitalize text-slate-700">
                {it.channel}
                <span className="ml-1 text-[10px] text-slate-400">
                  {it.direction === 'inbound' ? '↓ in' : '↑ out'}
                </span>
              </div>
              <div className="min-w-0">
                <div className="truncate text-slate-800">
                  {it.recipients.length ? it.recipients.join(', ') : it.actor}
                </div>
                {it.summary && <div className="truncate text-[11px] text-slate-400">{it.summary}</div>}
              </div>
              <div>
                <span
                  className={
                    'rounded-full px-2 py-0.5 text-[11px] font-medium ' +
                    (it.outcome === 'error'
                      ? 'bg-red-50 text-red-700'
                      : 'bg-emerald-50 text-emerald-700')
                  }
                >
                  {it.outcome === 'error' ? 'Failed' : 'Delivered'}
                </span>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  )
}

function SummaryCard({ label, value, bad }: { label: string; value: number; bad?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-2">
      <div className={'text-xl font-bold ' + (bad ? 'text-red-600' : 'text-slate-900')}>{value}</div>
      <div className="text-[11px] capitalize text-slate-500">{label}</div>
    </div>
  )
}
