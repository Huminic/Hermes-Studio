/**
 * Messaging hub event bus — per-profile SSE fan-out.
 *
 * AC.5.5 — `/api/messaging/stream?profile=X` listens here. Adapters and the
 * Studio chat endpoint publish thread_created / message_appended /
 * thread_status_changed events.
 *
 * Survives a single-process restart but is process-local (no Redis). Each
 * profile gets its own subscriber set so the SSE stream filters cheaply.
 */

export type MessagingEvent = {
  type:
    | 'thread_created'
    | 'message_appended'
    | 'thread_status_changed'
    | 'agent_replying'
    | 'agent_reply_sent'
    | 'campaign_progress'
  thread_id?: string
  message_id?: string
  domain?: string
  channel?: string
  status?: string
  agent_id?: string
  campaign_id?: string
  payload?: Record<string, unknown>
  ts?: number
}

type Listener = (event: MessagingEvent) => void

const _listeners = new Map<string, Set<Listener>>()

export function subscribeMessaging(
  profile: string,
  listener: Listener,
): () => void {
  let set = _listeners.get(profile)
  if (!set) {
    set = new Set()
    _listeners.set(profile, set)
  }
  set.add(listener)
  return () => {
    const s = _listeners.get(profile)
    if (s) {
      s.delete(listener)
      if (s.size === 0) _listeners.delete(profile)
    }
  }
}

export function publishMessagingEvent(
  profile: string,
  event: MessagingEvent,
): void {
  const fullEvent: MessagingEvent = { ...event, ts: event.ts ?? Date.now() }
  const set = _listeners.get(profile)
  if (!set) return
  for (const listener of set) {
    try {
      listener(fullEvent)
    } catch {
      // ignore listener errors so one bad subscriber doesn't crash the publish
    }
  }
}

export function _resetMessagingBus(): void {
  _listeners.clear()
}
