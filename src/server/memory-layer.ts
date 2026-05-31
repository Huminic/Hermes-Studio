/**
 * Memory layer (SRS Tranche B.5).
 *
 * Composed of:
 *   - retrieval_context_snapshots — what an agent retrieved at decision time
 *   - chat_records — conversational context (Tranche A.6)
 *   - embeddings — semantic recall (Tranche B.6)
 *
 * This module provides the higher-level decision-context API the
 * Consultative Agent and the Studio operator use to "tell me what this
 * agent knew when it made that decision."
 */

import {
  insertRetrievalSnapshot,
  type RetrievalSnapshotInput,
} from './brain-record-families'
import { reconstructDecisionContext, type ChatRecord } from './chat-memorialization'
import { searchSimilar, type SimilarityHit } from './embeddings'
import { openBrain } from './brain-store'
import type { SourceRef } from './brain-record-families'

export type DecisionContext = {
  decision_id: string
  profile: string
  chat: Array<ChatRecord>
  retrieval_snapshots: Array<{
    id: string
    ts: number
    actor: string
    query: string | null
    retrieved_refs: Array<SourceRef>
    reasoning: string | null
  }>
  outputs: Array<{
    id: string
    ts: number
    producer_actor: string
    output_type: string
    content: string
  }>
}

export function recordRetrieval(
  input: RetrievalSnapshotInput,
  options: { profileRoot?: string } = {},
) {
  return insertRetrievalSnapshot(input, options)
}

export function reconstructDecision(
  profile: string,
  decisionId: string,
  options: { profileRoot?: string } = {},
): DecisionContext {
  const { chat, retrieval } = reconstructDecisionContext(profile, decisionId, options)
  const handle = openBrain(profile, { profileRoot: options.profileRoot })
  let outputs: Array<{
    id: string
    ts: number
    producer_actor: string
    output_type: string
    content: string
  }> = []
  try {
    try {
      outputs = handle.all<{
        id: string
        ts: number
        producer_actor: string
        output_type: string
        content: string
        source_refs: string | null
      }>(
        `SELECT id, ts, producer_actor, output_type, content, source_refs
         FROM outputs WHERE source_refs LIKE ?`,
        `%${decisionId}%`,
      )
    } catch {
      /* outputs table only available after Tranche B migration */
    }
  } finally {
    handle.close()
  }
  return {
    decision_id: decisionId,
    profile,
    chat,
    retrieval_snapshots: retrieval.map((r) => ({
      id: r.id,
      ts: 0,
      actor: '',
      query: r.query,
      retrieved_refs: safeParseRefs(r.retrieved_refs),
      reasoning: null,
    })),
    outputs,
  }
}

export async function semanticRecall(
  profile: string,
  query: string,
  options: {
    profileRoot?: string
    topK?: number
    sourceTable?: string
  } = {},
): Promise<Array<SimilarityHit>> {
  return searchSimilar(profile, query, options)
}

function safeParseRefs(v: string): Array<SourceRef> {
  try {
    const p = JSON.parse(v)
    return Array.isArray(p) ? (p as Array<SourceRef>) : []
  } catch {
    return []
  }
}
