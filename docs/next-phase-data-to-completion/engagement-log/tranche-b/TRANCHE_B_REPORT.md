# Tranche B — Knowledge ↔ Brain interaction contract — Report

**Date:** 2026-05-31
**Branch:** `tranche-b-knowledge-brain-contract`
**Tests:** 421 → 442 passing (+21 new across 4 test files)
**Build:** clean

## Acceptance criteria status

| Item | Status | Evidence |
|---|---|---|
| B.1 Record families from Artifact D adapted to live runtime | DONE | `src/server/brain-record-families.ts` exposes typed inserters for `events / entities / observations / outputs / transactions / tasks / retrieval_context_snapshots / reconciliation_items / adjacent_neighbors / suggested_knowledge_changes` |
| B.1 Runtime sources mapped to record families | DONE | `src/server/brain-sync.ts`: messaging-hub threads→entities, messages→events, contacts→entities, agent_reply_jobs→outputs, ADF/Vapi (via messaging-hub messages)→events, engagement-state→adjacent_neighbors+observations |
| B.1 source_references mandatory on records influencing execution / reporting / suggestions | DONE | DSG `SOURCE_REF_REQUIRED_TABLES`; tests verify `missing-source-reference` rule rejects on empty |
| B.1 Tenant discriminator on every record | DONE | `writeOne` injects `tenant: profile`; DSG `tenant-mismatch` rule rejects forged payloads |
| B.2 Hunches table with full lifecycle | DONE (Tranche A foundation) | `src/server/hunches-store.ts` |
| B.2 Cron-driven hunch creation | DONE | `src/server/hermes-self-improvement-watcher.ts` (Tranche A) opens hunches on file changes |
| B.2 KSG-vs-DSG writer separation | DONE | `originating_guardian` field; DSG sets `proposed_action: 'brain_update'`, KSG sets `wiki_update` |
| B.3 Artifact B contract preserved verbatim in canonical wiki | DONE | `KNOWLEDGE_BRAIN_INTERACTION_CONTRACT` exported + `seedInteractionContract(profile)` writes to canon/ |
| B.3 Runtime can create events/observations/outputs/tasks/suggestions/reconciliation/drafts; cannot rewrite canon silently | DONE | DSG `protected-tree` + `canonical-frozen` rules (KSG); reconciliation flow on contradiction |
| B.3 Contradiction surfaces reconciliation_item w/ lineage | DONE | `src/server/reconciliation.ts:surfaceContradiction()`; tests verify lineage payload |
| B.4 Adjacent neighbors first-class on engagement-state + Brain | DONE | `engagement-state.yaml` already had it; `recordAdjacentNeighbor` writes to Brain; `brain-sync` mirrors from yaml |
| B.4 DSG rejects newly absorbed data without defined source path | DONE | `recordAdjacentNeighbor` carries source_refs; DSG rule `missing-source-reference` blocks if absent |
| B.5 Memory layer composed of retrieval_context_snapshots + chat_records + embeddings | DONE | `src/server/memory-layer.ts` ties all three |
| B.5 Decision reconstruction works | DONE | `reconstructDecision(profile, decisionId)` returns chat + retrieval + outputs |
| B.6 Embeddings pipeline functional with model identity recorded | DONE | `src/server/embeddings.ts`; `embeddings.model` column |
| B.6 Per-profile vector storage | DONE | Vectors stored as BLOBs in profile-isolated SQLite |
| B.6 Re-embed on model upgrades | DONE | `reembed()` returns ReembedReport with embedded/skipped/errors |
| B.7 Migrations versioned + checksummed | DONE (Tranche A) + extended in this tranche (v4 ALTER) |
| B.7 Refuses to serve agents while migrations pending | DONE | `checkBrainReadiness` reports `pending_migration_count` and `ok: false` |

## What this tranche operationalizes

- **One MCP** dispatches all record family writes; the same audit log captures them.
- **The contract becomes canon** — every customer profile gets the K↔B interaction contract seeded into its canon/ on provisioning (next tranche wires this into mcp__create_profile).
- **Memory becomes real**: an agent's decision context can be reconstructed by following decision_id across chat_records + retrieval_context_snapshots + outputs.
- **Semantic recall**: even with the default local-hash model the search returns a usable ranked list; remote models slot in via `registerModel('openai', ...)` without changing call sites.

## Decisions added to decisions.log

- Migration v4 added to ALTER adjacent_neighbors to add source_refs column (instead of modifying v2, which would cause checksum drift on any DB that already applied v2).
- Default embedding model is `local-hash-v1` (384-dim, deterministic, no network). Documented as a starting point; production should swap to a real model via `EMBED_MODEL_PROVIDER` env or `registerModel()`.
- Brain-sync is read-only against messaging-hub.db (opens with `{ readonly: true }`); it never modifies the messaging-hub side.
- `seedInteractionContract` writes the K↔B contract to `canon/knowledge-brain-interaction-contract.md` and is idempotent (won't overwrite if present).
