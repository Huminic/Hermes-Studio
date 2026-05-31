/**
 * Chat and back-end interaction memorialization (SRS Tranche A.6).
 *
 * Persists every meaningful conversation into the Brain so a Semantic
 * Guardian or the Consultative Agent can later reconstruct what an
 * agent knew, what it tried to look up, what it surfaced, and what
 * the outcome was.
 *
 * Captures:
 *   - human ↔ agent chats (Studio chat surfaces, customer storefront chat)
 *   - agent ↔ back-end tool call records (paired with mcp-audit.log)
 *   - decision context bundles (linking retrieval snapshots to outputs)
 *
 * Writes go through the DSG gate so memorialization itself is governed.
 */

import { openBrain, now, uuid, jsonOrNull } from './brain-store'
import { dsgGate } from './dsg-gate'
import { recordAudit } from './metadata-substrate'

export type ChatChannel =
  | 'studio-chat'
  | 'storefront-chat'
  | 'mcp'
  | 'messaging-hub'
  | 'consultative'
  | 'system'

export type ChatRole = 'user' | 'assistant' | 'system' | 'tool'

export type ChatRecordInput = {
  profile: string
  channel: ChatChannel
  thread_id?: string | null
  participants: Array<string>
  role: ChatRole
  content: string
  metadata?: Record<string, unknown> | null
  source_refs?: Array<unknown> | null
  decision_context_id?: string | null
  actor?: string
}

export type ChatRecord = {
  id: string
  ts: number
  channel: ChatChannel
  thread_id: string | null
  participants: Array<string>
  role: ChatRole
  content: string
  metadata: Record<string, unknown> | null
  source_refs: Array<unknown> | null
  decision_context_id: string | null
}

export type RecordChatResult = {
  ok: boolean
  id?: string
  reason?: string
  rule?: string
  gate_event_id?: string
}

const APPEND_ONLY_BYPASS = '__memorialize__'

/**
 * Append a chat record. chat_records is append-only by design (DSG enforces);
 * callers wanting to "correct" a record append a new row with metadata
 * carrying `supersedes: <prev_id>`.
 */
export function recordChat(
  input: ChatRecordInput,
  options: { profileRoot?: string } = {},
): RecordChatResult {
  const id = uuid()
  const actor = input.actor ?? `system:${input.channel}`

  const gate = dsgGate({
    profile: input.profile,
    table: 'chat_records',
    action: 'create',
    payload: {
      id,
      tenant: input.profile,
      source_refs: input.source_refs ?? [{ kind: 'channel', value: input.channel }],
      [APPEND_ONLY_BYPASS]: true,
    },
    actor,
  })
  if (!gate.ok) {
    return {
      ok: false,
      reason: gate.reason,
      rule: gate.rule,
      gate_event_id: gate.gate_event_id,
    }
  }

  const handle = openBrain(input.profile, {
    profileRoot: options.profileRoot,
  })
  try {
    const ts = now()
    handle.run(
      `INSERT INTO chat_records (
        id, ts, channel, thread_id, participants, role, content,
        metadata, source_refs, decision_context_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      ts,
      input.channel,
      input.thread_id ?? null,
      JSON.stringify(input.participants),
      input.role,
      input.content,
      jsonOrNull(input.metadata),
      jsonOrNull(input.source_refs),
      input.decision_context_id ?? null,
    )

    recordAudit(input.profile, {
      ts,
      surface: 'brain',
      actor,
      action: 'create',
      target_type: 'chat_records',
      target_id: id,
      version_after: input.content.slice(0, 128),
      reason: `memorialized ${input.channel} ${input.role} message`,
      outcome: 'ok',
      source_refs: input.source_refs ?? null,
      gate_event_id: gate.gate_event_id,
    }, options)

    return { ok: true, id, gate_event_id: gate.gate_event_id }
  } finally {
    handle.close()
  }
}

/**
 * Reconstruct an agent's decision context: the chat thread leading to a
 * tracked decision plus any retrieval snapshots.
 */
export function reconstructDecisionContext(
  profile: string,
  decisionContextId: string,
  options: { profileRoot?: string } = {},
): {
  chat: Array<ChatRecord>
  retrieval: Array<{ id: string; query: string | null; retrieved_refs: string }>
} {
  const handle = openBrain(profile, { profileRoot: options.profileRoot })
  try {
    const chatRows = handle.all<{
      id: string
      ts: number
      channel: ChatChannel
      thread_id: string | null
      participants: string
      role: ChatRole
      content: string
      metadata: string | null
      source_refs: string | null
      decision_context_id: string | null
    }>(
      `SELECT * FROM chat_records
       WHERE decision_context_id = ? OR thread_id = ?
       ORDER BY ts ASC`,
      decisionContextId,
      decisionContextId,
    )
    const chat: Array<ChatRecord> = chatRows.map((r) => ({
      id: r.id,
      ts: r.ts,
      channel: r.channel,
      thread_id: r.thread_id,
      participants: safeParse<Array<string>>(r.participants) ?? [],
      role: r.role,
      content: r.content,
      metadata: safeParse<Record<string, unknown>>(r.metadata),
      source_refs: safeParse<Array<unknown>>(r.source_refs),
      decision_context_id: r.decision_context_id,
    }))
    let retrieval: Array<{
      id: string
      query: string | null
      retrieved_refs: string
    }> = []
    try {
      retrieval = handle.all<{
        id: string
        query: string | null
        retrieved_refs: string
      }>(
        `SELECT id, query, retrieved_refs FROM retrieval_context_snapshots
         WHERE decision_id = ?`,
        decisionContextId,
      )
    } catch {
      // Table only present after Tranche B migration; safe to skip.
    }
    return { chat, retrieval }
  } finally {
    handle.close()
  }
}

function safeParse<T>(v: string | null | undefined): T | null {
  if (!v) return null
  try {
    return JSON.parse(v) as T
  } catch {
    return null
  }
}

/**
 * List recent chat across all channels for a profile (operator dashboard).
 */
export function listRecentChats(
  profile: string,
  options: {
    profileRoot?: string
    channel?: ChatChannel
    limit?: number
  } = {},
): Array<ChatRecord> {
  const handle = openBrain(profile, { profileRoot: options.profileRoot })
  try {
    const rows = options.channel
      ? handle.all<{
          id: string
          ts: number
          channel: ChatChannel
          thread_id: string | null
          participants: string
          role: ChatRole
          content: string
          metadata: string | null
          source_refs: string | null
          decision_context_id: string | null
        }>(
          `SELECT * FROM chat_records WHERE channel = ? ORDER BY ts DESC LIMIT ?`,
          options.channel,
          options.limit ?? 100,
        )
      : handle.all<{
          id: string
          ts: number
          channel: ChatChannel
          thread_id: string | null
          participants: string
          role: ChatRole
          content: string
          metadata: string | null
          source_refs: string | null
          decision_context_id: string | null
        }>(
          `SELECT * FROM chat_records ORDER BY ts DESC LIMIT ?`,
          options.limit ?? 100,
        )
    return rows.map((r) => ({
      id: r.id,
      ts: r.ts,
      channel: r.channel,
      thread_id: r.thread_id,
      participants: safeParse<Array<string>>(r.participants) ?? [],
      role: r.role,
      content: r.content,
      metadata: safeParse<Record<string, unknown>>(r.metadata),
      source_refs: safeParse<Array<unknown>>(r.source_refs),
      decision_context_id: r.decision_context_id,
    }))
  } finally {
    handle.close()
  }
}
