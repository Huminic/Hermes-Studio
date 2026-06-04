/**
 * customer-console.comms — the customer "Teambox" unified inbox (SERRA-UI-8).
 *
 * Four-column layout: segment switcher (Sales | Service) → filtered thread list
 * (by channel + by agent) → thread detail with inbound/outbound direction and a
 * composer → customer-info + take-over (human handoff) panel. SSE subscribed for
 * live updates.
 *
 * Hard rules enforced here:
 *  - Sales and Service are isolated: switching the segment clears the open thread
 *    and re-selects within the new segment so a Sales conversation can never bleed
 *    into the Service view.
 *  - The customer never sees backend internals: system/notification annotations
 *    (env-var names, "unconfigured token", routing strings) are not rendered in
 *    the conversation. Only real customer + agent/rep messages appear.
 *  - Channels and handlers are shown with plain-language labels (Text, Email,
 *    Call, Video — never "vapi"/"tavus"/"domain:").
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { StudioConfig } from '../../lib/studio-config'

type ThreadSummary = {
  id: string
  profile: string
  domain: string
  channel: string
  subject: string
  contact_handle: string
  assigned_agent_id: string | null
  status: 'open' | 'snoozed' | 'closed'
  created_at: number
  updated_at: number
  message_count: number
  last_message_preview: string
}

type ThreadMessage = {
  id: string
  direction: 'inbound' | 'outbound'
  role: 'user' | 'assistant' | 'system'
  channel: string
  content: string
  author: string
  created_at: number
  metadata: Record<string, unknown>
}

type ThreadDetail = ThreadSummary & {
  human_assigned?: boolean
  messages: Array<ThreadMessage>
}

type ContactSummary = {
  id: string
  display_name: string | null
  identifiers: Record<string, string>
  channels: Array<string>
}

type ListResponse = { ok: boolean; threads: Array<ThreadSummary> }
type DetailResponse = { ok: boolean; thread: ThreadDetail }
type ContactsResponse = { ok: boolean; contacts: Array<ContactSummary> }
type AssignResponse = {
  ok: boolean
  human_assigned?: boolean
  assigned_to?: string | null
}

// ── Plain-language channel model ────────────────────────────────────────────
// One canonical "kind" per raw backend channel string. The customer only ever
// sees the friendly label; raw values (sms/vapi/tavus/email-adf) never render.
type ChannelKind = 'text' | 'email' | 'call' | 'video' | 'chat' | 'other'

function channelKind(channel: string): ChannelKind {
  switch (channel) {
    case 'sms':
    case 'textmagic':
    case 'text':
      return 'text'
    case 'email':
    case 'email-adf':
      return 'email'
    case 'voice':
    case 'phone':
    case 'vapi':
    case 'call':
      return 'call'
    case 'video':
    case 'tavus':
      return 'video'
    case 'chat':
      return 'chat'
    default:
      return 'other'
  }
}

const CHANNEL_LABEL: Record<ChannelKind, string> = {
  text: 'Text',
  email: 'Email',
  call: 'Call',
  video: 'Video',
  chat: 'Chat',
  other: 'Message',
}

function channelLabel(channel: string): string {
  return CHANNEL_LABEL[channelKind(channel)]
}

const CHANNEL_GLYPH: Record<ChannelKind, string> = {
  text: '💬',
  email: '✉️',
  call: '☎️',
  video: '🎥',
  chat: '💬',
  other: '·',
}

// Channel filter chips (req #3). "All" plus one chip per friendly kind.
const CHANNEL_FILTERS: Array<{ key: 'all' | ChannelKind; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'text', label: 'Text' },
  { key: 'email', label: 'Email' },
  { key: 'call', label: 'Call' },
  { key: 'video', label: 'Video' },
  { key: 'chat', label: 'Chat' },
]

// Display name for an agent id (req #3). Keeps it human; falls back to a
// title-cased id when we have no nicer label.
function agentLabel(agentId: string): string {
  const known: Record<string, string> = {
    caroline: 'Caroline',
    nancy: 'Nancy Gaston',
    'nancy-gaston': 'Nancy Gaston',
  }
  if (known[agentId]) return known[agentId]
  return agentId
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}

// Light-theme palette (storefront): white / slate. Blue primary, purple active.
const PRIMARY = '#3b82f6'
const ACTIVE = '#8b5cf6'

export function CustomerCommsRenderer(props: {
  profile: string
  config: StudioConfig
}) {
  const [segment, setSegment] = useState<'sales' | 'service'>('sales')
  const [channelFilter, setChannelFilter] = useState<'all' | ChannelKind>('all')
  const [agentFilter, setAgentFilter] = useState<string>('all')
  const [threads, setThreads] = useState<Array<ThreadSummary>>([])
  const [contacts, setContacts] = useState<Array<ContactSummary>>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ThreadDetail | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [assignBusy, setAssignBusy] = useState(false)
  const [composerChannel, setComposerChannel] = useState<string>('chat')
  const [agentTyping, setAgentTyping] = useState<{
    threadId: string
    agentId: string
  } | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  // Tracks which segment the loaded threads belong to, so a stale Sales response
  // can never paint into the Service list (race guard for segment isolation).
  const segmentRef = useRef(segment)
  useEffect(() => {
    segmentRef.current = segment
  }, [segment])

  const loadThreads = useCallback(
    async (forSegment: 'sales' | 'service') => {
      try {
        const res = await fetch(
          `/api/messaging/threads?profile=${encodeURIComponent(
            props.profile,
          )}&domain=${forSegment}&limit=100`,
          { credentials: 'include' },
        )
        const j = (await res.json().catch(() => ({}))) as ListResponse
        if (!res.ok || !j.ok) return
        // Drop the response if the user has since switched segments.
        if (segmentRef.current !== forSegment) return
        setThreads(j.threads)
      } catch {
        // ignore
      }
    },
    [props.profile],
  )

  const loadDetail = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(
          `/api/messaging/threads/${encodeURIComponent(
            id,
          )}?profile=${encodeURIComponent(props.profile)}`,
          { credentials: 'include' },
        )
        const j = (await res.json().catch(() => ({}))) as DetailResponse
        if (!res.ok || !j.ok) return
        setDetail(j.thread)
        setComposerChannel(j.thread.channel)
      } catch {
        // ignore
      }
    },
    [props.profile],
  )

  const loadContacts = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/messaging/contacts?profile=${encodeURIComponent(props.profile)}`,
        { credentials: 'include' },
      )
      const j = (await res.json().catch(() => ({}))) as ContactsResponse
      if (!res.ok || !j.ok) return
      setContacts(j.contacts)
    } catch {
      // ignore
    }
  }, [props.profile])

  // Take-over / hand-back (req #6). Assigning the thread to the rep pauses the
  // autonomous agent: the reply pipeline checks isHumanAssigned(profile,thread)
  // both before generating AND before sending, and the assign endpoint sets that
  // exact thread_takeover row. Handing back clears it and resumes the agent.
  const setTakeOver = useCallback(
    async (action: 'take_over' | 'hand_back') => {
      if (!detail) return
      setAssignBusy(true)
      try {
        const res = await fetch(
          `/api/messaging/threads/${encodeURIComponent(detail.id)}/assign`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile: props.profile, action }),
          },
        )
        const j = (await res.json().catch(() => ({}))) as AssignResponse
        if (res.ok && j.ok) {
          setDetail((d) =>
            d && d.id === detail.id
              ? { ...d, human_assigned: !!j.human_assigned }
              : d,
          )
        }
      } finally {
        setAssignBusy(false)
      }
    },
    [detail, props.profile],
  )

  // Segment switch: hard-reset the open conversation so a thread from the other
  // segment can never stay on screen (the core Sales↔Service isolation fix).
  const switchSegment = useCallback(
    (s: 'sales' | 'service') => {
      if (s === segment) return
      setSegment(s)
      setSelectedId(null)
      setDetail(null)
      setThreads([])
      setAgentFilter('all')
    },
    [segment],
  )

  useEffect(() => {
    void loadThreads(segment)
    void loadContacts()
  }, [loadThreads, loadContacts, segment])

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId)
    else setDetail(null)
  }, [loadDetail, selectedId])

  // SSE subscription
  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const es = new EventSource(
      `/api/messaging/stream?profile=${encodeURIComponent(props.profile)}`,
      { withCredentials: true },
    )
    const onMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data ?? '{}') as Record<string, unknown>
        const t = String(data.type ?? '')
        if (
          t === 'thread_created' ||
          t === 'thread_status_changed' ||
          t === 'message_appended'
        ) {
          void loadThreads(segmentRef.current)
          if (
            t === 'message_appended' &&
            typeof data.thread_id === 'string' &&
            data.thread_id === selectedId
          ) {
            void loadDetail(selectedId)
          }
        } else if (t === 'agent_replying') {
          setAgentTyping({
            threadId: String(data.thread_id),
            agentId: String(data.agent_id),
          })
        } else if (t === 'agent_reply_sent') {
          setAgentTyping(null)
          if (
            typeof data.thread_id === 'string' &&
            data.thread_id === selectedId
          ) {
            void loadDetail(selectedId)
          }
        }
      } catch {
        // ignore malformed events
      }
    }
    es.addEventListener('thread_created', onMessage)
    es.addEventListener('message_appended', onMessage)
    es.addEventListener('thread_status_changed', onMessage)
    es.addEventListener('agent_replying', onMessage)
    es.addEventListener('agent_reply_sent', onMessage)
    es.addEventListener('connected', () => {})
    return () => es.close()
  }, [loadDetail, loadThreads, props.profile, selectedId])

  const send = useCallback(async () => {
    if (!detail || !draft.trim()) return
    setBusy(true)
    try {
      const res = await fetch(
        `/api/messaging/threads/${encodeURIComponent(detail.id)}/reply`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profile: props.profile,
            channel: composerChannel,
            content: draft.trim(),
          }),
        },
      )
      if (res.ok) {
        setDraft('')
        await loadDetail(detail.id)
      }
    } finally {
      setBusy(false)
    }
  }, [composerChannel, detail, draft, loadDetail, props.profile])

  // Agent options for the by-agent filter (req #3): derived from the assigned
  // agents present on this segment's threads.
  const agentOptions = useMemo(() => {
    const ids = new Set<string>()
    for (const t of threads) {
      if (t.assigned_agent_id) ids.add(t.assigned_agent_id)
    }
    return Array.from(ids).sort()
  }, [threads])

  // Apply channel + agent filters on top of the segment-scoped thread list.
  const visibleThreads = useMemo(() => {
    return threads.filter((t) => {
      if (channelFilter !== 'all' && channelKind(t.channel) !== channelFilter) {
        return false
      }
      if (agentFilter !== 'all') {
        if (agentFilter === '__unassigned') {
          if (t.assigned_agent_id) return false
        } else if (t.assigned_agent_id !== agentFilter) {
          return false
        }
      }
      return true
    })
  }, [threads, channelFilter, agentFilter])

  // Keep selection valid as filters/segment change: select the first visible
  // thread; clear when none match.
  useEffect(() => {
    if (visibleThreads.length === 0) {
      if (selectedId !== null) setSelectedId(null)
      return
    }
    if (!visibleThreads.some((t) => t.id === selectedId)) {
      setSelectedId(visibleThreads[0].id)
    }
  }, [visibleThreads, selectedId])

  const idxOfSelected = useMemo(
    () => visibleThreads.findIndex((t) => t.id === selectedId),
    [selectedId, visibleThreads],
  )

  // Customer-info panel source: the contact behind the selected thread.
  const activeContact = useMemo(() => {
    if (!detail) return null
    return (
      contacts.find((c) =>
        Object.values(c.identifiers).includes(detail.contact_handle),
      ) ?? null
    )
  }, [contacts, detail])

  // Conversation messages: ONLY real customer + agent/rep messages. System /
  // notification annotations (lead-notification outcomes, routing diagnostics,
  // env-var/"unconfigured" strings) are internal and never shown to the customer.
  const visibleMessages = useMemo(() => {
    if (!detail) return []
    return detail.messages.filter((m) => m.role !== 'system')
  }, [detail])

  // Keyboard nav: j/k move down/up, r focuses composer.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        return
      }
      if (e.key === 'j' && idxOfSelected < visibleThreads.length - 1) {
        setSelectedId(visibleThreads[idxOfSelected + 1].id)
      } else if (e.key === 'k' && idxOfSelected > 0) {
        setSelectedId(visibleThreads[idxOfSelected - 1].id)
      } else if (e.key === 'r') {
        const ta = document.querySelector<HTMLTextAreaElement>(
          'textarea[data-role="comms-composer"]',
        )
        ta?.focus()
        e.preventDefault()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [idxOfSelected, visibleThreads])

  const segmentTitle = segment === 'sales' ? 'Sales' : 'Service'

  return (
    <div className="grid h-full max-h-[calc(100dvh-220px)] grid-cols-1 gap-3 text-slate-900 lg:grid-cols-[120px_320px_1fr_280px]">
      {/* SEGMENT SWITCHER (Sales | Service) — req #1 isolation entry point */}
      <aside className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-slate-50 p-2">
        {(['sales', 'service'] as const).map((s) => {
          const on = segment === s
          return (
            <button
              key={s}
              type="button"
              onClick={() => switchSegment(s)}
              data-role="segment"
              data-segment={s}
              aria-pressed={on}
              className={
                'rounded-md px-2 py-1.5 text-left text-sm font-medium capitalize transition-colors ' +
                (on
                  ? 'text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')
              }
              style={on ? { background: ACTIVE } : undefined}
            >
              {s}
            </button>
          )
        })}
        <div className="mt-2 text-[10px] leading-snug text-slate-400">
          j / k to move · r to reply
        </div>
      </aside>

      {/* THREAD LIST + filters (channel + agent) */}
      <section
        ref={listRef}
        className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white"
      >
        {/* Channel filter chips (req #3) */}
        <div
          className="flex shrink-0 flex-wrap gap-1 border-b border-slate-200 p-1.5"
          data-role="comms-channel-filter"
        >
          {CHANNEL_FILTERS.map((f) => {
            const on = channelFilter === f.key
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setChannelFilter(f.key)}
                className={
                  'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ' +
                  (on
                    ? 'text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
                }
                style={on ? { background: PRIMARY } : undefined}
              >
                {f.label}
              </button>
            )
          })}
        </div>

        {/* Agent filter (req #3) — derived from this segment's assigned agents */}
        <div
          className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-2 py-1.5"
          data-role="comms-agent-filter"
        >
          <span className="text-[11px] text-slate-500">Agent</span>
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-700"
          >
            <option value="all">All agents</option>
            {agentOptions.map((a) => (
              <option key={a} value={a}>
                {agentLabel(a)}
              </option>
            ))}
            <option value="__unassigned">Unassigned</option>
          </select>
        </div>

        <div className="flex-1 overflow-y-auto">
          {visibleThreads.length === 0 ? (
            <div className="p-4 text-xs text-slate-500">
              No conversations in {segmentTitle} yet.
            </div>
          ) : (
            <ul>
              {visibleThreads.map((t) => {
                const active = t.id === selectedId
                const kind = channelKind(t.channel)
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className={
                        'w-full border-b border-slate-100 p-3 text-left text-xs transition-colors ' +
                        (active
                          ? 'bg-blue-50'
                          : 'hover:bg-slate-50')
                      }
                      style={
                        active
                          ? { boxShadow: `inset 3px 0 0 ${ACTIVE}` }
                          : undefined
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-800">
                          {CHANNEL_GLYPH[kind]} {t.contact_handle}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {timeShort(t.updated_at)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span
                          data-role="channel-chip"
                          data-channel-kind={kind}
                          className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500"
                        >
                          {CHANNEL_LABEL[kind]}
                        </span>
                        {t.assigned_agent_id && (
                          <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[9px] font-medium text-violet-700">
                            {agentLabel(t.assigned_agent_id)}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 truncate text-[11px] text-slate-500">
                        {t.last_message_preview}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      {/* CONVERSATION */}
      <section className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3">
        {detail ? (
          <>
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-2">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  {activeContact?.display_name ?? detail.contact_handle}
                </div>
                <div className="text-xs text-slate-500">
                  {CHANNEL_GLYPH[channelKind(detail.channel)]}{' '}
                  {channelLabel(detail.channel)} · {segmentTitle}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Who-is-handling badge (req #6): rep vs AI agent */}
                <span
                  data-role="handling-badge"
                  data-handler={detail.human_assigned ? 'human' : 'agent'}
                  className={
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ' +
                    (detail.human_assigned
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-blue-100 text-blue-700')
                  }
                >
                  {detail.human_assigned
                    ? 'You are handling'
                    : detail.assigned_agent_id
                      ? agentLabel(detail.assigned_agent_id)
                      : 'AI agent'}
                </span>
                <span
                  className={
                    'rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ' +
                    (detail.status === 'open'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-500')
                  }
                >
                  {detail.status === 'open'
                    ? 'Open'
                    : detail.status === 'snoozed'
                      ? 'Snoozed'
                      : 'Closed'}
                </span>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto">
              {visibleMessages.length === 0 ? (
                <div className="m-auto p-6 text-center text-xs text-slate-400">
                  No messages in this conversation yet.
                </div>
              ) : (
                <ul className="flex flex-col gap-3 py-1">
                  {visibleMessages.map((m) => {
                    const inbound = m.direction === 'inbound'
                    return (
                      <li
                        key={m.id}
                        data-role="message"
                        data-direction={m.direction}
                        className={
                          'flex flex-col ' +
                          (inbound ? 'items-start' : 'items-end')
                        }
                      >
                        {/* Direction label (req #5) */}
                        <span
                          className={
                            'mb-0.5 text-[9px] font-semibold uppercase tracking-wide ' +
                            (inbound ? 'text-slate-400' : 'text-blue-500')
                          }
                        >
                          {inbound ? '↙ Received' : 'Sent ↗'}
                        </span>
                        <div
                          className={
                            'max-w-[80%] rounded-2xl px-3 py-2 text-sm ' +
                            (inbound
                              ? 'rounded-tl-sm bg-slate-100 text-slate-800'
                              : 'rounded-tr-sm bg-blue-500 text-white')
                          }
                        >
                          <div className="whitespace-pre-wrap">{m.content}</div>
                        </div>
                        <div
                          className={
                            'mt-0.5 text-[10px] text-slate-400 ' +
                            (inbound ? 'text-left' : 'text-right')
                          }
                        >
                          {inbound
                            ? activeContact?.display_name ?? detail.contact_handle
                            : m.role === 'assistant'
                              ? detail.assigned_agent_id
                                ? agentLabel(detail.assigned_agent_id)
                                : 'AI agent'
                              : 'You'}{' '}
                          · {channelLabel(m.channel)} · {timeShort(m.created_at)}
                        </div>
                      </li>
                    )
                  })}
                  {agentTyping?.threadId === detail.id && (
                    <li className="self-start rounded-2xl rounded-tl-sm bg-slate-100 px-3 py-2 text-xs text-slate-500">
                      {agentLabel(agentTyping.agentId)} is typing…
                    </li>
                  )}
                </ul>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                void send()
              }}
              className="flex flex-col gap-2 border-t border-slate-200 pt-2"
            >
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">Reply via</span>
                <select
                  value={composerChannel}
                  onChange={(e) => setComposerChannel(e.target.value)}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                >
                  {Array.from(
                    new Set([detail.channel, 'chat', 'email', 'sms']),
                  ).map((c) => (
                    <option key={c} value={c}>
                      {channelLabel(c)}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                value={draft}
                data-role="comms-composer"
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                placeholder="Type your reply…"
                disabled={busy}
                className="resize-none rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={busy || !draft.trim()}
                  className="rounded-md px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: PRIMARY }}
                >
                  {busy ? 'Sending…' : 'Send'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="m-auto text-center text-xs text-slate-400">
            {visibleThreads.length === 0
              ? `No conversations in ${segmentTitle} yet.`
              : 'Select a conversation to view it.'}
          </div>
        )}
      </section>

      {/* CUSTOMER INFO + HANDOFF (take-over) */}
      <aside
        data-role="customer-info-panel"
        className="flex flex-col gap-3 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3"
      >
        {detail ? (
          <>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Customer
            </div>
            <div className="text-sm font-semibold text-slate-900">
              {activeContact?.display_name ?? detail.contact_handle}
            </div>
            <dl className="flex flex-col gap-1 text-xs">
              {activeContact?.identifiers.email && (
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-400">Email</dt>
                  <dd className="truncate text-right text-slate-700">
                    {activeContact.identifiers.email}
                  </dd>
                </div>
              )}
              {(activeContact?.identifiers.sms ||
                activeContact?.identifiers.textmagic) && (
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-400">Phone</dt>
                  <dd className="truncate text-right text-slate-700">
                    {activeContact.identifiers.sms ??
                      activeContact.identifiers.textmagic}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <dt className="text-slate-400">Contact</dt>
                <dd className="truncate text-right text-slate-700">
                  {detail.contact_handle}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-400">Type</dt>
                <dd className="text-right text-slate-700">{segmentTitle}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-400">Channel</dt>
                <dd className="text-right text-slate-700">
                  {channelLabel(detail.channel)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-400">Status</dt>
                <dd className="text-right capitalize text-slate-700">
                  {detail.status}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-400">Handled by</dt>
                <dd className="text-right font-medium text-slate-800">
                  {detail.human_assigned
                    ? 'You'
                    : detail.assigned_agent_id
                      ? agentLabel(detail.assigned_agent_id)
                      : 'AI agent'}
                </dd>
              </div>
            </dl>

            {/* HANDOFF control (req #6) */}
            <div className="mt-auto flex flex-col gap-2 border-t border-slate-200 pt-3">
              {detail.human_assigned ? (
                <button
                  type="button"
                  data-role="hand-back"
                  disabled={assignBusy}
                  onClick={() => void setTakeOver('hand_back')}
                  className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                >
                  {assignBusy ? 'Working…' : 'Hand back to AI agent'}
                </button>
              ) : (
                <button
                  type="button"
                  data-role="take-over"
                  disabled={assignBusy}
                  onClick={() => void setTakeOver('take_over')}
                  className="rounded-md px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  style={{ background: ACTIVE }}
                >
                  {assignBusy ? 'Working…' : 'Take over'}
                </button>
              )}
              <p className="text-[10px] leading-snug text-slate-400">
                {detail.human_assigned
                  ? 'You are handling this conversation. The AI agent is paused until you hand it back.'
                  : 'The AI agent may auto-reply. Take over to pause it and reply yourself.'}
              </p>
            </div>
          </>
        ) : (
          <div className="m-auto text-center text-xs text-slate-400">
            Select a conversation to see customer details.
          </div>
        )}
      </aside>
    </div>
  )
}

function timeShort(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) {
    return d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
