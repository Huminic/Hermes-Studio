# AUTONOMOUS TESTING PLAN — Huminic Studio launch closeout

**Date:** 2026-06-01
**Executor:** the implementation agent (Claude Opus 4.7) running headless + headed via vitest, Playwright MCP, and direct API calls against the production deployment.
**Format:** machine-runnable. Every ATC- case has: target (file path / URL / API), preconditions, command/script, pass criteria, evidence target, AC binding.

**Test case id format:** `ATC-<class>-<seq>` where class is one of `VT` (vitest), `PW` (Playwright headed), `API` (direct API / MCP), `CMS` (comms round-trip), `PEN` (pen-test), `BR` (Brain / DSG / KSG verification), `INV` (invariant / drift check).

**Coverage matrix** at the bottom — every AC-* in `ACCEPTANCE_CRITERIA.md` traces to ≥1 ATC- case.

**Test execution location:** all tests run against the deployed system at `https://studio.huminic.app` unless the test is a pure unit-level test that only makes sense against the local repo (those are ATC-VT-* cases that run `pnpm test` against the working tree).

---

## Section A — vitest (`pnpm test`)

Tests added to `src/test/` during closeout execution. Each new module gets a vitest file; existing files extended where the new code touches them.

### ATC-VT-001 — Password reset request endpoint
- **Target:** `src/server/password-reset.ts` + `src/routes/api/auth/reset-request.ts`
- **Preconditions:** P-CZ-004 done.
- **Test:** `src/test/password-reset-request.test.ts`
  - issues token for known email; persists scrypt-hashed entry with 15-min TTL
  - returns 200 + no-leak body for unknown email (anti-enumeration)
  - rejects invalid email format
  - dispatches via `comms_send_email` (mocked at the central-mcp boundary)
- **Pass:** vitest exits 0 with these new tests included.
- **Evidence:** `EVIDENCE_INDEX.md#atc-vt-001` → vitest run id + diff against `src/test/`.
- **AC:** AC-A-003

### ATC-VT-002 — Password reset confirm endpoint
- **Target:** `src/routes/api/auth/reset-confirm.ts`
- **Test:** `src/test/password-reset-confirm.test.ts`
  - valid {token, new_password} updates target auth.yaml + invalidates token
  - expired token (>15 min) rejected
  - re-used token rejected
  - new_password too short rejected
- **Pass:** vitest 0.
- **Evidence:** `EVIDENCE_INDEX.md#atc-vt-002`.
- **AC:** AC-A-004, AC-A-005

### ATC-VT-003 — Engagement-state writeback
- **Target:** `src/server/consultative-engine.ts` (post P-SRS-C1 change)
- **Test:** `src/test/consultative-engagement-state-writeback.test.ts`
  - phase transition writes to engagement-state.yaml
  - readiness gate approval is persisted with approver + timestamp
  - failure mid-transition leaves the YAML at the last successfully-persisted stage
- **Pass:** vitest 0.
- **Evidence:** `EVIDENCE_INDEX.md#atc-vt-003`.
- **AC:** AC-CA-004

### ATC-VT-004 — Skill activation real path (per-retained-skill)
- **Target:** each TS skill module from P-SRS-D2-B
- **Test:** one vitest per retained skill verifying it orchestrates its declared MCP tools and writes an audit row.
- **Pass:** vitest 0; ≥1 audit row per skill invoked in test.
- **Evidence:** `EVIDENCE_INDEX.md#atc-vt-004`.
- **AC:** AC-PS-002, AC-PS-003

### ATC-VT-005 — Data tab renderer (or hide)
- **Target:** new renderer module from P-SRS-D3 OR removal verification.
- **Test:** if renderer: vitest covers `brain_query` + `mcp_rollup_query` data shape rendering; if removed: vitest covers absence-of-Data-tab in storefront nav per profile.
- **Pass:** vitest 0.
- **Evidence:** `EVIDENCE_INDEX.md#atc-vt-005`.
- **AC:** AC-DR-001

### ATC-VT-006 — Federation (MindsDB or remove)
- **Target:** per P-SRS-D4 decision.
- **Test:** if MindsDB: vitest covers `federation_query` against a real MindsDB endpoint; if removed: vitest covers absence of the tool from `tools/list`.
- **Pass:** vitest 0.
- **Evidence:** `EVIDENCE_INDEX.md#atc-vt-006`.
- **AC:** AC-DR-003

### ATC-VT-007 — PII redactor default
- **Target:** new redactor module from P-SRS-F7.
- **Test:** vitest covers regex SSN/CC/email redaction + opt-in NER hook.
- **Pass:** vitest 0.
- **Evidence:** `EVIDENCE_INDEX.md#atc-vt-007`.
- **AC:** AC-DR-006

### ATC-VT-008 — Rollup dashboard data path
- **Target:** rollup renderer (post P-SRS-E) or removal verification.
- **Test:** vitest covers `mcp_rollup_query` returning per-authorized-child data; unauthorized child denied.
- **Pass:** vitest 0.
- **Evidence:** `EVIDENCE_INDEX.md#atc-vt-008`.
- **AC:** AC-DR-002

### ATC-VT-009 — Full vitest baseline + closeout
- **Target:** every vitest file.
- **Test:** `pnpm test`.
- **Pass:** all tests pass; expected count ≥ 473 baseline + new closeout cases (target ≥ 490).
- **Evidence:** `EVIDENCE_INDEX.md#atc-vt-009` → output of `pnpm test` final run.
- **AC:** AC-TE-006

---

## Section B — Playwright headed (`@playwright/test`)

Each ATC-PW-* is a Playwright spec that runs against `https://studio.huminic.app` in headed mode. Traces saved to `tests/traces/<atc-id>/`.

### ATC-PW-001 — Studio admin login + dashboard render
- **URL:** `https://studio.huminic.app/login`
- **Steps:** fill duane / HuminicValidation2026!; assert dashboard loads.
- **Pass:** screenshot of dashboard; no console errors.
- **Evidence:** trace + screenshot path.
- **AC:** AC-A-001

### ATC-PW-002 — Per-profile storefront login + 6-tab nav
- **URL:** `https://studio.huminic.app/p/<slug>` for each launch-scope profile.
- **Steps:** login with per-profile credentials; assert 6-tab nav with profile branding.
- **Pass:** screenshot per profile.
- **AC:** AC-P-002, AC-P-003, AC-A-001

### ATC-PW-003 — Wrong-tenant denial
- **Steps:** logged in as `kim` on strukture, navigate to `/p/huminic/chat`.
- **Pass:** 403 OR redirect to strukture login.
- **AC:** AC-P-004, AC-SC-006

### ATC-PW-004 — Wrong-role denial
- **Steps:** logged in as `kim`, navigate to `/profiles`.
- **Pass:** 403 / redirect.
- **AC:** AC-S-004, AC-SC-001

### ATC-PW-005 — Studio admin CRUD on custom agent
- **Steps:** create + edit + delete a test agent via `/agents`.
- **Pass:** each step succeeds with API confirmation + audit row.
- **AC:** AC-S-001, AC-S-003

### ATC-PW-006 — Wiki editor save round-trip
- **Steps:** edit a draft markdown file via `/files`; save; reload.
- **Pass:** content persists.
- **AC:** AC-S-005, AC-S-006

### ATC-PW-007 — KSG denial via UI
- **Steps:** as customer-admin, attempt to save into `canon/`.
- **Pass:** UI shows KSG denial; audit row written.
- **AC:** AC-SG-001, AC-SG-007

### ATC-PW-008 — Password reset full flow
- **Steps:** click "Forgot password?"; submit known email; intercept email link via Resend test mode OR mailbox poll; complete reset; log in with new password.
- **Pass:** new password works; old password fails.
- **AC:** AC-A-003..A-007

### ATC-PW-009 — Storefront Chat → reply → chat_records
- **Steps:** as customer-admin, send a chat; assert reply received; query brain.chat_records for the round-trip.
- **Pass:** chat_records row created.
- **AC:** AC-DR-009, AC-S-002

### ATC-PW-010 — Storefront Knowledge save (drafts/)
- **Steps:** as customer-admin, edit a `knowledge/drafts/*.md` via Knowledge tab; save.
- **Pass:** save succeeds; KSG audit row.
- **AC:** AC-S-006

### ATC-PW-011 — Storefront Tools / Widget edit
- **Steps:** edit widget greeting; save; visit public `/w/<slug>`; verify new greeting visible.
- **Pass:** round-trip.
- **AC:** AC-S-002

### ATC-PW-012 — Storefront Data tab (post P-SRS-D3)
- **Steps:** open Data tab; assert charts render OR tab is hidden per the D-decision.
- **Pass:** matches decision.
- **AC:** AC-DR-001

### ATC-PW-013 — Storefront Comms inbox + reply
- **Steps:** open Comms; switch Sales/Service; pick thread; reply; verify SSE update.
- **Pass:** UI responds without manual reload.
- **AC:** AC-CM-003, AC-S-002

### ATC-PW-014 — Storefront Campaigns schedule
- **Steps:** new Service campaign; pick template; build audience; schedule for now+1min; wait; verify deliveries.
- **Pass:** campaign completes; deliveries land.
- **AC:** AC-S-002, AC-CM-003

### ATC-PW-015 — Storefront Consult sub-page (huminic)
- **Steps:** open Tools → Consult on `/p/huminic`; advance one phase; sign one gate.
- **Pass:** persisted in engagement-state.yaml.
- **AC:** AC-CA-004, AC-CA-005

### ATC-PW-016 — Engagements detail view
- **Steps:** open `/engagements/huminic`; verify stage progress + readiness gates + deployment notes + assumptions all render.
- **Pass:** every section present and clickable.
- **AC:** AC-CA-006

### ATC-PW-017 — Audit page filterable
- **Steps:** `/audit`; filter by today.
- **Pass:** rows from this session present.
- **AC:** AC-SC-004

### ATC-PW-018 — Surface sweep (broken-link audit)
- **Steps:** systematically navigate every reachable admin + storefront route; assert no 404, no console error.
- **Pass:** clean across surfaces.
- **Evidence:** route → status map dumped to `tests/traces/atc-pw-018/route-sweep.json`.
- **AC:** AC-S-009, AC-G-003, AC-G-004

---

## Section C — Direct API / MCP

These run as `curl`/`fetch` scripts with a real token. Saved under `scripts/launch-eval/`.

### ATC-API-001 — `/api/plugins` reflects only real plugins
- **Call:** `curl --cookie <session> https://studio.huminic.app/api/plugins`
- **Pass:** every plugin in response has a real implementation; `issues: []`.
- **AC:** AC-PS-001, AC-PS-004

### ATC-API-002 — `/api/brain/readiness?profile=*` for every launch-scope profile
- **Call:** loop GET against each profile slug.
- **Pass:** `{ok:true, schema_version:N, metadata_substrate_present:true}` per profile.
- **AC:** AC-SG-005, AC-P-001

### ATC-API-003 — `/api/mcp/<profile>` `tools/list` for every launch-scope profile
- **Call:** POST with Bearer per-profile token, body `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`.
- **Pass:** expected tool catalog per profile (wiki/brain/comms/federation/admin/rollup). Federation tool present iff P-SRS-D4 chose real MindsDB.
- **AC:** AC-PS-001, AC-CM-004, AC-DR-003

### ATC-API-004 — Password reset request: anti-enumeration
- **Call:** POST `/api/auth/reset-request` with known + unknown email.
- **Pass:** both 200; only known triggers email.
- **AC:** AC-A-003

### ATC-API-005 — Password reset confirm: expired token
- **Call:** generate token; wait 16 minutes (or set TTL to 1 minute for the test); POST confirm.
- **Pass:** 4xx with "expired".
- **AC:** AC-A-004

### ATC-API-006 — Engagements API
- **Call:** GET `/api/engagements` as admin.
- **Pass:** returns array with every customer engagement-state.yaml present.
- **AC:** AC-CA-004

### ATC-API-007 — Federation read scope denial
- **Call:** with a token lacking the rollup scope, call `mcp_rollup_query`.
- **Pass:** denial with rule id `cross-profile-write-denied` or equivalent.
- **AC:** AC-SC-002, AC-DR-002

### ATC-API-008 — Tools list omits any removed/deferred tools
- **Call:** as ATC-API-003 across all profiles; diff against pre-closeout baseline.
- **Pass:** every removed tool is absent from every profile's list.
- **AC:** AC-G-002

---

## Section D — Comms round-trips (`scripts/launch-eval/`)

### ATC-CMS-001 — Email via MCP-mediated path
- **Call:** POST `/api/mcp/huminic` `tools/call comms_send_email` with `{to: duanekwells@gmail.com, subject: "ATC-CMS-001", html: "MCP-mediated"}` using a real per-profile MCP token.
- **Pass:** 200 with email_id; comms_log row written; metadata_audit row written; email arrives.
- **Evidence:** email_id + comms_log row id + audit row id + screenshot.
- **AC:** AC-CM-004, AC-CM-005

### ATC-CMS-002 — SMS via MCP-mediated path
- **Call:** as ATC-CMS-001 with `comms_send_sms` + `{to: +14126546500, text: "ATC-CMS-002"}`.
- **Pass:** SignalWire message id + comms_log + audit + delivery.
- **AC:** AC-CM-004, AC-CM-005

### ATC-CMS-003 — Voice via MCP-mediated path
- **Call:** `comms_initiate_call`.
- **Pass:** call sid + comms_log + audit + actual ring.
- **AC:** AC-CM-004, AC-CM-005

### ATC-CMS-004 — Rate cap denial
- **Call:** loop ATC-CMS-001 within 60s.
- **Pass:** ≥1 denial with rate-limit reason; audit row.
- **AC:** AC-CM-007

### ATC-CMS-005 — Allowlist denial
- **Call:** with `EMAIL_ALLOWED_USERS=duanekwells@gmail.com` set, send to `random@example.com`.
- **Pass:** denied; audit row.
- **AC:** AC-CM-007

### ATC-CMS-006 — Elliott → Huminic Motors → ADF round-trip
- **Call:** trigger a Vapi call (via dashboard or test); webhook POSTs to `/api/webhooks/vapi/huminic-motors`; parse → ADF → email.
- **Pass:** ADF email at neoweaver@gmail.com; webhook 200 in logs.
- **AC:** AC-CM-001, AC-CM-003

---

## Section E — Pen-test sweep (regression)

### ATC-PEN-001 — Re-run F.9 13-vector pen-test
- **Target:** `src/test/pen-test-sweep.test.ts`
- **Test:** `pnpm test src/test/pen-test-sweep.test.ts`
- **Pass:** 13/13 vectors blocked. No new finding.
- **AC:** AC-SC-008

### ATC-PEN-002 — Cross-profile brain_query (without wildcard)
- **Target:** API call from a profile-A-scoped token attempting `brain_query` against profile-B.
- **Pass:** denied.
- **AC:** AC-SC-006

### ATC-PEN-003 — Wiki canon write attempt as customer-admin
- **Target:** customer-admin scoped token attempting wiki_write into `canon/`.
- **Pass:** denied with `protected-tree`.
- **AC:** AC-SG-007

### ATC-PEN-004 — Upload filename traversal
- **Target:** POST upload with filename `../../../etc/passwd`.
- **Pass:** sanitized; recorded with clean name.
- **AC:** AC-SC-009

### ATC-PEN-005 — DSG denial leaves audit row with no payload leak
- **Target:** trigger a DSG denial; inspect audit row.
- **Pass:** rule id + outcome=denied present; payload secrets absent.
- **AC:** AC-SC-009

### ATC-PEN-006 — Federation error does not embed query text
- **Target:** trigger a federation error; inspect response.
- **Pass:** query text not present in error body.
- **AC:** AC-SC-009

---

## Section F — Brain / DSG / KSG verification

### ATC-BR-001 — Brain record families populated
- **Target:** `brain.db` for a profile that ran HTC-CA-001 (fictitious-customer).
- **Test:** SQL query for each of the 19 record families; assert ≥0 rows for optional ones, ≥1 row for required ones (events, entities, observations, outputs, source_references, metadata_audit, chat_records, assumptions, lookup_misses, hunches, adjacent_neighbors, embeddings, suggested_knowledge_changes).
- **Pass:** all required families have ≥1 row.
- **AC:** AC-G-001 (SRS 8.1.3)

### ATC-BR-002 — Reconciliation flow on canon conflict
- **Target:** brain.reconciliation_items.
- **Test:** trigger contradiction; query for reconciliation_item row; resolve through governed path; verify state transitions.
- **Pass:** lifecycle complete.
- **AC:** AC-SG-006

### ATC-BR-003 — Hunches lifecycle
- **Target:** brain.hunches.
- **Test:** SOUL change → hunch opened → reviewed → closed.
- **Pass:** lifecycle complete.
- **AC:** AC-SG-009

### ATC-BR-004 — Memory layer reconstruction
- **Target:** `src/server/memory-layer.ts` `reconstructDecision`.
- **Test:** pick a chat from chat_records; call reconstruct; verify the response includes the chat's adjacent neighbors + decision context.
- **Pass:** reconstruction returns expected shape.
- **AC:** AC-G-001 (SRS 8.1.3)

### ATC-BR-005 — Embeddings retrieval
- **Target:** `searchSimilar`.
- **Test:** insert ≥3 embeddings; query for nearest neighbor.
- **Pass:** ranked results, top hit matches expected.
- **AC:** AC-DR-005

### ATC-BR-006 — Migration drift detection
- **Target:** brain-schema.ts migration loader.
- **Test:** edit a migration's SQL in a sandbox copy of brain.db; attempt mount; verify rejection.
- **Pass:** mount fails with checksum mismatch.
- **AC:** AC-DR-007

### ATC-BR-007 — Brain backup/restore round-trip
- **Target:** `backupBrain` + `restoreBrain`.
- **Test:** backup a profile's brain; restore to a sandbox path; verify equality + no cross-profile leak.
- **Pass:** restored equal; no neighbor profile rows present.
- **AC:** AC-DR-008

### ATC-BR-008 — Chat memorialization
- **Target:** brain.chat_records.
- **Test:** during ATC-PW-009, query chat_records; assert the round-trip is captured.
- **Pass:** row present with both turns.
- **AC:** AC-DR-009

---

## Section G — Invariant checks

### ATC-INV-001 — No Hermes core fork
- **Test:** read `docker/agent/Dockerfile`; assert the pinned upstream commit string matches the documented value in `DECISIONS.log`.
- **Pass:** match.
- **AC:** AC-PS-005

### ATC-INV-002 — No fourth cross-profile access surface
- **Test:** grep the codebase for new cross-profile access entry points; cross-reference against the documented three.
- **Pass:** zero new surfaces.
- **AC:** AC-G-001 (per data architect handoff #8)

### ATC-INV-003 — All 24+ MCP tools documented
- **Test:** tools/list output vs descriptors in `src/server/*-mcp-handlers.ts`; assert every tool has a description.
- **Pass:** every tool documented.
- **AC:** AC-PS-001

### ATC-INV-004 — Sixth wiki invariant present on every launch-scope profile
- **Test:** `/api/brain/readiness?profile=<slug>` for each launch-scope profile; assert `metadata_substrate_present: true`.
- **Pass:** all true.
- **AC:** AC-SG-005

### ATC-INV-005 — KSG/DSG share one audit log
- **Test:** verify both gates write to `~/.hermes/mcp-audit.log`; cross-correlate row counts vs activity.
- **Pass:** counts match.
- **AC:** AC-SG-002

---

## Test execution sequence

Run order during the closeout (each step blocks the next on failure):

1. **Local vitest baseline** (`pnpm test` on the working tree).
2. **Implement P-CZ-* + P-SRS-* code changes.**
3. **Local vitest after each new module.**
4. **Deploy (Coolify redeploy).**
5. **ATC-API-* + ATC-INV-* against the deployed system (verify env state).**
6. **ATC-BR-* (Brain + DSG/KSG verification).**
7. **ATC-CMS-* (comms round-trips with real artifacts).**
8. **ATC-PW-* (Playwright headed, in order from login → admin CRUD → storefront → KSG/DSG denial → password reset → surface sweep).**
9. **ATC-PEN-* (final pen-test sweep).**
10. **ATC-VT-009 (final full vitest).**
11. **If anything fails: create P-FIX-<seq>; fix; re-run affected suites; re-run regression.**
12. **EVIDENCE_INDEX.md updated as tests pass.**

---

## Coverage matrix (AC → ATC)

| AC id | Covered by ATC- |
|---|---|
| AC-G-001 | ATC-BR-001, ATC-BR-004, ATC-INV-002 |
| AC-G-002 | ATC-API-008, ATC-VT-005, ATC-VT-006 |
| AC-G-003 | ATC-PW-018 |
| AC-G-004 | ATC-PW-001..018 |
| AC-G-005 | ATC-INV-001..005 |
| AC-P-001 | ATC-API-002 |
| AC-P-002 | ATC-PW-002 |
| AC-P-003 | ATC-PW-002 |
| AC-P-004 | ATC-PW-003, ATC-PEN-002 |
| AC-P-005 | (recorded in EVIDENCE_INDEX.md#dealer-universe; ATC-API-002 verifies) |
| AC-A-001 | ATC-PW-001, ATC-PW-002 |
| AC-A-002 | (P-CZ-006 disposition + ATC-PW-002 if portal active) |
| AC-A-003 | ATC-VT-001, ATC-API-004 |
| AC-A-004 | ATC-VT-002, ATC-API-005 |
| AC-A-005 | ATC-VT-002, ATC-PW-008 |
| AC-A-006 | ATC-PW-008 |
| AC-A-007 | ATC-PW-008 |
| AC-S-001 | ATC-PW-005 |
| AC-S-002 | ATC-PW-009..016 |
| AC-S-003 | ATC-PW-005, ATC-PW-006 |
| AC-S-004 | ATC-PW-004 |
| AC-S-005 | ATC-PW-006 |
| AC-S-006 | ATC-PW-007, ATC-PW-010 |
| AC-S-007 | ATC-BR-005 |
| AC-S-008 | ATC-API-003 |
| AC-S-009 | ATC-PW-018 |
| AC-CA-001 | ATC-VT-003, HTC-CA-001 |
| AC-CA-002 | (frontmatter assertion in HTC-CA-002 + ATC-BR-001) |
| AC-CA-003 | ATC-INV-004 |
| AC-CA-004 | ATC-VT-003, ATC-PW-015 |
| AC-CA-005 | ATC-API-003 |
| AC-CA-006 | ATC-PW-016, ATC-BR-001 |
| AC-CA-007 | ATC-BR-001 (suggested_knowledge_changes row) |
| AC-CA-008 | HTC-CA-005 + decision in `DECISIONS.log` |
| AC-SG-001 | ATC-PW-007, ATC-PEN-003 |
| AC-SG-002 | ATC-INV-005 |
| AC-SG-003 | ATC-BR-001 (assumptions row check) |
| AC-SG-004 | ATC-PEN-005 |
| AC-SG-005 | ATC-INV-004 |
| AC-SG-006 | ATC-BR-002 |
| AC-SG-007 | ATC-PEN-003, ATC-PEN-002 |
| AC-SG-008 | ATC-PW-017 |
| AC-SG-009 | ATC-BR-003 |
| AC-PS-001 | ATC-API-001, ATC-INV-003 |
| AC-PS-002 | ATC-VT-004 |
| AC-PS-003 | ATC-VT-004 |
| AC-PS-004 | ATC-API-001 |
| AC-PS-005 | ATC-INV-001 |
| AC-DR-001 | ATC-VT-005, ATC-PW-012 |
| AC-DR-002 | ATC-VT-008 |
| AC-DR-003 | ATC-VT-006, ATC-API-003 |
| AC-DR-004 | ATC-PEN-004 |
| AC-DR-005 | ATC-BR-005 |
| AC-DR-006 | ATC-VT-007 |
| AC-DR-007 | ATC-BR-006 |
| AC-DR-008 | ATC-BR-007 |
| AC-DR-009 | ATC-PW-009, ATC-BR-008 |
| AC-CM-001 | ATC-CMS-006 |
| AC-CM-002 | (HTC-NX-004 disposition + ATC-API-003 absence check if hidden) |
| AC-CM-003 | ATC-CMS-002, ATC-CMS-006 |
| AC-CM-004 | ATC-CMS-001..003 |
| AC-CM-005 | ATC-CMS-001..003 |
| AC-CM-006 | ATC-CMS-004 |
| AC-CM-007 | ATC-CMS-004, ATC-CMS-005 |
| AC-SC-001 | ATC-PW-004 |
| AC-SC-002 | ATC-API-007 |
| AC-SC-003 | ATC-PEN-003 |
| AC-SC-004 | ATC-PW-017 |
| AC-SC-005 | ATC-VT-008 |
| AC-SC-006 | ATC-PEN-002, ATC-PW-003 |
| AC-SC-007 | (per-item F.1-F.8 evidence recorded in tranche-f report + ATC-PEN-001 re-run) |
| AC-SC-008 | ATC-PEN-001 |
| AC-SC-009 | ATC-PEN-004, ATC-PEN-005, ATC-PEN-006 |
| AC-TE-001 | (HUMAN_TESTING_SCRIPT.md committed) |
| AC-TE-002 | (this file committed) |
| AC-TE-003 | (ATC-VT-009 + all ATC-PW + ATC-CMS run logs) |
| AC-TE-004 | (P-FIX cycle + ATC-VT-009 re-run after fix) |
| AC-TE-005 | (EVIDENCE_INDEX.md zero-unresolved) |
| AC-TE-006 | ATC-VT-009 |
| AC-TE-007 | ATC-PW-001..018 |
| AC-TE-008 | ATC-PEN-005 |
| AC-CP-001..006 | (CHECKPOINT_PROOF.md committed) |
| AC-FC-001..005 | (LAUNCH_CLOSEOUT_REPORT.md final) |

---

## Implementation note

This is a PLAN. Implementation of the actual test specs/scripts is part of execution Phase 5 (P-TEST-001 + P-TEST-002). The test files themselves land under `src/test/` (vitest) and `tests/playwright/` (Playwright). The launch-eval scripts land under `scripts/launch-eval/`.
