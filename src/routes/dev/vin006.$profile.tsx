import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/dev/vin006/$profile')({ component: Vin006AcceptanceRoute })

type Native = { family: string; status: string; period?: { start: string | null; end: string | null }; accepted_rows?: number; note?: string }
type View = { profile: string; response_times: { status: string; period?: { start: string; end: string }; metrics?: Record<string, unknown>; note?: string }; natives: Array<Native> }

function Vin006AcceptanceRoute() {
  const { profile } = Route.useParams()
  const [view, setView] = useState<View | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    setView(null); setError(null)
    fetch(`/api/dev/vin006-acceptance?profile=${encodeURIComponent(profile)}`)
      .then((r) => r.json())
      .then((d) => (d.ok ? setView(d.view) : setError(d.error)))
      .catch((e) => setError(String(e)))
  }, [profile])

  const createInert = async () => {
    setNotice(null)
    const metric = view?.response_times.status === 'accepted' ? 'response_time_actual_median_min' : 'appointments_accepted_rows'
    const res = await fetch('/api/dev/vin006-acceptance', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profile, metric, recipient: 'duanewells@icloud.com' }),
    }).then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }))
    setNotice(res.ok ? `Inert notification ${res.outcome} (dispatch=${res.dispatch}) for metric "${res.record?.metric}" → ${res.record?.recipient}` : `Failed: ${res.error}`)
  }

  const badge = (s: string) => ({ padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#fff', background: s === 'accepted' ? '#166534' : s === 'withheld' ? '#92400e' : '#6b7280' }) as const

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 820, margin: '32px auto', padding: 16 }}>
      <h1 style={{ fontSize: 20 }}>VIN-006 Acceptance — <code>{profile}</code></h1>
      <p style={{ color: '#6b7280', fontSize: 13 }}>Isolated dev view of the promoted analytical root. Missing/quarantined families are withheld (never zero). Dispatch is disabled.</p>
      {error && <p style={{ color: '#b91c1c' }}>Error: {error}</p>}
      {!view && !error && <p>Loading…</p>}
      {view && (
        <>
          <h2 style={{ fontSize: 16, marginTop: 20 }}>Response Times <span style={badge(view.response_times.status)}>{view.response_times.status}</span></h2>
          {view.response_times.status === 'accepted' ? (
            <pre style={{ background: '#f3f4f6', padding: 12, borderRadius: 8, fontSize: 12, overflowX: 'auto' }}>{JSON.stringify(view.response_times.metrics, null, 2)}</pre>
          ) : <p style={{ color: '#92400e', fontSize: 13 }}>{view.response_times.note}</p>}

          <h2 style={{ fontSize: 16, marginTop: 20 }}>Native families</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr><th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: 6 }}>Family</th><th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: 6 }}>Status</th><th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: 6 }}>Rows</th><th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: 6 }}>Period</th></tr></thead>
            <tbody>
              {view.natives.map((n) => (
                <tr key={n.family}>
                  <td style={{ padding: 6 }}>{n.family}</td>
                  <td style={{ padding: 6 }}><span style={badge(n.status)}>{n.status}</span></td>
                  <td style={{ padding: 6 }}>{n.status === 'accepted' ? n.accepted_rows : <span style={{ color: '#92400e' }}>withheld</span>}</td>
                  <td style={{ padding: 6 }}>{n.period ? `${n.period.start} → ${n.period.end}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 style={{ fontSize: 16, marginTop: 24 }}>Inert test notification</h2>
          <button onClick={createInert} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}>
            Create inert notification → duanewells@icloud.com
          </button>
          {notice && <p style={{ marginTop: 10, fontSize: 13, color: notice.startsWith('Failed') ? '#b91c1c' : '#166534' }}>{notice}</p>}
        </>
      )}
    </div>
  )
}
