---
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
  reconciliation_items, drafts (under `knowledge/inbox/` or
  `knowledge/drafts/`).

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
`tenant-mismatch` rule.
