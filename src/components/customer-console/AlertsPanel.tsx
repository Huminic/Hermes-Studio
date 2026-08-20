/**
 * Created-alerts panel for the Notifications page. Lists the concrete alerts a
 * user created (from an Issue's "Create Alert" or manually here) and lets them
 * add or remove one. Light-themed to match the existing Notifications page.
 * Backed by /api/customer/alerts.
 */
import { useCallback, useEffect, useState } from 'react'

type Alert = {
  id: string
  email: string
  query_name: string
  description: string
  source: string
  status: string
  created_at: number
}

export function AlertsPanel({ profile }: { profile: string }) {
  const [alerts, setAlerts] = useState<Array<Alert>>([])
  const [adding, setAdding] = useState(false)
  const [email, setEmail] = useState('duanekwells@gmail.com')
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    fetch(`/api/customer/alerts?profile=${encodeURIComponent(profile)}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((j: { ok: boolean; alerts?: Array<Alert> }) => setAlerts(j.alerts ?? []))
      .catch(() => {})
  }, [profile])

  useEffect(load, [load])

  const create = useCallback(async () => {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/customer/alerts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, email, query_name: name, description: desc }),
      })
      const j = (await res.json().catch(() => ({}))) as { ok: boolean; error?: string }
      if (!res.ok || !j.ok) {
        setErr(j.error ?? 'Could not create the alert.')
        return
      }
      setName('')
      setDesc('')
      setAdding(false)
      load()
    } catch {
      setErr('Could not create the alert.')
    } finally {
      setBusy(false)
    }
  }, [profile, email, name, desc, load])

  const remove = useCallback(
    async (id: string) => {
      await fetch('/api/customer/alerts', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, id }),
      }).catch(() => {})
      load()
    },
    [profile, load],
  )

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Alerts</h3>
          <p className="text-xs text-slate-500">
            Alerts you (or the Issues page) created — each emails you when its condition is found.
          </p>
        </div>
        <button
          type="button"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-400"
          onClick={() => setAdding((a) => !a)}
        >
          {adding ? 'Cancel' : '+ New alert'}
        </button>
      </div>

      {adding && (
        <div className="mb-3 grid gap-2 rounded-md bg-slate-50 p-3 sm:grid-cols-[1fr_1fr] sm:items-start">
          <input className="rounded border border-slate-300 px-2 py-1.5 text-sm" placeholder="Email to notify" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="rounded border border-slate-300 px-2 py-1.5 text-sm" placeholder="Alert name" value={name} onChange={(e) => setName(e.target.value)} />
          <textarea className="rounded border border-slate-300 px-2 py-1.5 text-sm sm:col-span-2" rows={2} placeholder="Plain-language description of what it watches" value={desc} onChange={(e) => setDesc(e.target.value)} />
          {err && <div className="text-xs text-amber-700 sm:col-span-2">{err}</div>}
          <div className="sm:col-span-2">
            <button type="button" disabled={busy} className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60" onClick={create}>
              {busy ? 'Creating…' : 'Create alert'}
            </button>
          </div>
        </div>
      )}

      {alerts.length === 0 ? (
        <p className="text-xs text-slate-400">No alerts yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {alerts.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-800">{a.query_name}</div>
                <div className="truncate text-xs text-slate-500">{a.description}</div>
                <div className="text-xs text-slate-400">→ {a.email}</div>
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
