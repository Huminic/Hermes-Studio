/**
 * Guarded wiki write — the SINGLE structural entry point for changing wiki
 * canon. Both surfaces (the customer-admin UI and the knowledge MCP tool) route
 * through here, so the Knowledge Semantic Guardian can never be bypassed —
 * mirroring how every Brain write routes through dsgGate (see dsg-gate.ts).
 *
 * Pipeline (Knowledge Core v1.0):
 *   1. recognized actor  (user:/token:/system: — the Brain rejects others)
 *   2. RULE GATE         (real ksg-gate: protected trees, canonical-frozen, frontmatter)
 *   3. WRITE             (guarded customer-wiki write, traversal-protected)
 *   4. MEMORIALIZE       (insertEvent → the Brain's functional memory of the
 *                         organization's evolution; itself DSG-gated)
 *
 * v1.0 ships the rule gate only. The LLM-reasoned semantic governor (consistency
 * / contradiction) is v1.1 and plugs in as step 2b — env-gated; absent it, this
 * degrades cleanly to rule-gate-only. See docs/launch/KNOWLEDGE_CORE_PATTERN.md.
 */

import { evaluateWikiSave } from './ksg-gate'
import { readCustomerWikiFile, writeCustomerWikiFile } from './customer-wiki'
import { insertEvent } from './brain-record-families'

/** Recognized actor identity forms (must match dsg-gate.isKnownActor). */
const ACTOR_RE = /^(user:|token:|system:).+/

export type GuardedWikiWriteResult =
  | {
      ok: true
      path: string
      action: 'create' | 'update'
      /** True when the change was recorded to the Brain (org-evolution memory). */
      memorialized: boolean
      /** Present when memorialization was refused (e.g. DSG gate) — surfaced, never silent. */
      memo_note?: string
      warnings: Array<string>
    }
  | { ok: false; rule: string; reason: string }

export function guardedWikiWrite(input: {
  profile: string
  /** Path under `company-wiki/…` (the published canon both surfaces edit). */
  relPath: string
  content: string
  /** user:<name> | token:<label> | system:<subsystem> */
  actor: string
}): GuardedWikiWriteResult {
  if (!ACTOR_RE.test(input.actor)) {
    return {
      ok: false,
      rule: 'unknown-actor',
      reason: 'actor must be user:<name>, token:<label>, or system:<subsystem>',
    }
  }

  const prev = readCustomerWikiFile(input.profile, input.relPath)
  const previousContent = prev.ok ? (prev.content ?? null) : null
  const action: 'create' | 'update' = previousContent ? 'update' : 'create'

  // 1. RULE GATE — the real ksg-gate.
  const gate = evaluateWikiSave({
    relativePath: input.relPath,
    previousContent,
    newContent: input.content,
  })
  if (!gate.ok) return { ok: false, rule: gate.rule, reason: gate.reason }

  // 2. WRITE — guarded, traversal-protected.
  const w = writeCustomerWikiFile(input.profile, input.relPath, input.content)
  if (!w.ok) return { ok: false, rule: 'write-failed', reason: w.error ?? 'write failed' }

  // 3. MEMORIALIZE — capture the change as an org-evolution event (DSG-gated).
  let memorialized = false
  let memoNote: string | undefined
  try {
    const res = insertEvent({
      profile: input.profile,
      actor: input.actor,
      type: 'knowledge_change',
      source: 'knowledge-gateway',
      subject_type: 'wiki_page',
      subject_id: input.relPath,
      payload: { action, bytes: input.content.length },
      source_refs: [{ kind: 'wiki', value: input.relPath }],
    }) as { ok: boolean; reason?: string; rule?: string }
    memorialized = res.ok
    if (!res.ok) memoNote = `${res.rule}: ${res.reason}`
  } catch (err) {
    memoNote = (err as Error).message
  }

  return { ok: true, path: input.relPath, action, memorialized, memo_note: memoNote, warnings: gate.warnings }
}
