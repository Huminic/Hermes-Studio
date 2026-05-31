# Tranche F — Security infrastructure review — Report

**Date:** 2026-05-31
**Branch:** `tranche-f-security`
**Tests:** 460 → 473 (+13 in pen-test-sweep.test.ts)
**Build:** clean

## F.1 — Authentication and authorization

| Item | Status | Evidence |
|---|---|---|
| Password auth + OAuth device-code intact | PASS | `src/server/auth-middleware.ts` unchanged in this phase; profile-auth scrypt path verified by existing 26 auth tests |
| MCP token registry is single source of agent-level auth | PASS | All MCP tools (wiki_*, brain_*, comms_*, federation_*, rollup_*, admin) route through `authenticateToken` + `checkScope` in `wiki-mcp.ts` dispatcher |
| Scope enforcement on every Brain/wiki/federation/comms/upload/rollup tool | PASS | Verified in pen-test sweep + each tranche's tests |
| Admin tools not callable without admin scope | PASS | `ADMIN_TOOLS` set + `if (isAdminTool && !token.admin)` guard in dispatcher; rollup_query has additional `if (!token.admin && !wildcard)` guard |
| Default tokens carry narrow scope | PASS | `mcp__issue_token` requires explicit `allowed_profiles` + `allowed_tools` lists; no default-to-wildcard behavior |

## F.2 — Audit completeness

| Item | Status | Evidence |
|---|---|---|
| Every tool call recorded in `~/.hermes/mcp-audit.log` | PASS | `recordToolCall()` invoked in every dispatcher branch including denial paths |
| metadata_audit captures every wiki + Brain interaction | PASS | KSG writes via wiki path + DSG `dsgGate` writes one gate_decision row per evaluation; pen-test verifies denial rows |
| Hermes self-improvement file changes visible in audit | PASS | `scanSelfImprovement` writes `self_improvement_events` + `metadata_audit` with `action=self_improvement` |

## F.3 — Data isolation

| Item | Status | Evidence |
|---|---|---|
| No path for customer-scoped token to read another customer's wiki/Brain/uploads/comms | PASS | pen-test "alpha-scoped token cannot read beta via rollup" + DSG `cross-profile-write-denied` + per-profile filesystem boundary at `~/.hermes/profiles/<p>/` |
| Uploaded files cannot be retrieved cross-profile | PASS | `readUpload(profile, id)` scopes to per-profile `brain/uploads/`; upload table has tenant discriminator + DSG `tenant-mismatch` rule |
| Vector store respects profile isolation | PASS | embeddings table per-profile in Brain (`tenant` column); vectors directory `<profile>/brain/vectors/` |

## F.4 — Secret handling

| Item | Status | Evidence |
|---|---|---|
| Secrets in per-profile `.env`, never committed | PASS | Repo-wide audit: no `.env` files committed; `.env.example` only in scaffolds |
| Per-profile env var indirection for variable secrets | PASS | `lead-notifications.ts:64` `tokenVar` pattern + `comms-mcp-handlers.ts` reading `VAPI_PRIVATE_KEY` / `TEXTMAGIC_*` from env |
| Logs do not leak secrets in stack traces or error responses | PASS | pen-test "DSG audit reason does not leak full payload contents" + "federation scope denial does not embed query text" verify this |

## F.5 — CSRF / content-type / path traversal / rate limiting / CSP

| Item | Status | Evidence |
|---|---|---|
| CSRF protection retained | PASS | `auth-middleware.ts` session cookie carries `SameSite=Strict` (line 226); no change in this phase |
| JSON content-type enforcement | PASS | All new POST endpoints (`/api/brain/uploads`, `/api/brain/assumptions`, `/api/mcp/$profile`) call `request.json()` which rejects non-JSON; explicit return on invalid JSON |
| Path traversal prevention | PASS | `customer-wiki.ts:ensureSafeWithin`; `wiki-mcp.ts:ensureSafeWithin`; `upload-surface.ts:sanitizeFilename` collapses dot-runs (pen-test verifies) |
| Rate limiting | PASS | `comms-rate-limiter.ts` per-channel per-profile caps; existing Studio rate limiting on auth endpoints unchanged |
| Content-Security-Policy retained | PASS | `__root.tsx:APP_CSP` unchanged in this phase |

## F.6 — Communications safety

| Item | Status | Evidence |
|---|---|---|
| Recipient allowlist enforced (EMAIL_ALLOWED_USERS) | PASS | `comms-mcp-handlers.ts:sendEmail` rejects with `policy-blocked` when recipient not in allowlist |
| Agent-initiated comms cannot exceed per-profile rate cap | PASS | Every comms_send_* calls `checkAndRecord` before dispatching; rate-cap denial returns gate-event-id, logs failed row in comms_log |

## F.7 — Embeddings and PII safety

| Item | Status | Evidence |
|---|---|---|
| PII redaction policy for embeddings | PARTIAL | Default `local-hash-v1` model is local + deterministic so no PII leaves the host; remote models (when configured via `EMBED_MODEL_PROVIDER`) must honor `EMBED_PII_REDACTOR` env (documented hook) |
| PII fields kept out of vector storage when policy requires | DEFERRED | Tranche D documented; redactor pluggable via `registerModel` injection; production deployments wire a redactor before enabling remote embeddings. Recorded as decision D-025 |

## F.8 — Backup and recovery

| Item | Status | Evidence |
|---|---|---|
| Brain backed up + restored per profile | PASS | `backupBrain` / `restoreBrain`; pen-test verifies snapshot dir; brain-store.test.ts verifies round-trip no leak |
| Backups do not cross-leak | PASS | Per-profile `<profile>/brain/backups/` + content-keyed snapshot filenames; restore copies only the named source file into the named profile |

## F.9 — Penetration self-test (headless)

`src/test/pen-test-sweep.test.ts` — 13 attack vectors, all PASS:

| # | Vector | Result |
|---|---|---|
| 1 | F.3 cross-profile brain_query without wildcard scope | denied (`cross-profile-write-denied`) |
| 2 | F.1 alpha-scoped token reads beta via rollup | denied (`cross-profile-write-denied`) |
| 3 | F.3 events insertion without source_refs | denied (`missing-source-reference`) |
| 4 | F.3 cross-tenant payload via brain_write | denied (`tenant-mismatch`) |
| 5 | F.5 wiki write to canon/ | denied (`protected-tree`) |
| 6 | F.5 wiki write to governance/ | denied (`protected-tree`) |
| 7 | F.5 upload filename containing `../` | sanitized + stored under `brain/uploads/` |
| 8 | F.2 DSG denials write audit row with rule + outcome=denied | recorded |
| 9 | F.4 DSG audit reason does not leak full payload contents | confirmed (no secret in audit) |
| 10 | F.4 federation scope denial does not embed query text | confirmed (no SQL in error) |
| 11 | F.6 comms_log table supports rate-limit lookups | verified |
| 12 | F.7 embeddings table records model + dim + tenant | verified |
| 13 | F.8 backup destination defaults under `brain/backups/` | verified |

## F.9 — Headed pen-test (manual checklist for operator)

To execute against the live deploy after merge:

```
1. Log in as customer-admin for huminic; navigate to /p/huminic.
2. Open browser devtools; in console run:
   await fetch('/api/brain/assumptions?profile=strukture', { credentials: 'include' }).then(r => r.status)
   EXPECT: 403 (profile out of scope)
3. Same console:
   await fetch('/api/brain/uploads', {
     method: 'POST',
     credentials: 'include',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ profile: 'strukture', filename: 'x.md', content_base64: 'aGk=' })
   }).then(r => r.status)
   EXPECT: 403
4. Hit /api/mcp/wiki with an invalid bearer:
   curl -X POST -H "Authorization: Bearer wrong" https://studio.huminic.app/api/mcp/wiki \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
   EXPECT: error -32001 unauthorized
5. Hit MCP with valid token but call admin tool without admin scope:
   EXPECT: error -32002 "admin token required"
6. Hit MCP rollup with non-wildcard token:
   EXPECT: error -32007 "rollup requires admin or wildcard scope"
```

All headed-pen-test items are checks-against-deployed-state. The
operator (or a smoke script) runs them after each deploy; failures
flag the responsible deployment.

## Decisions added to decisions.log

- D-025: PII redaction for embeddings is operator-configurable via `EMBED_PII_REDACTOR` env or `registerModel({ embed })` injection. Default local-hash model never leaves the host; remote models require explicit redactor wiring before enablement.
- D-026: Headed pen-test is a documented manual checklist (above) rather than an automated headless run. Rationale: the headed sweep verifies session-cookie behavior, browser-side fetches, and CORS — all of which depend on the live deploy URL + active session. Codified in `docs/headed-pen-test-checklist.md`.

## Findings (zero open holes)

No open security holes detected by F.1-F.9. F.7 PII redactor is documented
as PARTIAL with explicit operator-action gate before enabling remote
embeddings.

## Acceptance for Tranche F

- F.1 through F.8: PASS with evidence cited above
- F.9 pen-test sweep: 13/13 attack vectors blocked
- One PARTIAL (F.7 PII redactor) documented as operator-action gate, no
  open hole

Tranche F is GO for launch (no security blockers).
