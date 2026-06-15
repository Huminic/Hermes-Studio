/**
 * customer-console.comms — the customer "Teambox" unified inbox (SERRA-UI-8).
 *
 * Top segment switcher (Sales | Service) → filtered/sorted thread list (by
 * channel + by agent) → thread detail with inbound/outbound direction and a
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
type SortOrder = 'newest' | 'oldest'

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

function isOpaqueChatHandle(value: string | null | undefined): boolean {
  return /^chat:[a-f0-9-]{8,}/i.test(String(value ?? '').trim())
}

function friendlyThreadTitle(thread: Pick<ThreadSummary, 'subject' | 'channel' | 'contact_handle' | 'assigned_agent_id'>): string {
  const subject = String(thread.subject ?? '').trim()
  if (isOpaqueChatHandle(thread.contact_handle) || /^chat[:·]/i.test(subject)) {
    return thread.assigned_agent_id
      ? `Website chat - ${agentLabel(thread.assigned_agent_id)}`
      : 'Website chat'
  }
  if (/^campaign\s*·/i.test(subject)) return 'Campaign conversation'
  if (subject) return subject
  return `${channelLabel(thread.channel)} conversation`
}

function friendlyContactLabel(
  thread: Pick<ThreadSummary, 'contact_handle'>,
  contact?: ContactSummary | null,
): string {
  if (contact?.display_name) return contact.display_name
  if (isOpaqueChatHandle(thread.contact_handle)) return 'Website visitor'
  return thread.contact_handle
}

// WF-018: workspace gunmetal theme.
const PRIMARY = '#2f3b4d'
const ACTIVE = PRIMARY

export function CustomerCommsRenderer(props: {
  profile: string
  config: StudioConfig
}) {
  const [segment, setSegment] = useState<'sales' | 'service'>('sales')
  const [channelFilter, setChannelFilter] = useState<'all' | ChannelKind>('all')
  const [agentFilter, setAgentFilter] = useState<string>('all')
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest')
  const [threads, setThreads] = useState<Array<ThreadSummary>>([])
  const [contacts, setContacts] = useState<Array<ContactSummary>>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ThreadDetail | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [assignBusy, setAssignBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
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

  const deleteConversation = useCallback(async () => {
    if (!detail || deleteBusy) return
    if (
      !window.confirm(
        `Delete ${friendlyThreadTitle(detail)}? This removes it from Teambox.`,
      )
    ) {
      return
    }
    setDeleteBusy(true)
    try {
      const res = await fetch(
        `/api/messaging/threads/${encodeURIComponent(detail.id)}`,
        {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile: props.profile }),
        },
      )
      if (res.ok) {
        setSelectedId(null)
        setDetail(null)
        await loadThreads(segmentRef.current)
      }
    } finally {
      setDeleteBusy(false)
    }
  }, [deleteBusy, detail, loadThreads, props.profile])

  // Agent options for the by-agent filter (req #3): derived from the assigned
  // agents present on this segment's threads.
  const agentOptions = useMemo(() => {
    const ids = new Set<string>()
    for (const t of threads) {
      if (t.assigned_agent_id) ids.add(t.assigned_agent_id)
    }
    return Array.from(ids).sort()
  }, [threads])

  // Apply channel + agent filters and date sorting on top of the segment-scoped thread list.
  const visibleThreads = useMemo(() => {
    return threads
      .filter((t) => {
        if (
          channelFilter !== 'all' &&
          channelKind(t.channel) !== channelFilter
        ) {
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
      .sort((a, b) =>
        sortOrder === 'newest'
          ? b.updated_at - a.updated_at
          : a.updated_at - b.updated_at,
      )
  }, [threads, channelFilter, agentFilter, sortOrder])

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
    <div className="flex h-full max-h-[calc(100dvh-220px)] flex-col gap-3 text-slate-900">
      {/* SEGMENT SWITCHER (Sales | Service) — req #1 isolation entry point */}
      <section className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap gap-2">
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
                'min-w-28 rounded-md border px-4 py-2 text-center text-sm font-semibold capitalize transition-colors ' +
                (on
                  ? 'border-transparent text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')
              }
              style={on ? { background: ACTIVE } : undefined}
            >
              {s}
            </button>
          )
        })}
        </div>
      </section>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">

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

        {/* Agent/date filters (req #3 + WF-018 sort affordance) */}
        <div
          className="grid shrink-0 gap-2 border-b border-slate-200 px-2 py-1.5 sm:grid-cols-[minmax(0,1fr)_auto]"
          data-role="comms-agent-filter"
        >
          <label className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">Agent</span>
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-700"
            >
              <option value="all">All agents</option>
              {agentOptions.map((a) => (
                <option key={a} value={a}>
                  {agentLabel(a)}
                </option>
              ))}
              <option value="__unassigned">Unassigned</option>
            </select>
          </label>
          <label className="flex items-center gap-2" data-role="comms-sort">
            <span className="text-[11px] text-slate-500">Sort</span>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as SortOrder)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-700"
              aria-label="Sort conversations by date"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
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
                          ? 'bg-slate-50'
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
                          {CHANNEL_GLYPH[kind]} {friendlyThreadTitle(t)}
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
                          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-700">
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
                  {friendlyThreadTitle(detail)}
                </div>
                <div className="text-xs text-slate-500">
                  {CHANNEL_GLYPH[channelKind(detail.channel)]}{' '}
                  {channelLabel(detail.channel)} · {segmentTitle} ·{' '}
                  {friendlyContactLabel(detail, activeContact)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {detail.human_assigned ? (
                  <button
                    type="button"
                    data-role="hand-back"
                    disabled={assignBusy}
                    onClick={() => void setTakeOver('hand_back')}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {assignBusy ? 'Working' : 'Hand back'}
                  </button>
                ) : (
                  <button
                    type="button"
                    data-role="take-over"
                    disabled={assignBusy}
                    onClick={() => void setTakeOver('take_over')}
                    className="rounded-md px-2 py-1 text-[10px] font-semibold uppercase text-white hover:opacity-90 disabled:opacity-50"
                    style={{ background: ACTIVE }}
                  >
                    {assignBusy ? 'Working' : 'Take over'}
                  </button>
                )}
                {/* Who-is-handling badge (req #6): rep vs AI agent */}
                <span
                  data-role="handling-badge"
                  data-handler={detail.human_assigned ? 'human' : 'agent'}
                  className={
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ' +
                    (detail.human_assigned
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-100 text-slate-700')
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
                <button
                  type="button"
                  data-role="delete-conversation"
                  disabled={deleteBusy}
                  onClick={() => void deleteConversation()}
                  className="rounded-md border border-rose-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                >
                  {deleteBusy ? 'Deleting' : 'Delete'}
                </button>
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
                            (inbound ? 'text-slate-400' : 'text-slate-500')
                          }
                        >
                          {inbound ? '↙ Received' : 'Sent ↗'}
                        </span>
                        <div
                          className={
                            'max-w-[80%] rounded-2xl px-3 py-2 text-sm ' +
                            (inbound
                              ? 'rounded-tl-sm bg-slate-100 text-slate-800'
                              : 'rounded-tr-sm text-white')
                          }
                          style={!inbound ? { background: PRIMARY } : undefined}
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
                            ? friendlyContactLabel(detail, activeContact)
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
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  {detail.human_assigned ? 'Manual reply' : 'Take over to reply manually'}
                </div>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  {detail.human_assigned
                    ? 'The AI agent is paused while you handle this conversation.'
                    : 'Manual replies are available after takeover so the AI agent does not respond at the same time.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-500">Send via</span>
                <select
                  value={composerChannel}
                  onChange={(e) => setComposerChannel(e.target.value)}
                  disabled={!detail.human_assigned || busy}
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
                placeholder={
                  detail.human_assigned
                    ? 'Type your reply…'
                    : 'Take over this conversation before replying manually.'
                }
                disabled={busy || !detail.human_assigned}
                className="resize-none rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={busy || !detail.human_assigned || !draft.trim()}
                  className="rounded-md px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: PRIMARY }}
                >
                  {busy ? 'Sending…' : 'Send manual reply'}
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

      </div>
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
