/**
 * customer-console.chat real renderer — Phase C.2 (AC.2.2, AC.2.3, AC.2.4).
 *
 * Reads /api/customer/agents?profile=X to populate an agent picker. Chat
 * round-trips POST to /api/customer/chat with the picked agent id. The
 * server persists turns into the messaging-hub store keyed channel: chat,
 * domain: chat so the conversation also appears in Comms (C.7).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { StudioConfig } from '../../lib/studio-config'

type CustomerAgent = {
  id: string
  name: string
  summary: string
  scope: string | null
  source: 'governance/agents' | 'profile-SOUL'
  has_chat_persona: boolean
}

type AgentRosterResponse = {
  ok: boolean
  profile: string
  agents: Array<CustomerAgent>
  default_agent: string | null
  error?: string
}

type ChatTurn = {
  role: 'user' | 'assistant'
  content: string
  via?: string
  ts: number
}

type ChatResponse = {
  ok: boolean
  reply?: string
  session_id?: string
  via?: 'hermes' | 'openai-direct'
  error?: string
}

export function CustomerChatRenderer(props: {
  profile: string
  config: StudioConfig
}) {
  const [roster, setRoster] = useState<AgentRosterResponse | null>(null)
  const [rosterError, setRosterError] = useState<string | null>(null)
  const [agentId, setAgentId] = useState<string | null>(null)
  const [turns, setTurns] = useState<Array<ChatTurn>>([])
  const [draft, setDraft] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(
      `/api/customer/agents?profile=${encodeURIComponent(props.profile)}`,
      { credentials: 'include' },
    )
      .then(async (res) => {
        const j = (await res.json().catch(() => ({}))) as AgentRosterResponse
        if (cancelled) return
        if (!res.ok || !j.ok) {
          setRosterError(j.error ?? `HTTP ${res.status}`)
          return
        }
        setRoster(j)
        if (j.agents.length > 0) {
          setAgentId(j.default_agent ?? j.agents[0].id)
        }
      })
      .catch((err) => {
        if (cancelled) return
        setRosterError(err instanceof Error ? err.message : 'fetch failed')
      })
    return () => {
      cancelled = true
    }
  }, [props.profile])

  useEffect(() => {
    // Reset session when changing agent — each agent gets its own thread.
    setSessionId(null)
    setTurns([])
  }, [agentId])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [turns])

  const accent = props.config.branding.accent_color ?? '#1e40af'

  const activeAgent = useMemo(
    () => roster?.agents.find((a) => a.id === agentId) ?? null,
    [roster, agentId],
  )

  async function send() {
    const message = draft.trim()
    if (!message || !agentId || busy) return
    setBusy(true)
    setError(null)
    const userTurn: ChatTurn = {
      role: 'user',
      content: message,
      ts: Date.now(),
    }
    setTurns((prev) => [...prev, userTurn])
    setDraft('')
    try {
      const res = await fetch('/api/customer/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: props.profile,
          agent_id: agentId,
          session_id: sessionId ?? undefined,
          message,
        }),
      })
      const j = (await res.json().catch(() => ({}))) as ChatResponse
      if (!res.ok || !j.ok || !j.reply) {
        setError(j.error ?? `HTTP ${res.status}`)
        return
      }
      if (j.session_id) setSessionId(j.session_id)
      const reply: ChatTurn = {
        role: 'assistant',
        content: j.reply,
        via: j.via,
        ts: Date.now(),
      }
      setTurns((prev) => [...prev, reply])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'network error')
    } finally {
      setBusy(false)
    }
  }

  if (rosterError) {
    return (
      <div className="rounded border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-300">
        Failed to load agent roster: {rosterError}
      </div>
    )
  }

  if (!roster) {
    return (
      <div className="rounded border border-white/10 p-4 text-xs opacity-60">
        Loading agents for {props.profile}…
      </div>
    )
  }

  if (roster.agents.length === 0) {
    return (
      <div className="rounded border border-amber-400/30 bg-amber-400/10 p-4 text-sm">
        No agents defined for{' '}
        <span className="font-medium">{props.profile}</span>.
        <div className="mt-1 text-xs opacity-70">
          Operator: drop SOUL fragments under{' '}
          <code>governance/agents/&lt;id&gt;.md</code> or seed a profile
          SOUL.md.
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full max-h-[calc(100dvh-220px)] flex-col gap-3">
      <header className="flex flex-col gap-2 rounded border border-white/10 bg-white/5 p-3">
        <div className="text-xs font-medium uppercase tracking-wide opacity-60">
          Pick an agent
        </div>
        <div className="flex flex-wrap gap-2">
          {roster.agents.map((a) => {
            const active = a.id === agentId
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setAgentId(a.id)}
                className={
                  'rounded border px-3 py-1.5 text-xs ' +
                  (active
                    ? 'font-semibold'
                    : 'border-white/10 opacity-70 hover:opacity-100')
                }
                style={
                  active
                    ? { borderColor: accent, background: `${accent}33` }
                    : undefined
                }
                title={a.summary}
              >
                <div className="text-sm">{a.name}</div>
                <div className="text-[10px] opacity-70">
                  {a.source === 'governance/agents' ? 'fragment' : 'profile SOUL'}
                  {a.has_chat_persona && ' · chat persona'}
                </div>
              </button>
            )
          })}
        </div>
        {activeAgent && (
          <div className="text-xs opacity-70">{activeAgent.summary}</div>
        )}
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded border border-white/10 bg-black/10 p-3"
      >
        {turns.length === 0 ? (
          <div className="text-xs opacity-50">
            Say hi to start the conversation. Messages here persist into Comms
            under channel: chat.
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {turns.map((t, i) => (
              <li
                key={i}
                className={
                  'max-w-[80%] rounded-lg px-3 py-2 text-sm ' +
                  (t.role === 'user'
                    ? 'ml-auto bg-white/10'
                    : 'mr-auto bg-emerald-500/10')
                }
              >
                <div className="whitespace-pre-wrap">{t.content}</div>
                {t.via && (
                  <div className="mt-1 text-[10px] opacity-50">via {t.via}</div>
                )}
              </li>
            ))}
            {busy && (
              <li className="mr-auto max-w-[80%] rounded-lg bg-emerald-500/10 px-3 py-2 text-xs opacity-70">
                {activeAgent?.name ?? 'Agent'} is typing…
              </li>
            )}
          </ul>
        )}
      </div>

      {error && (
        <div className="rounded border border-red-400/30 bg-red-500/10 p-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          placeholder={`Message ${activeAgent?.name ?? 'agent'}…`}
          rows={2}
          disabled={busy || !agentId}
          className="flex-1 resize-none rounded border border-white/10 bg-black/20 px-2 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !agentId || !draft.trim()}
          className="rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
          style={{ background: accent, color: '#fff' }}
        >
          {busy ? '…' : 'Send'}
        </button>
      </form>
    </div>
  )
}
