/**
 * customer-console.comms — the customer "Teambox" unified inbox.
 *
 * One unified inbox across every channel: top channel tabs (All, Text, Email,
 * Call, Video, Chat) with live counts → filtered/sorted thread list → thread
 * detail with inbound/outbound direction → reply composer (reply-capable
 * channels only) + take-over (human handoff). SSE subscribed for live updates.
 *
 * Hard rules enforced here:
 *  - The customer never sees backend internals: system/notification annotations
 *    (env-var names, "unconfigured token", routing strings) are not rendered in
 *    the conversation. Only real customer + agent/rep messages appear.
 *  - Channels and handlers are shown with plain-language labels (Text, Email,
 *    Call, Video — never "vapi"/"tavus"/"sms"/"domain:") and opaque ids/slugs
 *    (e.g. "video-cecd7aaf287c2435") never reach the screen.
 *  - Replying takes the conversation over automatically so the AI agent and the
 *    human rep never answer at the same time.
 *  - Calls and Videos are completed real-time sessions: they are NOT
 *    reply-capable, so no composer is shown — only an honest note.
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
  // Dealer-safe sender classification computed server-side (raw metadata is
  // dropped before it reaches the client). 'human' = a rep's manual reply.
  sender?: 'contact' | 'ai' | 'human' | 'campaign'
  metadata?: Record<string, unknown>
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

// Reply capability (req: completed Call/Video are not reply-capable). A phone
// call and a video session are finished real-time interactions — there is no
// text "reply" to send back into them — so Teambox offers no composer for them.
function isReplyCapable(channel: string): boolean {
  const kind = channelKind(channel)
  return kind === 'text' || kind === 'email' || kind === 'chat'
}

// Top channel tabs: "All" plus one per friendly kind.
const CHANNEL_TABS: Array<{ key: 'all' | ChannelKind; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'text', label: 'Text' },
  { key: 'email', label: 'Email' },
  { key: 'call', label: 'Call' },
  { key: 'video', label: 'Video' },
  { key: 'chat', label: 'Chat' },
]

// Display name for an agent id. Keeps it human; falls back to a title-cased id.
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

// Opaque machine slugs that must never reach the screen as a title, e.g.
// "video-cecd7aaf287c2435", "call_9f2c…", "conv-1a2b3c4d", bare uuids/hex.
function isOpaqueSlug(value: string | null | undefined): boolean {
  const s = String(value ?? '').trim()
  if (!s) return false
  if (/^(video|call|voice|conv|conversation|session|vapi|tavus|thread)[-_:]?[a-f0-9]{6,}$/i.test(s)) {
    return true
  }
  // bare hex / uuid-ish blobs with no spaces
  if (!/\s/.test(s) && /^[a-f0-9]{8,}$/i.test(s.replace(/-/g, ''))) return true
  return false
}

// Machine-subject prefixes (channel/vendor/source tokens). A subject like
// "vapi call · c303d993" or "form · serra-honda-contact" is an internal label,
// not a human title — we never show it (and never the vendor name "vapi"/etc).
const MACHINE_PREFIX =
  /^(vapi|tavus|voice|call|video|sms|text|textmagic|email|email-adf|chat|form|campaign|lead|adf|conv|conversation|session|thread)\b/i

function friendlyThreadTitle(
  thread: Pick<
    ThreadSummary,
    'subject' | 'channel' | 'contact_handle' | 'assigned_agent_id'
  >,
): string {
  const subject = String(thread.subject ?? '').trim()
  if (isOpaqueChatHandle(thread.contact_handle) || /^chat[:·\s-]/i.test(subject)) {
    return thread.assigned_agent_id
      ? `Website chat - ${agentLabel(thread.assigned_agent_id)}`
      : 'Website chat'
  }
  if (/^campaign\b/i.test(subject)) return 'Campaign conversation'
  if (/^form\b/i.test(subject)) return 'Website form'
  // A "prefix · identifier" subject whose prefix is a machine/vendor token, a
  // bare opaque slug, or an empty subject → fall back to a clean channel title.
  const isMachineSubject =
    !subject ||
    isOpaqueSlug(subject) ||
    (/[·:]/.test(subject) && MACHINE_PREFIX.test(subject))
  if (isMachineSubject) return `${channelLabel(thread.channel)} conversation`
  return subject
}

function friendlyContactLabel(
  thread: Pick<ThreadSummary, 'contact_handle'>,
  contact?: ContactSummary | null,
): string {
  if (contact?.display_name) return contact.display_name
  if (isOpaqueChatHandle(thread.contact_handle)) return 'Website visitor'
  if (isOpaqueSlug(thread.contact_handle)) return 'Customer'
  return thread.contact_handle
}

function statusLabel(status: ThreadSummary['status']): string {
  return status === 'open' ? 'Open' : status === 'snoozed' ? 'Snoozed' : 'Closed'
}

// Who sent an outbound message. Keyed off the dealer-safe `sender` enum the
// server computes (the thread's assigned agent can be null even on AI threads,
// so author alone is not enough). This guarantees an AI/automated message is
// never mis-attributed to the rep, and a rep's reply never to the AI agent.
function outboundSender(m: ThreadMessage, agentId: string | null): string {
  if (m.sender === 'human') return 'You'
  if (m.sender === 'campaign') return 'Automated'
  if (m.sender === 'ai') {
    if (m.author && m.author !== 'customer-admin') return agentLabel(m.author)
    return agentId ? agentLabel(agentId) : 'AI agent'
  }
  // Fallback for any message lacking the sender enum: attribute by author.
  if (agentId && (m.author === agentId || m.author === agentLabel(agentId))) {
    return agentLabel(agentId)
  }
  return 'You'
}

// WF-018: workspace gunmetal theme.
const PRIMARY = '#2f3b4d'
const ACTIVE = PRIMARY

export function CustomerCommsRenderer(props: {
  profile: string
  config: StudioConfig
}) {
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

  const loadThreads = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/messaging/threads?profile=${encodeURIComponent(
          props.profile,
        )}&limit=100`,
        { credentials: 'include' },
      )
      const j = (await res.json().catch(() => ({}))) as ListResponse
      if (!res.ok || !j.ok) return
      setThreads(j.threads)
    } catch {
      // ignore
    }
  }, [props.profile])

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

  // Take-over / hand-back. Assigning the thread to the rep pauses the autonomous
  // agent: the reply pipeline checks isHumanAssigned(profile,thread) both before
  // generating AND before sending, and the assign endpoint sets that exact
  // thread_takeover row. Handing back clears it and resumes the agent. Returns
  // whether the new state is human-assigned so callers (auto-takeover on reply)
  // can chain a send.
  const assign = useCallback(
    async (action: 'take_over' | 'hand_back'): Promise<boolean> => {
      if (!detail) return false
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
          const nowAssigned = !!j.human_assigned
          setDetail((d) =>
            d && d.id === detail.id ? { ...d, human_assigned: nowAssigned } : d,
          )
          return nowAssigned
        }
      } catch {
        // ignore
      }
      return false
    },
    [detail, props.profile],
  )

  const toggleTakeOver = useCallback(
    async (action: 'take_over' | 'hand_back') => {
      setAssignBusy(true)
      try {
        await assign(action)
      } finally {
        setAssignBusy(false)
      }
    },
    [assign],
  )

  useEffect(() => {
    void loadThreads()
    void loadContacts()
  }, [loadThreads, loadContacts])

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
          void loadThreads()
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

  // Send a manual reply. Replying auto-takes-over: if the AI agent still owns
  // the thread we assign it to the rep first (server-side), THEN send — so the
  // backend's isHumanAssigned gate is satisfied truthfully and the agent pauses.
  const send = useCallback(async () => {
    if (!detail || !draft.trim()) return
    if (!isReplyCapable(detail.channel)) return
    setBusy(true)
    try {
      if (!detail.human_assigned) {
        const ok = await assign('take_over')
        if (!ok) return
      }
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
  }, [assign, composerChannel, detail, draft, loadDetail, props.profile])

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
        await loadThreads()
      }
    } finally {
      setDeleteBusy(false)
    }
  }, [deleteBusy, detail, loadThreads, props.profile])

  // Per-kind counts for the top tabs (computed from the full inbox).
  const channelCounts = useMemo(() => {
    const counts: Record<'all' | ChannelKind, number> = {
      all: threads.length,
      text: 0,
      email: 0,
      call: 0,
      video: 0,
      chat: 0,
      other: 0,
    }
    for (const t of threads) counts[channelKind(t.channel)] += 1
    return counts
  }, [threads])

  // Agent options for the by-agent filter: derived from assigned agents present.
  const agentOptions = useMemo(() => {
    const ids = new Set<string>()
    for (const t of threads) {
      if (t.assigned_agent_id) ids.add(t.assigned_agent_id)
    }
    return Array.from(ids).sort()
  }, [threads])

  // Apply channel + agent filters and date sorting.
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

  // Keep selection valid as filters change: select the first visible thread;
  // clear when none match.
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

  // Customer-info source: the contact behind the selected thread.
  const activeContact = useMemo(() => {
    if (!detail) return null
    return (
      contacts.find((c) =>
        Object.values(c.identifiers).includes(detail.contact_handle),
      ) ?? null
    )
  }, [contacts, detail])

  // Conversation messages: ONLY real customer + agent/rep messages. System /
  // notification annotations are internal and never shown to the customer.
  const visibleMessages = useMemo(() => {
    if (!detail) return []
    return detail.messages.filter((m) => m.role !== 'system')
  }, [detail])

  const replyCapable = detail ? isReplyCapable(detail.channel) : false

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
        if (ta) e.preventDefault()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [idxOfSelected, visibleThreads])

  // Send-via options for a reply-capable thread: the thread's own channel plus
  // the other reply-capable channels, friendly-labelled.
  const composerChannelOptions = useMemo(() => {
    if (!detail) return [] as Array<string>
    return Array.from(new Set([detail.channel, 'sms', 'email', 'chat'])).filter(
      (c) => isReplyCapable(c),
    )
  }, [detail])

  return (
    <div className="flex h-full max-h-[calc(100dvh-220px)] flex-col gap-3 text-slate-900">
      {/* TOP: channel tabs with live counts (req: message-type filters as tabs) */}
      <section className="rounded-lg border border-slate-200 bg-white p-1.5">
        <div
          className="flex flex-wrap gap-1"
          role="tablist"
          aria-label="Filter conversations by channel"
          data-role="comms-channel-tabs"
        >
          {CHANNEL_TABS.map((tab) => {
            const on = channelFilter === tab.key
            const count = channelCounts[tab.key]
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setChannelFilter(tab.key)}
                data-channel-tab={tab.key}
                className={
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ' +
                  (on
                    ? 'text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100')
                }
                style={on ? { background: ACTIVE } : undefined}
              >
                <span>{tab.label}</span>
                <span
                  data-role="tab-count"
                  className={
                    'rounded-full px-1.5 text-[11px] font-semibold tabular-nums ' +
                    (on ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500')
                  }
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
        {/* THREAD LIST + agent/sort filters */}
        <section
          ref={listRef}
          className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white"
        >
          <div
            className="grid shrink-0 gap-2 border-b border-slate-200 px-2 py-1.5 sm:grid-cols-2"
            data-role="comms-list-filters"
          >
            <label className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500">Agent</span>
              <select
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-700 focus:border-slate-400 focus:outline-none"
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
            <label
              className="flex items-center gap-2 justify-self-end"
              data-role="comms-sort"
            >
              <span className="text-[11px] text-slate-500">Sort</span>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-700 focus:border-slate-400 focus:outline-none"
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
                No conversations here yet.
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
                          (active ? 'bg-slate-50' : 'hover:bg-slate-50')
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
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">
                    {friendlyThreadTitle(detail)}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {CHANNEL_GLYPH[channelKind(detail.channel)]}{' '}
                    {channelLabel(detail.channel)} ·{' '}
                    {friendlyContactLabel(detail, activeContact)}
                  </div>
                  {/* STATUS BADGES (non-interactive): who is handling + state */}
                  <div
                    className="mt-2 flex flex-wrap items-center gap-1.5"
                    data-role="conversation-status"
                  >
                    <span
                      data-role="handling-badge"
                      data-handler={detail.human_assigned ? 'human' : 'agent'}
                      className={
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ' +
                        (detail.human_assigned
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700')
                      }
                    >
                      {detail.human_assigned
                        ? '● You are handling'
                        : detail.assigned_agent_id
                          ? `🤖 ${agentLabel(detail.assigned_agent_id)}`
                          : '🤖 AI agent'}
                    </span>
                    <span
                      data-role="status-badge"
                      data-status={detail.status}
                      className={
                        'rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ' +
                        (detail.status === 'open'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-500')
                      }
                    >
                      {statusLabel(detail.status)}
                    </span>
                  </div>
                </div>

                {/* ACTIONS (buttons): take over / hand back, delete */}
                <div
                  className="flex shrink-0 items-center gap-2"
                  data-role="conversation-actions"
                >
                  {detail.human_assigned ? (
                    <button
                      type="button"
                      data-role="hand-back"
                      disabled={assignBusy}
                      onClick={() => void toggleTakeOver('hand_back')}
                      className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {assignBusy ? 'Working…' : 'Hand back to AI'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      data-role="take-over"
                      disabled={assignBusy}
                      onClick={() => void toggleTakeOver('take_over')}
                      className="rounded-md px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
                      style={{ background: ACTIVE }}
                    >
                      {assignBusy ? 'Working…' : 'Take over'}
                    </button>
                  )}
                  <button
                    type="button"
                    data-role="delete-conversation"
                    disabled={deleteBusy}
                    onClick={() => void deleteConversation()}
                    className="rounded-md border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  >
                    {deleteBusy ? 'Deleting…' : 'Delete'}
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
                            style={
                              !inbound ? { background: PRIMARY } : undefined
                            }
                          >
                            <div className="whitespace-pre-wrap">
                              {m.content}
                            </div>
                          </div>
                          <div
                            className={
                              'mt-0.5 text-[10px] text-slate-400 ' +
                              (inbound ? 'text-left' : 'text-right')
                            }
                          >
                            {inbound
                              ? friendlyContactLabel(detail, activeContact)
                              : outboundSender(m, detail.assigned_agent_id)}{' '}
                            · {channelLabel(m.channel)} ·{' '}
                            {timeShort(m.created_at)}
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

              {replyCapable ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void send()
                  }}
                  className="flex flex-col gap-2 border-t border-slate-200 pt-2"
                  data-role="comms-reply"
                >
                  <p className="text-[11px] leading-relaxed text-slate-500">
                    {detail.human_assigned
                      ? 'You’ve taken over — the AI agent is paused while you reply.'
                      : 'Replying takes over this conversation, so you and the AI agent don’t answer at the same time.'}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-slate-500">Send via</span>
                    <select
                      value={composerChannel}
                      onChange={(e) => setComposerChannel(e.target.value)}
                      disabled={busy}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-slate-400 focus:outline-none"
                    >
                      {composerChannelOptions.map((c) => (
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
                    className="resize-none rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={busy || !draft.trim()}
                      className="rounded-md px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                      style={{ background: PRIMARY }}
                    >
                      {busy ? 'Sending…' : 'Send reply'}
                    </button>
                  </div>
                </form>
              ) : (
                <div
                  className="flex items-start gap-2 border-t border-slate-200 pt-3 text-xs text-slate-500"
                  data-role="comms-noreply"
                >
                  <span aria-hidden="true">
                    {CHANNEL_GLYPH[channelKind(detail.channel)]}
                  </span>
                  <p className="leading-relaxed">
                    This is a completed{' '}
                    <span className="font-medium text-slate-700">
                      {channelLabel(detail.channel)}
                    </span>{' '}
                    session. {channelLabel(detail.channel)}s happen in real time,
                    so there’s no reply to send from Teambox — the transcript
                    above is the full record.
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="m-auto text-center text-xs text-slate-400">
              {visibleThreads.length === 0
                ? 'No conversations here yet.'
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
