/**
 * customer-console.chat real renderer — the customer-facing "Agents" area.
 *
 * Reads /api/customer/agents?profile=X to populate an agent picker. Chat
 * round-trips POST to /api/customer/chat with the picked agent id. Turns are
 * persisted so the conversation also appears in Teambox.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { StudioConfig } from '../../lib/studio-config'

// WF-014: gunmetal blue for send button and active selection
const PRIMARY = '#2f3b4d'
const ACTIVE = '#2f3b4d'

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

/** A short, customer-safe role label (never "fragment"/"SOUL"/file terms). */
function roleLabel(a: CustomerAgent): string | null {
  const s = (a.scope ?? '').trim()
  if (!s || s.length > 24 || s.includes('/') || s.includes('.md')) return null
  return s
}

function isGovernanceAgent(a: CustomerAgent): boolean {
  const text = `${a.id} ${a.name} ${a.summary} ${a.scope ?? ''}`.toLowerCase()
  return (
    text.includes('semantic guardian') ||
    text.includes('knowledge semantic guardian') ||
    text.includes('data semantic guardian') ||
    text.includes('data-governor') ||
    text.includes('knowledge-governor') ||
    text.includes('guardian')
  )
}

/** Extract first name from "First Last" format (e.g., "Nancy Gaston" → "Nancy"). */
function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName
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
    fetch(`/api/customer/agents?profile=${encodeURIComponent(props.profile)}`, {
      credentials: 'include',
    })
      .then(async (res) => {
        const j = (await res.json().catch(() => ({}))) as AgentRosterResponse
        if (cancelled) return
        if (!res.ok || !j.ok) {
          setRosterError(j.error ?? `HTTP ${res.status}`)
          return
        }
        const chatAgents = j.agents.filter((a) => !isGovernanceAgent(a))
        const defaultAgent =
          j.default_agent && chatAgents.some((a) => a.id === j.default_agent)
            ? j.default_agent
            : (chatAgents[0]?.id ?? null)
        // WF-014: sort Nancy Gaston first if she's the default
        const sortedAgents = [...chatAgents].sort((a, b) => {
          if (a.id === defaultAgent) return -1
          if (b.id === defaultAgent) return 1
          return 0
        })
        setRoster({ ...j, agents: sortedAgents, default_agent: defaultAgent })
        if (defaultAgent) {
          setAgentId(defaultAgent)
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
        setError(
          'Sorry — the assistant is unavailable right now. Please try again.',
        )
        return
      }
      if (j.session_id) setSessionId(j.session_id)
      setTurns((prev) => [
        ...prev,
        { role: 'assistant', content: j.reply!, via: j.via, ts: Date.now() },
      ])
    } catch {
      setError(
        'Sorry — the assistant is unavailable right now. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  if (rosterError) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Your agents aren’t available right now. Please refresh, or contact your
        Huminic administrator if this continues.
      </div>
    )
  }

  if (!roster) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Loading your agents…
      </div>
    )
  }

  if (roster.agents.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        No agents are set up for this storefront yet. Your Huminic team will add
        them shortly.
      </div>
    )
  }

  return (
    <div className="flex h-full max-h-[calc(100dvh-220px)] flex-col gap-3">
      <header className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Pick an agent
        </div>
        <div className="flex flex-wrap gap-2">
          {roster.agents.map((a) => {
            const active = a.id === agentId
            const role = roleLabel(a)
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setAgentId(a.id)}
                className={
                  'rounded-lg border px-3 py-1.5 text-left transition-colors ' +
                  (active
                    ? 'font-semibold'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50')
                }
                style={
                  active
                    ? { borderColor: ACTIVE, background: `${ACTIVE}14` }
                    : undefined
                }
                title={a.summary}
              >
                <div className="text-sm text-slate-900">{a.name}</div>
                {role && (
                  <div className="text-[10px] capitalize text-slate-500">
                    {role}
                  </div>
                )}
              </button>
            )
          })}
        </div>
        {activeAgent && (
          <div className="text-xs text-slate-600">{activeAgent.summary}</div>
        )}
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3"
      >
        {turns.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-md text-center">
              <div className="text-sm font-medium text-slate-700 mb-3">
                {activeAgent?.name ? `Ask ${firstName(activeAgent.name)} Anything` : 'Start a conversation'}
              </div>
              <div className="text-xs text-slate-500 space-y-1">
                <div>• What are your hours?</div>
                <div>• Do you have [vehicle model] in stock?</div>
                <div>• How do I schedule service?</div>
              </div>
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {turns.map((t, i) => (
              <li
                key={i}
                className={
                  'max-w-[80%] rounded-lg px-3 py-2 text-sm ' +
                  (t.role === 'user'
                    ? 'ml-auto bg-blue-500 text-white'
                    : 'mr-auto border border-slate-200 bg-white text-slate-900')
                }
              >
                <div className="whitespace-pre-wrap">{t.content}</div>
              </li>
            ))}
            {busy && (
              <li className="mr-auto max-w-[80%] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                {activeAgent?.name ?? 'Agent'} is typing…
              </li>
            )}
          </ul>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-600">
          {error}
        </div>
      )}

      <form
        className="flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2"
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
          placeholder={activeAgent?.name ? `Ask ${firstName(activeAgent.name)} Anything...` : 'Ask Anything...'}
          rows={1}
          disabled={busy || !agentId}
          className="flex-1 resize-none border-0 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !agentId || !draft.trim()}
          className="ml-2 rounded-lg px-4 py-1.5 text-sm font-medium text-white transition-opacity disabled:opacity-50"
          style={{ background: PRIMARY }}
        >
          {busy ? '…' : 'Send'}
        </button>
      </form>
    </div>
  )
}
