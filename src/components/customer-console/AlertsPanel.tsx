/**
 * Created-alerts panel for the Notifications page. Lists the concrete alerts a user
 * created and lets them add or remove one. Two ways to add:
 *  - METRIC ALERT — the shared AlertWizard (pick metric → rises above/falls below or
 *    2σ/3σ baseline → recipient → live preview).
 *  - MANUAL — a free-form name + description (e.g. from an Issue's "Create Alert").
 * Backed by /api/customer/alerts.
 */
import { useCallback, useEffect, useState } from 'react'
import { AlertWizard } from './AlertWizard'

type Alert = {
  id: string
  email: string
  query_name: string
  description: string
  source: string
  status: string
  created_at: number
  metric_id?: string | null
}

// Shared display read-model (same shape the alerts GET returns).
type Display = {
  id: string
  kind: 'metric' | 'manual'
  status: 'active' | 'paused'
  query_name: string
  description: string
  email: string
  metric_label: string | null
  direction: 'above' | 'below' | null
  threshold: number | null
  recipientRole: string | null
  currentValue: number | null
  currentValueResolved: boolean
  dataThroughLabel: string | null
  ageLabel: string | null
}

type Mode = 'metric' | 'manual'

export function AlertsPanel({ profile }: { profile: string }) {
  const [alerts, setAlerts] = useState<Array<Alert>>([])
  const [display, setDisplay] = useState<Array<Display>>([])
  const [adding, setAdding] = useState(false)
  const [mode, setMode] = useState<Mode>('metric')
  const [email, setEmail] = useState('duanekwells@gmail.com')
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    fetch(`/api/customer/alerts?profile=${encodeURIComponent(profile)}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((j: { ok: boolean; alerts?: Array<Alert>; display?: Array<Display> }) => {
        setAlerts(j.alerts ?? [])
        setDisplay(j.display ?? [])
      })
      .catch(() => {})
  }, [profile])
  useEffect(load, [load])

  const createManual = useCallback(async () => {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/customer/alerts', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, email, query_name: name, description: desc }),
      })
      const j = (await res.json().catch(() => ({}))) as { ok: boolean; error?: string }
      if (!res.ok || !j.ok) { setErr(j.error ?? 'Could not create the alert.'); return }
      setName(''); setDesc(''); setAdding(false); load()
    } catch {
      setErr('Could not create the alert.')
    } finally {
      setBusy(false)
    }
  }, [profile, email, name, desc, load])

  const remove = useCallback(
    async (id: string) => {
      await fetch('/api/customer/alerts', {
        method: 'DELETE', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, id }),
      }).catch(() => {})
      load()
    },
    [profile, load],
  )

  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      className={`rounded-md px-3 py-1 text-xs font-medium ${mode === m ? 'bg-slate-800 text-white' : 'border border-slate-300 bg-white text-slate-600'}`}
    >
      {label}
    </button>
  )

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Alerts</h3>
          <p className="text-xs text-slate-500">
            Get an email when a metric you care about crosses a line you set — or when the Issues page flags something.
          </p>
        </div>
        <button
          type="button"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-400"
          onClick={() => { setAdding((a) => !a); setErr(null) }}
        >
          {adding ? 'Cancel' : '+ New alert'}
        </button>
      </div>

      {adding && (
        <div className="mb-3 rounded-md bg-slate-50 p-3">
          <div className="mb-3 flex gap-2">{tab('metric', 'Metric alert')}{tab('manual', 'Manual')}</div>
          {mode === 'metric' ? (
            <AlertWizard profile={profile} onCreated={() => { setAdding(false); load() }} />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <input className="rounded border border-slate-300 px-2 py-1.5 text-sm" placeholder="Email to notify" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input className="rounded border border-slate-300 px-2 py-1.5 text-sm" placeholder="Alert name" value={name} onChange={(e) => setName(e.target.value)} />
              <textarea className="rounded border border-slate-300 px-2 py-1.5 text-sm sm:col-span-2" rows={2} placeholder="Plain-language description of what it watches" value={desc} onChange={(e) => setDesc(e.target.value)} />
              {err && <div className="text-xs text-amber-700 sm:col-span-2">{err}</div>}
              <div className="sm:col-span-2">
                <button type="button" disabled={busy} className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60" onClick={createManual}>
                  {busy ? 'Creating…' : 'Create alert'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {display.length === 0 ? (
        <p className="text-xs text-slate-400">No alerts yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {display.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800">
                  {a.query_name}
                  {a.kind === 'metric' && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-normal text-slate-500">metric</span>}
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-normal ${a.status === 'paused' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {a.status === 'paused' ? 'paused (inactive)' : 'active'}
                  </span>
                </div>
                <div className="truncate text-xs text-slate-500">{a.description}</div>
                {a.kind === 'metric' && (
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                    {a.metric_label && <span>Metric: <span className="text-slate-700">{a.metric_label}</span></span>}
                    {a.threshold != null && <span>Threshold: {a.direction === 'above' ? '>' : '<'} {a.threshold}</span>}
                    <span>Current: {a.currentValueResolved ? a.currentValue : '—'}</span>
                    {a.recipientRole && <span>To: {a.recipientRole}</span>}
                    {a.ageLabel && <span className="text-slate-400">{a.ageLabel}</span>}
                  </div>
                )}
                <div className="text-xs text-slate-400">{a.email ? `→ ${a.email}` : '→ (no recipient — inactive)'}</div>
              </div>
              <button type="button" className="shrink-0 text-xs text-slate-400 hover:text-red-600" onClick={() => remove(a.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
