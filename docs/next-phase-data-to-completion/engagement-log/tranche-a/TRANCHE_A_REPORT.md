# Tranche A — Foundation Hardening — Report

**Date:** 2026-05-31
**Branch:** `tranche-a-foundation`
**Tests:** 384 → 421 passing (+37 new across 7 test files)
**Build:** clean

## Acceptance criteria status

| Item | Status | Evidence |
|---|---|---|
| A.1 Brain at `~/.hermes/profiles/<profile>/brain/` | DONE (code) | `src/server/brain-store.ts`, `src/server/brain-schema.ts` (3 migrations) |
| A.1 Schema migrations refuse on checksum drift | DONE | `src/test/brain-store.test.ts:'rejects opening with a tampered migration checksum'` |
| A.1 Backup/restore round-trip no leak | DONE | `src/test/brain-store.test.ts:'backup/restore round-trips data with no leak'` |
| A.1 Migration via plugin layer, not Hermes core | DONE | Migrations defined in `src/server/brain-schema.ts` (plugin/skill layer) |
| A.2 DSG mirrors KSG shape | DONE | `src/server/dsg-gate.ts` exports `GateOutcome` identical to KSG |
| A.2 Machine-readable rule IDs | DONE | 14 rule IDs in `DsgRuleId` type; all stable per SRS A.2 |
| A.2 Every Brain write through DSG | DONE | `brain-mcp-handlers.ts:brainWrite()` calls `dsgGate()`; tests verify |
| A.2 DSG is also an advisor | DONE | All denied verdicts return `advice: { next_action / knowledge_gap_ref / create_reconciliation_item }` |
| A.3 Brain tools in MCP token registry | DONE | `brain_query`, `brain_write`, `brain_record_chat`, `brain_record_lookup_miss`, `brain_record_hunch`, `brain_subscribe_events`, `brain_export_snapshot` + admin `mcp__brain_migrate / mcp__brain_backup / mcp__brain_restore` |
| A.3 Tool calls in `~/.hermes/mcp-audit.log` JSONL | DONE | `wiki-mcp.ts` extension calls `recordToolCall()` for brain tools too |
| A.4 Single MCP connection per profile | DONE | `src/routes/api/mcp/$profile.ts` new endpoint; legacy `/api/mcp/wiki` retained |
| A.4 Tool naming `wiki_*` / `brain_*` / `federation_*` / `comms_*` | DONE | All tool names follow convention |
| A.5 Always-on metadata substrate | DONE | `src/server/metadata-substrate.ts` + `metadata_audit` table in migration v1 |
| A.5 Records actor/action/target/version/reason/gate_event_id | DONE | All fields in schema; tests verify |
| A.5 Append-only | DONE | `metadata_audit` is in `APPEND_ONLY_TABLES` set in DSG |
| A.5 Drift observability query | DONE | `listAuditByTarget(profile, target)` |
| A.5 Renewal cadence query | DONE | `listStaleTargets(profile, cutoff)` |
| A.5 Feedback-loop closure | DONE | `gate_event_id` ties decisions to subsequent writes |
| A.5 One policy engine between KSG and DSG | DONE | Both use `recordAudit` from same `metadata-substrate.ts`; same surface enum |
| A.6 Memorialize human↔agent chats | DONE | `recordChat({channel: 'studio-chat'|...})` |
| A.6 Memorialize agent↔backend tool calls | DONE | MCP audit log + recordChat with channel='mcp' |
| A.6 Reconstruct decision context | DONE | `reconstructDecisionContext(profile, decisionId)` |
| A.7 `recordLookupMiss` runtime hook | DONE | `src/server/lookup-miss.ts:recordLookupMiss()` + `brain_record_lookup_miss` MCP tool |
| A.7 Assumption surfaced to operator | DONE | `listOperatorVisibleAssumptions` + `/api/brain/assumptions` GET endpoint |
| A.7 Operator can resolve | DONE | `resolveAssumption` + `/api/brain/assumptions` POST endpoint |
| A.8 Hermes self-improvement Cron + guardian routing | DONE | `src/server/hermes-self-improvement-watcher.ts:scanSelfImprovement()` opens hunches via KSG/DSG, records `self_improvement_events` |
| A.8 No silent overwrites | DONE | Every detected change creates a hunch — never auto-applied |

## Architecture decisions during Tranche A (also in decisions.log)

- `BRAIN_PROFILES_ROOT` env var added to brain-store for test isolation. Falls back to `os.homedir()/.hermes/profiles/`. Reversible: unset env.
- Brain MCP handlers live in separate `brain-mcp-handlers.ts` but ride the existing `wiki-mcp.ts` dispatcher (SRS A.4 single connection).
- New per-profile MCP endpoint at `/api/mcp/$profile`. Legacy `/api/mcp/wiki` kept for backward compat with consultative-agent admin token.
- Schema migrations are versioned, checksummed (SHA-256 first 16 chars), and stored in `schema_migrations` table. Checksum drift causes refusal to open Brain — prevents tampered migrations.
- Hunches table populated in Tranche A even though SRS lists it under B.2, because A.8 self-improvement watcher needs it.
- `metadata_audit` table satisfies BOTH the sixth-invariant requirement (A.5) AND B.1 `audit_records` requirement — same table, two names refer to same thing.
- `chat_records`, `events`, `metadata_audit`, `self_improvement_events`, `comms_log` are all append-only at DSG gate level (returns `append-only-violation` rule on update/deprecate/archive).

## Tools added to MCP token registry

Non-admin (per-profile scope):
- `brain_query` — read rows; cross-profile via flag
- `brain_write` — DSG-gated insert
- `brain_record_chat` — A.6 memorialization
- `brain_record_lookup_miss` — A.7 hook
- `brain_record_hunch` — guardian advisor output
- `brain_subscribe_events` — SSE subscription URL
- `brain_export_snapshot` — backup file

Admin (require `admin: true` token):
- `mcp__brain_migrate` — apply pending migrations
- `mcp__brain_backup` — backup with checksum
- `mcp__brain_restore` — restore from snapshot

## New API surfaces

- `GET /api/brain/assumptions?profile=X[&include_resolved=true]` — list operator-visible assumptions
- `POST /api/brain/assumptions` — resolve an assumption (accept/reject/clarify)
- `GET /api/brain/readiness?profile=X` — readiness probe (503 if non-conformant)
- `GET /api/brain/readiness?all=true` — admin: list profiles needing provisioning
- `POST /api/mcp/$profile` — single MCP connection per profile

## Provisioning script

`scripts/provision-brain.ts` — idempotent provisioner. Walks every profile dir under `~/.hermes/profiles/`, runs migrations, verifies sixth-invariant present. Designed to run inside `hermes-agent` container.

## Open items moving into Tranche B

- Brain provisioning on production volume (will run after this PR ships and Coolify redeploys)
- The `embeddings` table and `vectors/` dir exist (migration v2) but Tranche B implements the pipeline that fills them
- Tranche B will exercise the K↔B contract end-to-end with the consultative agent fixture
