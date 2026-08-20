/**
 * Issues tab — the unified Semantic Watchdog + Hunches manifest.
 * Columns: Issue · Date · Category · Name · Details, with a Low/Med/High
 * priority badge. Per-row: Create Alert (bell → modal), Dismiss, Ignore.
 * "Ignored (N)" opens a modal listing muted items. Availability-safe: empty feed
 * shows a calm "all clear", never an error.
 */
import { useCallback, useEffect, useState } from 'react'
import './cockpit.css'

type Priority = 'low' | 'medium' | 'high'
type IssueRow = {
  key: string
  source: 'watchdog' | 'hunch'
  category: string
  priority: Priority
  issue: string
  name: string
  details: string
  date: number
}

const PRIORITY_STYLE: Record<Priority, { bg: string; fg: string; label: string }> = {
  high: { bg: 'rgba(232,56,79,0.15)', fg: '#E8384F', label: 'High' },
  medium: { bg: 'rgba(226,185,59,0.15)', fg: '#E2B93B', label: 'Med' },
  low: { bg: 'rgba(76,141,246,0.15)', fg: '#4C8DF6', label: 'Low' },
}

function fmtDate(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return '—'
  }
}

export function IssuesTab({ profile }: { profile: string }) {
  const [issues, setIssues] = useState<Array<IssueRow>>([])
  const [ignoredCount, setIgnoredCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [alertFor, setAlertFor] = useState<IssueRow | null>(null)
  const [showIgnored, setShowIgnored] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/customer/issues?profile=${encodeURIComponent(profile)}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((j: { ok: boolean; issues?: Array<IssueRow>; ignored_count?: number }) => {
        if (j.ok) {
          setIssues(j.issues ?? [])
          setIgnoredCount(j.ignored_count ?? 0)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [profile])

  useEffect(load, [load])

  const act = useCallback(
    async (row: IssueRow, action: 'dismiss' | 'ignore') => {
      await fetch('/api/customer/issues', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, action, source: row.source, key: row.key }),
      }).catch(() => {})
      load()
    },
    [profile, load],
  )

  return (
    <div className="cockpit" style={{ padding: 20, minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 className="sect-title">Issues</h2>
          <p className="sect-desc">What the Semantic Watchdog is watching for you — clues, not verdicts.</p>
        </div>
        <button type="button" className="wd-btn" onClick={() => setShowIgnored(true)}>
          Ignored ({ignoredCount})
        </button>
      </div>

      <div className="panel" style={{ overflowX: 'auto' }}>
        <table className="wd-table">
          <thead>
            <tr>
              <th>Issue</th><th>Date</th><th>Category</th><th>Name</th><th>Details</th><th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((row) => (
              <tr key={row.key}>
                <td>
                  <span className="wd-badge" style={{ background: PRIORITY_STYLE[row.priority].bg, color: PRIORITY_STYLE[row.priority].fg }}>
                    {PRIORITY_STYLE[row.priority].label}
                  </span>
                  {row.issue}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(row.date)}</td>
                <td>{row.category}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{row.name}</td>
                <td style={{ color: 'var(--txt-2)', maxWidth: 380 }}>{row.details}</td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                  <button type="button" className="wd-ico" title="Create alert" aria-label="Create alert" onClick={() => setAlertFor(row)}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
                  </button>
                  <button type="button" className="wd-btn ghost" onClick={() => act(row, 'ignore')}>Ignore</button>
                  <button type="button" className="wd-btn" onClick={() => act(row, 'dismiss')}>Dismiss</button>
                </td>
              </tr>
            ))}
            {!loading && issues.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--txt-2)', padding: 28 }}>All clear — nothing needs attention right now.</td></tr>
            )}
            {loading && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--txt-2)', padding: 28 }}>Scanning…</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {alertFor && (
        <CreateAlertModal profile={profile} row={alertFor} onClose={() => setAlertFor(null)} />
      )}
      {showIgnored && (
        <IgnoredModal profile={profile} onClose={() => { setShowIgnored(false); load() }} />
      )}

      <style>{`
        .cockpit .wd-table{width:100%;border-collapse:collapse;font-size:13px}
        .cockpit .wd-table th{text-align:left;padding:10px 14px;color:var(--txt-3);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--line)}
        .cockpit .wd-table td{padding:12px 14px;border-bottom:1px solid var(--line);vertical-align:top}
        .cockpit .wd-badge{display:inline-block;font-size:10px;font-weight:700;padding:2px 7px;border-radius:5px;margin-right:8px}
        .cockpit .wd-btn{background:var(--surface-2);color:var(--txt);border:1px solid var(--line-strong);border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer;margin-left:6px}
        .cockpit .wd-btn:hover{border-color:var(--txt-2)}
        .cockpit .wd-btn.ghost{background:transparent}
        .cockpit .wd-ico{background:transparent;border:0;color:var(--cool);cursor:pointer;padding:6px;vertical-align:middle}
        .cockpit .wd-ico:hover{color:#fff}
        .cockpit .wd-modal-bg{position:fixed;inset:0;background:rgba(3,7,15,.7);display:grid;place-items:center;z-index:500}
        .cockpit .wd-modal{background:var(--surface);border:1px solid var(--line-strong);border-radius:12px;padding:22px;width:min(460px,calc(100vw - 32px));max-height:80vh;overflow:auto}
        .cockpit .wd-input{width:100%;background:rgba(255,255,255,.04);border:1px solid var(--line-strong);border-radius:8px;color:var(--txt);padding:10px 12px;font-size:14px;box-sizing:border-box}
      `}</style>
    </div>
  )
}

function CreateAlertModal({ profile, row, onClose }: { profile: string; row: IssueRow; onClose: () => void }) {
  const [email, setEmail] = useState('duanekwells@gmail.com')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const submit = useCallback(async () => {
    setSaving(true)
    setErr(null)
    try {
      const res = await fetch('/api/customer/issues', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile, action: 'create-alert', email,
          query_name: row.issue, description: row.details, source_key: row.key,
        }),
      })
      const j = (await res.json().catch(() => ({}))) as { ok: boolean; error?: string }
      if (!res.ok || !j.ok) { setErr(j.error ?? 'Could not create the alert.'); return }
      setDone(true)
    } catch {
      setErr('Could not create the alert.')
    } finally {
      setSaving(false)
    }
  }, [profile, email, row])

  return (
    <div className="wd-modal-bg" onClick={onClose}>
      <div className="wd-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="sect-title" style={{ marginBottom: 10 }}>Create alert</h3>
        <div className="sect-desc" style={{ marginBottom: 4 }}><strong style={{ color: 'var(--txt)' }}>{row.issue}</strong></div>
        <p className="sect-desc">{row.details}</p>
        {done ? (
          <div style={{ color: 'var(--good)', marginTop: 8 }}>Alert created — it’s now on your Notifications page.</div>
        ) : (
          <>
            <label className="sect-desc" style={{ display: 'block', marginTop: 12 }}>Email to notify</label>
            <input className="wd-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            {err && <div style={{ color: 'var(--standby)', marginTop: 8, fontSize: 13 }}>{err}</div>}
          </>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button type="button" className="wd-btn ghost" onClick={onClose}>{done ? 'Close' : 'Cancel'}</button>
          {!done && <button type="button" className="wd-btn" style={{ background: 'var(--cool)', borderColor: 'var(--cool)', color: '#fff' }} disabled={saving} onClick={submit}>{saving ? 'Creating…' : 'Create alert'}</button>}
        </div>
      </div>
    </div>
  )
}

function IgnoredModal({ profile, onClose }: { profile: string; onClose: () => void }) {
  const [rows, setRows] = useState<Array<IssueRow>>([])
  useEffect(() => {
    fetch(`/api/customer/issues?profile=${encodeURIComponent(profile)}&status=ignored`, { credentials: 'include' })
      .then((r) => r.json())
      .then((j: { ok: boolean; issues?: Array<IssueRow> }) => setRows(j.issues ?? []))
      .catch(() => {})
  }, [profile])

  const reopen = useCallback(async (row: IssueRow) => {
    await fetch('/api/customer/issues', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile, action: 'reopen', source: row.source, key: row.key }),
    }).catch(() => {})
    setRows((rs) => rs.filter((r) => r.key !== row.key))
  }, [profile])

  return (
    <div className="wd-modal-bg" onClick={onClose}>
      <div className="wd-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="sect-title" style={{ marginBottom: 12 }}>Ignored issues</h3>
        {rows.length === 0 && <p className="sect-desc">Nothing ignored.</p>}
        {rows.map((row) => (
          <div key={row.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
            <div><div style={{ fontSize: 13 }}>{row.issue}</div><div className="sect-desc" style={{ margin: 0 }}>{row.name}</div></div>
            <button type="button" className="wd-btn" onClick={() => reopen(row)}>Restore</button>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="wd-btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
