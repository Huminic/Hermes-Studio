/**
 * Reconciliation (SRS Tranche B.3).
 *
 * When an operational record contradicts a canonical wiki claim, this
 * module surfaces the conflict, preserves lineage to both sides, and
 * opens a reconciliation_item. Resolution flows through the governed
 * promotion path (KSG promote on wiki side, DSG-gated brain update on
 * the operational side).
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { openBrain } from './brain-store'
import { openReconciliation } from './brain-record-families'
import { recordHunch } from './hunches-store'

export type ContradictionInput = {
  profile: string
  conflict_type: string
  wiki_ref?: string
  brain_ref?: string
  details: Record<string, unknown>
  proposed_resolution?: string
}

export function surfaceContradiction(
  input: ContradictionInput,
  options: { profileRoot?: string } = {},
): {
  ok: boolean
  reconciliation_id?: string
  hunch_id?: string
  reason?: string
} {
  const lineage: Record<string, unknown> = {
    wiki_ref: input.wiki_ref ?? null,
    brain_ref: input.brain_ref ?? null,
    details: input.details,
  }
  const rec = openReconciliation(
    {
      profile: input.profile,
      actor: 'system:reconciliation',
      conflict_type: input.conflict_type,
      wiki_ref: input.wiki_ref,
      brain_ref: input.brain_ref,
      lineage,
      proposed_resolution: input.proposed_resolution,
    },
    options,
  )
  if (!rec.ok) {
    return { ok: false, reason: rec.reason }
  }
  // Open a paired DSG hunch so the operator sees the item in the hunches
  // queue as well as the reconciliation_items list.
  const hunch = recordHunch(
    {
      profile: input.profile,
      originating_guardian: 'DSG',
      subject_type: 'reconciliation_item',
      subject_id: rec.id,
      statement: `Reconciliation needed: ${input.conflict_type}`,
      evidence_refs: [
        { kind: 'wiki', value: input.wiki_ref ?? '(none)' },
        { kind: 'embed', value: input.brain_ref ?? '(none)' },
      ],
      confidence_label: 'B-3',
      proposed_action: 'monitor',
      actor: 'system:reconciliation',
    },
    options,
  )
  return {
    ok: true,
    reconciliation_id: rec.id,
    hunch_id: hunch.ok ? hunch.id : undefined,
  }
}

export type ResolveReconciliationInput = {
  profile: string
  reconciliation_id: string
  resolution_notes: string
  resolved_by: string
  resolution: 'wiki_corrected' | 'brain_corrected' | 'both_updated' | 'dismissed'
}

export function resolveReconciliation(
  input: ResolveReconciliationInput,
  options: { profileRoot?: string } = {},
): { ok: boolean; reason?: string } {
  const handle = openBrain(input.profile, { profileRoot: options.profileRoot })
  try {
    const row = handle.get<{ status: string }>(
      `SELECT status FROM reconciliation_items WHERE id = ?`,
      input.reconciliation_id,
    )
    if (!row) return { ok: false, reason: 'reconciliation item not found' }
    handle.run(
      `UPDATE reconciliation_items SET
         status = ?,
         resolved_at = ?,
         resolved_by = ?,
         resolution_notes = ?
       WHERE id = ?`,
      input.resolution,
      Date.now(),
      input.resolved_by,
      input.resolution_notes,
      input.reconciliation_id,
    )
    return { ok: true }
  } finally {
    handle.close()
  }
}

export function listOpenReconciliations(
  profile: string,
  options: { profileRoot?: string } = {},
): Array<{
  id: string
  ts: number
  conflict_type: string
  wiki_ref: string | null
  brain_ref: string | null
  proposed_resolution: string | null
}> {
  const handle = openBrain(profile, { profileRoot: options.profileRoot })
  try {
    return handle.all(
      `SELECT id, ts, conflict_type, wiki_ref, brain_ref, proposed_resolution
       FROM reconciliation_items WHERE status = 'open'
       ORDER BY ts DESC LIMIT 200`,
    )
  } finally {
    handle.close()
  }
}

/**
 * Seeds the Knowledge↔Brain interaction contract page (SRS B.3) into a
 * profile's canon. The contract MUST be preserved verbatim in canonical
 * wiki pages of every customer profile.
 */
export const KNOWLEDGE_BRAIN_INTERACTION_CONTRACT = `---
title: Knowledge ↔ Brain Interaction Contract
type: contract
status: canonical
source: Artifact B v1.1 § Interaction Contract
---

# Knowledge ↔ Brain Interaction Contract

The wiki is canonical for meaning. The Brain is canonical for what
happened and what is currently true operationally. Neither is allowed
to overwrite the other silently.

## Runtime authority

Runtime agents MAY create the following in the Brain:
- events, observations, outputs, tasks, suggested_knowledge_changes,
  reconciliation_items, drafts (under \`knowledge/inbox/\` or
  \`knowledge/drafts/\`).

Runtime agents MUST NOT silently rewrite canonical knowledge.
Any apparent contradiction between an operational record and a
canonical wiki claim that materially affects execution or reporting
becomes a reconciliation_item.

## Reconciliation

A reconciliation_item carries lineage to both sides (wiki_ref,
brain_ref, full details payload) and is closable through the governed
promotion path — KSG promotes the wiki side or DSG updates the brain
side; either way, the item is closed with a resolution and a note in
the operator's voice.

## Confidence

All runtime-authored knowledge entries carry a confidence label per
the Confidence Schema (Admiralty Code A-F × 1-6 for strategic;
canonical / under-review / deprecated for tactical). The DSG refuses
publication of records with confidence_label=F as canonical.

## Audit

Every interaction (read, create, update, deprecate, archive, gate
decision, tool call, self-improvement event) is recorded in the
metadata_audit table (the sixth wiki invariant), with actor, action,
target, version before/after, reason, gate event reference, source
references, outcome, and rule id when applicable.

## Source references

Any record influencing execution, reporting, or knowledge suggestions
MUST carry at least one source_reference. Tables enforcing this
include: events, entities, observations, outputs, tasks, transactions,
suggested_knowledge_changes, hunches, assumptions, adjacent_neighbors,
uploads.

## Tenant discriminator

Every Brain record carries a tenant discriminator matching the
profile. Cross-profile writes are rejected by the DSG with the
\`tenant-mismatch\` rule.
`

export function seedInteractionContract(
  profile: string,
  options: { profileRoot?: string } = {},
): { ok: boolean; written: boolean; path: string } {
  const root =
    options.profileRoot ??
    path.join(
      process.env.BRAIN_PROFILES_ROOT ??
        path.join(os.homedir(), '.hermes', 'profiles'),
      profile.replace(/[^a-zA-Z0-9_-]/g, '_'),
    )
  const canonDir = path.join(root, 'canon')
  const target = path.join(canonDir, 'knowledge-brain-interaction-contract.md')
  if (!fs.existsSync(root)) {
    return { ok: false, written: false, path: target }
  }
  fs.mkdirSync(canonDir, { recursive: true })
  if (fs.existsSync(target)) {
    return { ok: true, written: false, path: target }
  }
  fs.writeFileSync(target, KNOWLEDGE_BRAIN_INTERACTION_CONTRACT, 'utf8')
  return { ok: true, written: true, path: target }
}
