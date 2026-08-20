/**
 * Ask-AI chat box for the Dashboard landing. Reuses the existing, unchanged
 * `/api/customer/dashboard-ask` endpoint (grounded on the store's real data),
 * styled for the cockpit. Non-invasive: no changes to the existing Custom tab.
 */
import { useCallback, useState } from 'react'

export function AskAi({
  profile,
  windowDays,
}: {
  profile: string
  windowDays: number
}) {
  const [q, setQ] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const ask = useCallback(async () => {
    const text = q.trim()
    if (!text || asking) return
    setAsking(true)
    setErr(null)
    setAnswer(null)
    try {
      const res = await fetch('/api/customer/dashboard-ask', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, question: text, window_days: windowDays }),
      })
      const j = (await res.json().catch(() => ({}))) as {
        ok: boolean
        answer?: string
        error?: string
      }
      if (!res.ok || !j.ok) {
        setErr(j.error ?? 'Ask AI is unavailable right now.')
        return
      }
      setAnswer(j.answer ?? '')
    } catch {
      setErr('Ask AI is unavailable right now.')
    } finally {
      setAsking(false)
    }
  }, [q, profile, windowDays, asking])

  return (
    <section>
      <h2 className="sect-title">Ask your dashboard</h2>
      <p className="sect-desc">
        Questions about this store's numbers — answered only from its real data.
      </p>
      <div className="panel" style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <textarea
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ask()
            }}
            placeholder="e.g. Which lead source replies the most? How are we doing after hours?"
            rows={2}
            style={{
              flex: '1 1 320px',
              minWidth: 0,
              resize: 'vertical',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--line-strong)',
              borderRadius: 8,
              color: 'var(--txt)',
              padding: '10px 12px',
              fontFamily: 'inherit',
              fontSize: 14,
            }}
          />
          <button
            type="button"
            onClick={ask}
            disabled={asking || !q.trim()}
            style={{
              alignSelf: 'flex-start',
              background: 'var(--cool)',
              color: '#fff',
              border: 0,
              borderRadius: 8,
              padding: '10px 18px',
              fontWeight: 600,
              cursor: asking || !q.trim() ? 'default' : 'pointer',
              opacity: asking || !q.trim() ? 0.6 : 1,
            }}
          >
            {asking ? 'Thinking…' : 'Ask'}
          </button>
        </div>
        {err && (
          <div className="gsub" style={{ marginTop: 12, color: 'var(--standby)' }}>
            {err}
          </div>
        )}
        {answer && (
          <div
            style={{
              marginTop: 14,
              whiteSpace: 'pre-wrap',
              fontSize: 14,
              lineHeight: 1.55,
              color: 'var(--txt)',
            }}
          >
            {answer}
          </div>
        )}
      </div>
    </section>
  )
}
