/**
 * customer-console.comms — Phase C.7 (AC.7.1–AC.7.7).
 *
 * Three-column inbox: segment switcher (Sales | Service) → thread list →
 * thread detail with composer. SSE subscribed for live updates.
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

type ThreadDetail = ThreadSummary & {
  messages: Array<{
    id: string
    direction: 'inbound' | 'outbound'
    role: 'user' | 'assistant' | 'system'
    channel: string
    content: string
    author: string
    created_at: number
    metadata: Record<string, unknown>
  }>
}

type ListResponse = { ok: boolean; threads: Array<ThreadSummary> }
type DetailResponse = { ok: boolean; thread: ThreadDetail }

const CHANNEL_GLYPH: Record<string, string> = {
  chat: '💬',
  sms: '📱',
  email: '✉️',
  'email-adf': '📨',
  voice: '☎️',
  phone: '☎️',
  video: '🎥',
  form: '📝',
  textmagic: '📱',
  vapi: '☎️',
  tavus: '🎥',
}

export function CustomerCommsRenderer(props: {
  profile: string
  config: StudioConfig
}) {
  const [segment, setSegment] = useState<'sales' | 'service'>('sales')
  const [threads, setThreads] = useState<Array<ThreadSummary>>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ThreadDetail | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [composerChannel, setComposerChannel] = useState<string>('chat')
  const [agentTyping, setAgentTyping] = useState<{
    threadId: string
    agentId: string
  } | null>(null)
  const accent = props.config.branding.accent_color ?? '#1e40af'
  const listRef = useRef<HTMLDivElement | null>(null)

  const loadThreads = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/messaging/threads?profile=${encodeURIComponent(
          props.profile,
        )}&domain=${segment}&limit=100`,
        { credentials: 'include' },
      )
      const j = (await res.json().catch(() => ({}))) as ListResponse
      if (!res.ok || !j.ok) return
      setThreads(j.threads)
      if (j.threads.length > 0 && !selectedId) {
        setSelectedId(j.threads[0].id)
      }
    } catch {
      // ignore
    }
  }, [props.profile, segment, selectedId])

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

  useEffect(() => {
    void loadThreads()
  }, [loadThreads, segment])

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId)
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

  const idxOfSelected = useMemo(
    () => threads.findIndex((t) => t.id === selectedId),
    [selectedId, threads],
  )

  // Keyboard nav: j/k move down/up, r focuses composer.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only when not typing in an input
      const target = e.target as HTMLElement | null
      if (
        target &&
        ['INPUT', 'TEXTAREA'].includes(target.tagName) &&
        target.tagName !== ''
      ) {
        return
      }
      if (e.key === 'j' && idxOfSelected < threads.length - 1) {
        setSelectedId(threads[idxOfSelected + 1].id)
      } else if (e.key === 'k' && idxOfSelected > 0) {
        setSelectedId(threads[idxOfSelected - 1].id)
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
  }, [idxOfSelected, threads])

  return (
    <div className="grid h-full max-h-[calc(100dvh-220px)] grid-cols-1 gap-3 lg:grid-cols-[120px_320px_1fr]">
      <aside className="flex flex-col gap-1 rounded border border-white/10 bg-black/10 p-2">
        {(['sales', 'service'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSegment(s)}
            className={
              'rounded px-2 py-1.5 text-left text-sm capitalize ' +
              (segment === s
                ? 'font-semibold'
                : 'opacity-70 hover:opacity-100')
            }
            style={
              segment === s
                ? { background: `${accent}33`, color: '#fff' }
                : undefined
            }
          >
            {s}
          </button>
        ))}
        <div className="mt-2 text-[10px] opacity-50">
          j/k move · r reply
        </div>
      </aside>

      <section
        ref={listRef}
        className="overflow-y-auto rounded border border-white/10 bg-black/10"
      >
        {threads.length === 0 ? (
          <div className="p-4 text-xs opacity-60">
            No {segment} threads yet.
          </div>
        ) : (
          <ul>
            {threads.map((t) => {
              const active = t.id === selectedId
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className={
                      'w-full border-b border-white/5 p-3 text-left text-xs ' +
                      (active ? 'bg-white/10 font-semibold' : 'hover:bg-white/5')
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        {CHANNEL_GLYPH[t.channel] ?? '·'} {t.contact_handle}
                      </span>
                      <span className="text-[10px] opacity-50">
                        {timeShort(t.updated_at)}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-[11px] opacity-70">
                      {t.last_message_preview}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded border border-white/10 bg-black/10 p-3">
        {detail ? (
          <>
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-2">
              <div>
                <div className="text-sm font-semibold">
                  {detail.contact_handle}
                </div>
                <div className="text-xs opacity-60">
                  {CHANNEL_GLYPH[detail.channel] ?? '·'} {detail.channel} ·{' '}
                  {detail.domain}
                  {detail.assigned_agent_id && (
                    <>
                      {' '}
                      · agent:{' '}
                      <span className="font-medium">
                        {detail.assigned_agent_id}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <span
                className={
                  'rounded px-2 py-0.5 text-[10px] uppercase ' +
                  (detail.status === 'open'
                    ? 'bg-emerald-500/20'
                    : 'bg-white/10')
                }
              >
                {detail.status}
              </span>
            </header>

            <div className="flex-1 overflow-y-auto">
              <ul className="flex flex-col gap-2">
                {detail.messages.map((m) => (
                  <li
                    key={m.id}
                    className={
                      'max-w-[80%] rounded-lg px-3 py-2 text-sm ' +
                      (m.direction === 'inbound'
                        ? 'mr-auto bg-white/10'
                        : 'ml-auto bg-emerald-500/10')
                    }
                  >
                    <div className="text-[10px] opacity-60">
                      {m.author} · {CHANNEL_GLYPH[m.channel] ?? ''}{' '}
                      {m.channel} · {timeShort(m.created_at)}
                    </div>
                    <div className="mt-1 whitespace-pre-wrap">{m.content}</div>
                    {m.metadata?.lead_meta != null && (
                      <details className="mt-1 text-[10px] opacity-70">
                        <summary>lead_meta</summary>
                        <pre className="overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(m.metadata.lead_meta, null, 2)}
                        </pre>
                      </details>
                    )}
                  </li>
                ))}
                {agentTyping?.threadId === detail.id && (
                  <li className="mr-auto rounded-lg bg-emerald-500/10 px-3 py-2 text-xs opacity-70">
                    {agentTyping.agentId} is typing…
                  </li>
                )}
              </ul>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                void send()
              }}
              className="flex flex-col gap-2 border-t border-white/10 pt-2"
            >
              <div className="flex items-center gap-2 text-xs">
                <span className="opacity-60">via</span>
                <select
                  value={composerChannel}
                  onChange={(e) => setComposerChannel(e.target.value)}
                  className="rounded border border-white/10 bg-black/30 px-2 py-1 text-xs"
                >
                  {Array.from(
                    new Set([detail.channel, 'chat', 'email', 'sms']),
                  ).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                value={draft}
                data-role="comms-composer"
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                placeholder="Reply…"
                disabled={busy}
                className="resize-none rounded border border-white/10 bg-black/30 px-2 py-1.5 text-sm"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={busy || !draft.trim()}
                  className="rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                  style={{ background: accent, color: '#fff' }}
                >
                  {busy ? '…' : 'Send'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="m-auto text-xs opacity-60">
            {threads.length === 0
              ? 'No threads in this segment yet.'
              : 'Pick a thread.'}
          </div>
        )}
      </section>
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
