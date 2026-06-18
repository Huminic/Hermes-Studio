/**
 * customer-console.chat — the Workspace Chat page.
 *
 * Reads /api/customer/agents to populate a single modern agent dropdown (agent
 * name only). Chat round-trips POST to /api/customer/chat with the selected
 * agent. A left-anchored slide-out lists the selected agent's past chat
 * sessions AND tasks (visually distinguished). Turns persist in the
 * messaging-hub so the conversation also appears in Teambox.
 *
 * Behavior rules (locked by spec):
 *  - Slide-out starts closed and never auto-opens; open/closed state is
 *    preserved across agent switches.
 *  - Selecting an agent or starting a new chat ALWAYS begins a fresh chat
 *    (new_session) — never resumes the previous one.
 *  - Opening an existing chat loads it and scrolls to the last message.
 *  - A session is created only on the first send, so empty interactions are
 *    never saved.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUp01Icon,
  Message01Icon,
  PencilEdit02Icon,
  Settings02Icon,
  SidebarLeft01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { StudioConfig } from '../../lib/studio-config'
import { Dropdown } from './console-ui'

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

type SessionSummary = {
  id: string
  agent_id: string | null
  title: string
  preview: string
  message_count: number
  created_at: number
  updated_at: number
}

type TaskRow = {
  id: string
  agent_id: string
  title: string
  frequency: 'one_time' | 'recurring'
  status: 'active' | 'paused' | 'completed'
}

/** A short, customer-safe role label (never "fragment"/"SOUL"/file terms). */
function roleLabel(a: CustomerAgent): string | null {
  const s = (a.scope ?? '').trim()
  if (!s || s.length > 24 || s.includes('/') || s.includes('.md')) return null
  return s
}

/** Extract first name from "First Last" format (e.g., "Nancy Gaston" → "Nancy"). */
function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName
}

/** Read ?agent= from the URL so the Agents page "Chat" button can pre-select. */
function agentFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return new URL(window.location.href).searchParams.get('agent')
  } catch {
    return null
  }
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
  // Slide-out: starts CLOSED, never auto-opens, state preserved across switches.
  const [slideOpen, setSlideOpen] = useState(false)
  const [sessions, setSessions] = useState<Array<SessionSummary>>([])
  const [tasks, setTasks] = useState<Array<TaskRow>>([])
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const preselectedRef = useRef<string | null>(agentFromUrl())

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
        const fallback =
          j.default_agent && j.agents.some((a) => a.id === j.default_agent)
            ? j.default_agent
            : (j.agents[0]?.id ?? null)
        // Honor ?agent= pre-selection from the Agents page "Chat" button.
        const pre = preselectedRef.current
        const initial =
          pre && j.agents.some((a) => a.id === pre) ? pre : fallback
        const sortedAgents = [...j.agents].sort((a, b) => {
          if (a.id === initial) return -1
          if (b.id === initial) return 1
          return 0
        })
        setRoster({ ...j, agents: sortedAgents, default_agent: fallback })
        if (initial) setAgentId(initial)
      })
      .catch((err) => {
        if (cancelled) return
        setRosterError(err instanceof Error ? err.message : 'fetch failed')
      })
    return () => {
      cancelled = true
    }
  }, [props.profile])

  const loadSlideData = useCallback(
    (agent: string) => {
      const p = encodeURIComponent(props.profile)
      const a = encodeURIComponent(agent)
      fetch(`/api/customer/sessions?profile=${p}&agent_id=${a}`, {
        credentials: 'include',
      })
        .then(async (res) => {
          const j = (await res.json().catch(() => ({}))) as {
            ok: boolean
            sessions?: Array<SessionSummary>
          }
          if (j.ok && j.sessions) setSessions(j.sessions)
        })
        .catch(() => {})
      fetch(`/api/customer/agent-tasks?profile=${p}&agent_id=${a}`, {
        credentials: 'include',
      })
        .then(async (res) => {
          const j = (await res.json().catch(() => ({}))) as {
            ok: boolean
            tasks?: Array<TaskRow>
          }
          if (j.ok && j.tasks) setTasks(j.tasks)
        })
        .catch(() => {})
    },
    [props.profile],
  )

  // Agent change → fresh chat + reload that agent's sessions/tasks. Slide-out
  // open/closed state is intentionally NOT touched here.
  useEffect(() => {
    setSessionId(null)
    setTurns([])
    setError(null)
    if (agentId) {
      setSessions([])
      setTasks([])
      loadSlideData(agentId)
    }
  }, [agentId, loadSlideData])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [turns])

  const activeAgent = useMemo(
    () => roster?.agents.find((a) => a.id === agentId) ?? null,
    [roster, agentId],
  )

  function startNewChat() {
    setSessionId(null)
    setTurns([])
    setError(null)
    setDraft('')
  }

  async function openSession(id: string) {
    setError(null)
    try {
      const res = await fetch(
        `/api/customer/sessions?profile=${encodeURIComponent(
          props.profile,
        )}&session_id=${encodeURIComponent(id)}`,
        { credentials: 'include' },
      )
      const j = (await res.json().catch(() => ({}))) as {
        ok: boolean
        session?: { id: string; turns: Array<ChatTurn> }
      }
      if (!res.ok || !j.ok || !j.session) {
        setError('That conversation could not be opened.')
        return
      }
      setSessionId(j.session.id)
      setTurns(j.session.turns)
      // Close the drawer on mobile after opening; scroll-to-last handled by effect.
      if (window.matchMedia('(max-width: 767px)').matches) setSlideOpen(false)
    } catch {
      setError('That conversation could not be opened.')
    }
  }

  async function send() {
    const message = draft.trim()
    if (!message || !agentId || busy) return
    const wasNew = sessionId === null
    setBusy(true)
    setError(null)
    const userTurn: ChatTurn = { role: 'user', content: message, ts: Date.now() }
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
          // First message of a fresh chat → force a new thread bound to this agent.
          new_session: wasNew,
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
      // The first send created a session — refresh the slide-out list.
      if (wasNew && agentId) loadSlideData(agentId)
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

  const agentOptions = roster.agents.map((a) => ({
    value: a.id,
    label: a.name,
    hint: roleLabel(a) ?? undefined,
  }))

  return (
    <div className="relative flex h-[calc(100dvh-128px)] overflow-hidden rounded-lg border border-slate-200 bg-white">
      {/* ── Slide-out (past sessions + tasks) ─────────────────────────────── */}
      {slideOpen && (
        <>
          <button
            type="button"
            aria-label="Close panel"
            tabIndex={-1}
            onClick={() => setSlideOpen(false)}
            className="absolute inset-0 z-30 cursor-default bg-black/30 md:hidden"
          />
          <aside
            data-testid="chat-slideout"
            className="absolute inset-y-0 left-0 z-40 flex w-72 max-w-[85%] flex-col border-r border-slate-200 bg-slate-50 md:relative md:z-0 md:w-72 md:max-w-none md:shrink-0"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                History
              </span>
              <button
                type="button"
                onClick={() => setSlideOpen(false)}
                aria-label="Hide panel"
                className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-700"
              >
                <HugeiconsIcon icon={SidebarLeft01Icon} size={16} strokeWidth={1.8} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <button
                type="button"
                onClick={startNewChat}
                className="mb-2 flex w-full items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-white"
              >
                <HugeiconsIcon icon={PencilEdit02Icon} size={15} strokeWidth={1.8} />
                New chat
              </button>

              {sessions.length === 0 && tasks.length === 0 ? (
                <p className="px-2 py-3 text-xs text-slate-400">
                  No conversations or tasks yet for{' '}
                  {activeAgent ? firstName(activeAgent.name) : 'this agent'}.
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {sessions.map((s) => (
                    <li key={`chat-${s.id}`}>
                      <button
                        type="button"
                        onClick={() => openSession(s.id)}
                        className={
                          'flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-white ' +
                          (s.id === sessionId ? 'bg-white font-medium' : '')
                        }
                      >
                        <span
                          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white"
                          style={{ background: ACTIVE }}
                          title="Chat"
                        >
                          <HugeiconsIcon icon={Message01Icon} size={11} strokeWidth={2} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-slate-800">
                            {s.title}
                          </span>
                          <span className="block truncate text-[11px] text-slate-400">
                            {s.preview}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                  {tasks.map((t) => (
                    <li key={`task-${t.id}`}>
                      <div
                        className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-sm"
                        title="Task"
                      >
                        <span
                          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white"
                          title="Task"
                        >
                          <HugeiconsIcon icon={Settings02Icon} size={11} strokeWidth={2} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-slate-700">
                            {t.title}
                          </span>
                          <span className="block truncate text-[11px] capitalize text-amber-600">
                            {t.frequency.replace('_', '-')} · {t.status}
                          </span>
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </>
      )}

      {/* Toggle handle at the left edge when closed. */}
      {!slideOpen && (
        <button
          type="button"
          data-testid="chat-slideout-toggle"
          onClick={() => setSlideOpen(true)}
          aria-label="Show past sessions and tasks"
          className="absolute left-0 top-1/2 z-20 flex h-16 w-6 -translate-y-1/2 items-center justify-center rounded-r-lg border border-l-0 border-slate-200 bg-slate-50 text-slate-400 shadow-sm hover:bg-slate-100 hover:text-slate-700"
        >
          <HugeiconsIcon icon={SidebarLeft01Icon} size={16} strokeWidth={1.8} />
        </button>
      )}

      {/* ── Main chat column ───────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3 pl-9">
          <Dropdown
            value={agentId}
            options={agentOptions}
            onChange={(v) => setAgentId(v)}
            ariaLabel="Select agent"
            placeholder="Select agent"
          />
          <button
            type="button"
            onClick={startNewChat}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50"
          >
            <HugeiconsIcon icon={PencilEdit02Icon} size={15} strokeWidth={1.8} />
            New chat
          </button>
        </header>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-3"
          data-testid="chat-scroll"
        >
          {turns.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="max-w-md text-center">
                <div className="mb-3 text-sm font-medium text-slate-700">
                  {activeAgent?.name
                    ? `Ask ${firstName(activeAgent.name)} Anything`
                    : 'Start a conversation'}
                </div>
                <div className="space-y-1 text-xs text-slate-500">
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
                      ? 'ml-auto text-white'
                      : 'mr-auto border border-slate-200 bg-white text-slate-900')
                  }
                  style={t.role === 'user' ? { background: PRIMARY } : undefined}
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
          <div className="mx-4 mb-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-600">
            {error}
          </div>
        )}

        <form
          className="m-3 flex items-end gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2"
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
            placeholder={
              activeAgent?.name
                ? `Ask ${firstName(activeAgent.name)} Anything...`
                : 'Ask Anything...'
            }
            rows={1}
            disabled={busy || !agentId}
            className="max-h-40 flex-1 resize-none border-0 bg-transparent py-1 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !agentId || !draft.trim()}
            aria-label="Send message"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-opacity disabled:opacity-40"
            style={{ background: PRIMARY }}
          >
            <HugeiconsIcon icon={ArrowUp01Icon} size={18} strokeWidth={2.2} />
          </button>
        </form>
      </div>
    </div>
  )
}
