/**
 * Chat session list for the Workspace Chat page slide-out.
 *
 * Reuses the existing messaging-hub thread model (domain:chat, channel:chat) —
 * the SAME threads /api/customer/chat already persists, so existing sessions
 * surface here with no migration and Teambox stays in sync. We only READ here;
 * thread creation/append stay in /api/customer/chat.
 *
 * A session is surfaced only when it has at least one message (the "empty
 * sessions are not saved" rule is enforced upstream by creating the thread on
 * first send, but we also filter defensively here).
 */

import { getThread, listThreads } from './messaging-hub-store'

export type ChatSessionTurn = {
  role: 'user' | 'assistant'
  content: string
  ts: number
}

export type ChatSessionDetail = {
  id: string
  agent_id: string | null
  turns: Array<ChatSessionTurn>
}

export type ChatSessionSummary = {
  id: string
  agent_id: string | null
  title: string
  preview: string
  message_count: number
  created_at: number
  updated_at: number
}

function previewOf(content: string): string {
  const oneLine = content.replace(/\s+/g, ' ').trim()
  return oneLine.length > 80 ? oneLine.slice(0, 77) + '…' : oneLine
}

/**
 * Past chat sessions for a profile, newest first. When `agentId` is given,
 * only sessions assigned to that agent are returned (the slide-out is
 * per-selected-agent).
 */
export function listChatSessions(
  profile: string,
  opts: { agentId?: string; limit?: number } = {},
): Array<ChatSessionSummary> {
  const threads = listThreads({
    profile,
    domain: 'chat',
    channel: 'chat',
    limit: opts.limit ?? 100,
  })
  const out: Array<ChatSessionSummary> = []
  for (const t of threads) {
    if (opts.agentId && t.assigned_agent_id !== opts.agentId) continue
    if (!t.messages || t.messages.length === 0) continue
    const last = t.messages[t.messages.length - 1]
    const firstUser = t.messages.find((m) => m.role === 'user')
    out.push({
      id: t.id,
      agent_id: t.assigned_agent_id,
      // Prefer the first user message as a human title; fall back to subject.
      title: firstUser ? previewOf(firstUser.content) : t.subject,
      preview: last ? previewOf(last.content) : '',
      message_count: t.messages.length,
      created_at: t.created_at,
      updated_at: t.updated_at,
    })
  }
  return out
}

/**
 * Full turns for one chat session (for opening it in the Chat page and
 * scrolling to the last message). Returns null if the thread is missing or not
 * a chat thread for this profile.
 */
export function getChatSession(
  profile: string,
  sessionId: string,
): ChatSessionDetail | null {
  const t = getThread(profile, sessionId)
  if (!t || t.profile !== profile || t.domain !== 'chat') return null
  const turns: Array<ChatSessionTurn> = t.messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
      ts: m.created_at,
    }))
  return { id: t.id, agent_id: t.assigned_agent_id, turns }
}
