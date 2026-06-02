# PLAN — Huminic Studio launch closeout (canonical)

**Date:** 2026-06-01
**Status:** ACTIVE — supersedes every prior plan document (see `docs/archive/2026-06-01/`)
**Mode:** Closeout + verification + launch-readiness
**Owner:** Implementation agent (Claude Opus 4.7); operator = Duane Wells
**Exit condition:** every AC-* in `ACCEPTANCE_CRITERIA.md` is GREEN with evidence in `EVIDENCE_INDEX.md`.

This plan absorbs the entire issues.md backlog (now archived to `docs/archive/2026-06-01/issues.md` after this plan is committed) plus every Section 4 + 5 line in the closeout prompt.

---

## Task id legend

| Prefix | Meaning |
|---|---|
| `P-CP-*` | Checkpoint task (Section 0.5) |
| `P-ENV-*` | Environment audit / discovery |
| `P-CZ-*` | CZ portal closeout (002–009) |
| `P-SRS-*` | SRS partial closeout (C1, D2, D3, D4, E, F7, G) |
| `P-SUR-*` | Surface-by-surface verification (Studio screens, plugins, skills, guardians, brain, comms) |
| `P-TEST-*` | Test execution (autonomous + human) |
| `P-FIX-*` | Defect fix (created on discovery during P-SUR / P-TEST) |
| `P-RPT-*` | Reporting / closeout |
| `P-OP-*` | Operator-action-gated, scheduled with fallback per Section 0.5 |

---

## Phase 0 — Checkpoint (executes 2026-06-01, must commit before any execution)

| id | task | owner | status | dep | evidence target | AC binding |
|---|---|---|---|---|---|---|
| P-CP-001 | Inventory + archive distracting plan/scratch docs into `docs/archive/2026-06-01/` | agent | done | — | `docs/archive/2026-06-01/README.md` + commit | AC-CP-005 |
| P-CP-002 | Write canonical `docs/launch/PLAN.md` (this file) | agent | done | P-CP-001 | this file in git | AC-CP-001 |
| P-CP-003 | Write `docs/launch/ACCEPTANCE_CRITERIA.md` + AGENTS.md session-start hook | agent | done | P-CP-001 | both files in git | AC-CP-002, AC-CP-006 |
| P-CP-004 | Write `docs/launch/HUMAN_TESTING_SCRIPT.md` with coverage matrix | agent | done | P-CP-003 | file in git | AC-TE-001, AC-CP-004 |
| P-CP-005 | Write `docs/launch/AUTONOMOUS_TESTING_PLAN.md` with coverage matrix | agent | done | P-CP-003 | file in git | AC-TE-002, AC-CP-004 |
| P-CP-006 | Write `docs/launch/CHECKPOINT_PROOF.md` (zero unresolved entries) | agent | done | P-CP-002..005 | file in git | AC-CP-003 |
| P-CP-007 | Initialize `DECISIONS.log`, `EVIDENCE_INDEX.md`, `EXECUTION_CHECKLIST.md`, `LAUNCH_CLOSEOUT_REPORT.md` skeleton | agent | done | P-CP-003 | files in git | AC-CP-002 |
| P-CP-008 | Commit + post checkpoint completion message | agent | done | P-CP-001..007 | commit id in DECISIONS.log | AC-CP-001..006 |

---

## Phase 1 — Environment audit (executes after checkpoint)

| id | task | owner | status | dep | evidence target | AC binding |
|---|---|---|---|---|---|---|
| P-ENV-001 | Audit current production container state (image hash, env vars set, ports, volume mounts) | agent | pending | P-CP-008 | `EVIDENCE_INDEX.md#env-state` | AC-G-005 |
| P-ENV-002 | Audit all 15+ production profiles on the volume; record which have auth.yaml, studio.yaml, mcp.json, distribution.yaml, brain.db | agent | pending | P-CP-008 | `EVIDENCE_INDEX.md#profile-state` | AC-P-001, AC-P-005 |
| P-ENV-003 | Resolve the 5-vs-6-vs-7 dealer ambiguity: identify the canonical launch-scope dealer universe with rationale | agent | pending | P-ENV-002 | `EVIDENCE_INDEX.md#dealer-universe` | AC-P-005 |
| P-ENV-004 | Audit Coolify state (domain list, env vars, env-var-API endpoint that actually works) | agent | pending | P-CP-008 | `EVIDENCE_INDEX.md#coolify-state` | AC-A-002 |
| P-ENV-005 | Verify HERMES_PASSWORD, CENTRAL_MCP_TOKEN, CENTRAL_MCP_URL, CENTRAL_MCP_STUDIO_TOKEN, OPENROUTER_API_KEY, HERMES_API_URL are set durably | agent | pending | P-ENV-001 | `EVIDENCE_INDEX.md#secrets-set` | AC-G-005 |
| P-ENV-006 | Run vitest baseline + capture passing count; verify build clean | agent | pending | P-CP-008 | `EVIDENCE_INDEX.md#vitest-baseline` | AC-TE-006 |

---

## Phase 2 — CZ closeout (portal cutover items folded into prior plan but never delivered)

| id | task | owner | status | dep | evidence target | AC binding |
|---|---|---|---|---|---|---|
| P-CZ-002 | Provision the canonical-list dealer placeholder auth.yaml accounts on production volume | agent | pending | P-ENV-003 | `EVIDENCE_INDEX.md#cz-002-dealer-auth` | AC-P-001, AC-P-002, AC-P-003 |
| P-CZ-003 | Create huminic-motors test profile (profile dir + studio.yaml teal + auth.yaml for `neoweaver@gmail.com` + Elliott agent SOUL with `enabled: true` + lead_notifications.adf_email) | agent | pending | P-ENV-002 | `EVIDENCE_INDEX.md#cz-003-huminic-motors` | AC-CM-001, AC-P-001 |
| P-CZ-004 | Implement `src/server/password-reset.ts` (token registry, 15-min TTL, scrypt-hashed single-use tokens) + `src/routes/api/auth/reset-request.ts` (POST {email}) | agent | pending | — | `EVIDENCE_INDEX.md#cz-004-reset-endpoint` | AC-A-003 |
| P-CZ-005 | Implement `src/routes/api/auth/reset-confirm.ts` (POST {token, new_password}) + `src/routes/reset.tsx` page | agent | pending | P-CZ-004 | `EVIDENCE_INDEX.md#cz-005-reset-page` | AC-A-004, AC-A-005 |
| P-CZ-006 | Add `portal.huminic.app` to Coolify app domains via API + Cloudflare DNS verify + `PORTAL_HOST` env var + redeploy OR conclude portal hostname is launch-deferred and remove it from any user-visible surface | agent + operator | pending | P-ENV-004 | `EVIDENCE_INDEX.md#cz-006-portal-domain` | AC-A-002 |
| P-CZ-007 | Run end-to-end password-reset canary against the huminic-motors profile (request → email → click → form → confirm → login with new password) | agent | pending | P-CZ-002, P-CZ-005 | `EVIDENCE_INDEX.md#cz-007-reset-canary` | AC-A-006, AC-A-007 |
| P-CZ-008 | Vapi Elliott → Huminic Motors inbound webhook → ADF parse → email round-trip with real Vapi assistant id + transcript | agent + operator | pending | P-CZ-003 | `EVIDENCE_INDEX.md#cz-008-elliott-adf` | AC-CM-001, AC-CM-003 |
| P-CZ-009 | Update `docs/cutover-ritual.md` for the actual portal flow (generic login + Huminic Motors canary + password reset flow + canonical dealer universe) | agent | pending | P-CZ-007 | git diff on cutover-ritual.md | AC-G-002 |

---

## Phase 3 — SRS partial closeout

| id | task | owner | status | dep | evidence target | AC binding |
|---|---|---|---|---|---|---|
| P-SRS-C1 | Add `writeEngagementState(profile, state)` to consultative-engine + call it at each phase transition + add vitest covering phase-transition persistence | agent | pending | P-ENV-006 | `EVIDENCE_INDEX.md#srs-c1-engagement-writeback` | AC-CA-004 |
| P-SRS-D2-A | Audit the 13 SKILL.md scaffolds and decide per-skill: implement real TS skill OR remove the scaffold from launch surface | agent | pending | P-ENV-002 | `EVIDENCE_INDEX.md#srs-d2-skill-disposition` | AC-PS-002, AC-G-002 |
| P-SRS-D2-B | Implement the skills retained in launch scope as real modules wired to MCP tools; remove the ones not in scope (delete dir + remove from skill registry + grep clean) | agent | pending | P-SRS-D2-A | `EVIDENCE_INDEX.md#srs-d2-skills-real` | AC-PS-002, AC-PS-003 |
| P-SRS-D3 | Decide D.3 path (plugin-native recharts renderer OR Metabase sidecar) and ship a real renderer for the customer Data tab OR hide the Data tab from the customer storefront for launch | agent + operator | pending | P-ENV-006 | `EVIDENCE_INDEX.md#srs-d3-data-tab` | AC-DR-001, AC-G-002 |
| P-SRS-D4 | Decide D.4 path (deploy MindsDB sidecar via Coolify OR hide `federation_query` from launch tool surface) | agent + operator | pending | P-ENV-004 | `EVIDENCE_INDEX.md#srs-d4-federation` | AC-DR-003, AC-G-002 |
| P-SRS-E | Build Huminic-the-company rollup dashboard UI OR hide the rollup surface from operator-visible launch scope | agent | pending | P-SRS-D3 | `EVIDENCE_INDEX.md#srs-e-rollup-ui` | AC-DR-002, AC-G-002 |
| P-SRS-F7 | Implement default PII redactor for embeddings (regex SSN/CC/email + optional NER hook) OR confirm the redactor is gated by an operator-explicit env switch and remote embedding models cannot be enabled without it | agent | pending | P-ENV-006 | `EVIDENCE_INDEX.md#srs-f7-pii-redactor` | AC-DR-006 |
| P-SRS-G | Re-issue ≥1 production comms call (email + SMS + voice) through `comms_send_*` via `/api/mcp/$profile` with a real customer token; capture audit log + comms_log row as evidence | agent | pending | P-CZ-002 | `EVIDENCE_INDEX.md#srs-g-mcp-mediated-comms` | AC-CM-004, AC-CM-005 |

---

## Phase 4 — Surface-by-surface verification

These are the per-surface verification tasks. Each surface produces (a) a usability description, (b) a technical composition description, (c) a CRUD + interaction validation log, (d) a role validation log, (e) evidence capture, all linked from EVIDENCE_INDEX.md.

### Studio shell + auth (Surface A)

| id | task | owner | status | dep | evidence target | AC binding |
|---|---|---|---|---|---|---|
| P-SUR-A-001 | Login + logout + session persistence verified for studio admin (`/login` → `/`) | agent | pending | P-ENV-005 | `EVIDENCE_INDEX.md#sur-a-001` | AC-A-001 |
| P-SUR-A-002 | Customer-admin storefront login (`/p/<slug>` → 6-tab nav) per launch-scope profile | agent | pending | P-CZ-002 | `EVIDENCE_INDEX.md#sur-a-002` | AC-A-001, AC-S-004 |
| P-SUR-A-003 | Customer-admin role cannot reach Studio admin surfaces (`/profiles`, `/agents`, `/settings/mcp-tokens`) — 403 or redirect with audit row | agent | pending | P-SUR-A-002 | `EVIDENCE_INDEX.md#sur-a-003` | AC-S-004, AC-SC-001 |
| P-SUR-A-004 | Customer-admin from profile X cannot reach `/p/<profile-Y>/*` — 403 or redirect with audit row | agent | pending | P-SUR-A-002 | `EVIDENCE_INDEX.md#sur-a-004` | AC-P-004, AC-SC-006 |
| P-SUR-A-005 | Session expiry + recovery flow (cookie invalidated → next request redirects to login) | agent | pending | P-SUR-A-001 | `EVIDENCE_INDEX.md#sur-a-005` | AC-A-001 |
| P-SUR-A-006 | Password reset flow tested for each launch-scope profile | agent | pending | P-CZ-007 | `EVIDENCE_INDEX.md#sur-a-006` | AC-A-006 |

### Studio admin screen clusters (Surface B)

Each row covers load + empty state + populated state + validation errors + permissions + CRUD + broken link audit.

| id | screen cluster | owner | status | dep | evidence target |
|---|---|---|---|---|---|
| P-SUR-B-001 | Dashboard / Operations (`/`) | agent | pending | P-SUR-A-001 | `EVIDENCE_INDEX.md#sur-b-001` |
| P-SUR-B-002 | Agent Library (`/agents`) | agent | pending | P-SUR-A-001 | `EVIDENCE_INDEX.md#sur-b-002` |
| P-SUR-B-003 | Profile / tenant switching (`/profiles`) | agent | pending | P-SUR-A-001 | `EVIDENCE_INDEX.md#sur-b-003` |
| P-SUR-B-004 | Wiki / knowledge / page editor (`/files`, `/wiki`) | agent | pending | P-SUR-A-001 | `EVIDENCE_INDEX.md#sur-b-004` |
| P-SUR-B-005 | Engagements (`/engagements`, `/engagements/$customer`) | agent | pending | P-SUR-A-001 | `EVIDENCE_INDEX.md#sur-b-005` |
| P-SUR-B-006 | Skills / plugins (`/skills`, `/api/plugins`) | agent | pending | P-SUR-A-001 | `EVIDENCE_INDEX.md#sur-b-006` |
| P-SUR-B-007 | MCP tokens (`/settings/mcp-tokens`) | agent | pending | P-SUR-A-001 | `EVIDENCE_INDEX.md#sur-b-007` |
| P-SUR-B-008 | Kanban / tasks (`/tasks`) | agent | pending | P-SUR-A-001 | `EVIDENCE_INDEX.md#sur-b-008` |
| P-SUR-B-009 | Audit / logs / observability (`/audit`, `/logs`) | agent | pending | P-SUR-A-001 | `EVIDENCE_INDEX.md#sur-b-009` |
| P-SUR-B-010 | Files / uploads (`/files`) | agent | pending | P-SUR-A-001 | `EVIDENCE_INDEX.md#sur-b-010` |

All AC bindings: AC-S-001, AC-S-003, AC-S-005, AC-S-007, AC-S-008, AC-S-009. Broken-link audits feed `EVIDENCE_INDEX.md#broken-links`.

### Customer storefront (Surface B + C overlap)

| id | screen cluster | owner | status | dep | evidence target | AC binding |
|---|---|---|---|---|---|---|
| P-SUR-B-011 | Storefront Chat tab (per profile, agent picker + chat round-trip) | agent | pending | P-SUR-A-002 | `EVIDENCE_INDEX.md#sur-b-011` | AC-S-002, AC-DR-009 |
| P-SUR-B-012 | Storefront Knowledge tab (wiki tree + Monaco editor + frontmatter panel + KSG-gated save + KSG-gated promote) | agent | pending | P-SUR-A-002 | `EVIDENCE_INDEX.md#sur-b-012` | AC-S-006, AC-SG-001 |
| P-SUR-B-013 | Storefront Tools tab + Widget sub-page (widget list + embed snippet + KSG-gated CRUD) | agent | pending | P-SUR-A-002 | `EVIDENCE_INDEX.md#sur-b-013` | AC-S-002 |
| P-SUR-B-014 | Storefront Data tab (real renderer per P-SRS-D3) | agent | pending | P-SRS-D3 | `EVIDENCE_INDEX.md#sur-b-014` | AC-DR-001 |
| P-SUR-B-015 | Storefront Comms tab (Sales/Service segments + thread list + composer + SSE) | agent | pending | P-SUR-A-002 | `EVIDENCE_INDEX.md#sur-b-015` | AC-CM-003, AC-CM-006 |
| P-SUR-B-016 | Storefront Campaigns tab (Service-only per operator decision; audience builder + scheduled-send + delivery rows back to Comms) | agent | pending | P-SUR-A-002 | `EVIDENCE_INDEX.md#sur-b-016` | AC-CM-003 |
| P-SUR-B-017 | Storefront Consult sub-page on Tools tab (huminic profile only; engagement state stage strip + readiness gates + deployment notes) | agent | pending | P-SRS-C1 | `EVIDENCE_INDEX.md#sur-b-017` | AC-CA-001, AC-CA-004 |

### Plugins / skills (Surface C)

| id | task | owner | status | dep | evidence target | AC binding |
|---|---|---|---|---|---|---|
| P-SUR-C-001 | Verify `customer-console` plugin loads cleanly on prod volume; `GET /api/plugins` returns it with no issues | agent | pending | P-ENV-002 | `EVIDENCE_INDEX.md#sur-c-001` | AC-PS-001 |
| P-SUR-C-002 | Verify `messaging-hub` plugin loads + adapters dispatch via per-profile distribution | agent | pending | P-ENV-002 | `EVIDENCE_INDEX.md#sur-c-002` | AC-PS-001 |
| P-SUR-C-003 | Verify `data-canvas` plugin manifest loads OR remove it from manifest if D.3 path is plugin-native (not Metabase sidecar) | agent | pending | P-SRS-D3 | `EVIDENCE_INDEX.md#sur-c-003` | AC-PS-002 |
| P-SUR-C-004 | Per-launch-scope skill: verify it's invokable from a real profile and produces an audit row | agent | pending | P-SRS-D2-B | `EVIDENCE_INDEX.md#sur-c-004` | AC-PS-003 |
| P-SUR-C-005 | Verify no Hermes core fork; pinned upstream commit in `docker/agent/Dockerfile` unchanged | agent | pending | P-ENV-001 | `EVIDENCE_INDEX.md#sur-c-005` | AC-PS-005 |

### Consultative agents (Surface D)

| id | task | owner | status | dep | evidence target | AC binding |
|---|---|---|---|---|---|---|
| P-SUR-D-001 | End-to-end engagement against a fresh fictitious-customer profile via the production dispatch path (POST to consultative agent through Hermes, not script-only) | agent | pending | P-SRS-C1 | `EVIDENCE_INDEX.md#sur-d-001` | AC-CA-001, AC-CA-005 |
| P-SUR-D-002 | Wiki output conformance check: every artifact has required frontmatter (`type: prescription` etc.); six invariants present | agent | pending | P-SUR-D-001 | `EVIDENCE_INDEX.md#sur-d-002` | AC-CA-002, AC-CA-003 |
| P-SUR-D-003 | Assumption surfacing exercised ≥3 times; lookup_misses + assumptions land in Brain | agent | pending | P-SUR-D-001 | `EVIDENCE_INDEX.md#sur-d-003` | AC-CA-006 |
| P-SUR-D-004 | Capability gap proposal emitted + persisted as suggested_knowledge_change | agent | pending | P-SUR-D-001 | `EVIDENCE_INDEX.md#sur-d-004` | AC-CA-007 |
| P-SUR-D-005 | Live huminic engagement round-trip (real operator advances ≥1 phase + signs ≥1 gate). May be operator-action-gated; if so, schedule with fallback. | agent + operator | pending | P-SUR-D-002 | `EVIDENCE_INDEX.md#sur-d-005` | AC-CA-004, AC-CA-008 |

### Semantic Guardians (Surface E)

| id | task | owner | status | dep | evidence target | AC binding |
|---|---|---|---|---|---|---|
| P-SUR-E-001 | KSG bypass attempt across protected trees (canon/, governance/) — DENIED, audit row written | agent | pending | P-ENV-006 | `EVIDENCE_INDEX.md#sur-e-001` | AC-SG-001, AC-SG-007 |
| P-SUR-E-002 | DSG bypass attempt (cross-tenant brain_write payload; missing source_refs; cross-profile brain_query without wildcard) — all DENIED | agent | pending | P-ENV-006 | `EVIDENCE_INDEX.md#sur-e-002` | AC-SG-001, AC-SG-007 |
| P-SUR-E-003 | Lookup_miss → assumption surfacing → operator-visible state | agent | pending | P-SUR-D-003 | `EVIDENCE_INDEX.md#sur-e-003` | AC-SG-003 |
| P-SUR-E-004 | Reconciliation flow on contradiction (write a wiki canon-conflicting page, KSG opens reconciliation_item; resolve via governed path) | agent | pending | P-SUR-E-001 | `EVIDENCE_INDEX.md#sur-e-004` | AC-SG-006 |
| P-SUR-E-005 | Metadata substrate present on every launch-scope profile (sixth invariant) — readiness probe returns ok with `metadata_substrate_present:true` | agent | pending | P-ENV-002 | `EVIDENCE_INDEX.md#sur-e-005` | AC-SG-005 |
| P-SUR-E-006 | Audit query returns ≥1 row per actor/action/target tuple touched in this run; drift observability working | agent | pending | P-SUR-E-002 | `EVIDENCE_INDEX.md#sur-e-006` | AC-SG-008 |
| P-SUR-E-007 | Hermes self-improvement watcher cron is active + opens hunches on SOUL changes | agent | pending | P-ENV-002 | `EVIDENCE_INDEX.md#sur-e-007` | AC-SG-009 |

### Wiki / Brain / Data (Surface F)

| id | task | owner | status | dep | evidence target | AC binding |
|---|---|---|---|---|---|---|
| P-SUR-F-001 | Per-profile isolation under `~/.hermes/profiles/<profile>/`; cross-profile reads denied | agent | pending | P-ENV-002 | `EVIDENCE_INDEX.md#sur-f-001` | AC-P-004 |
| P-SUR-F-002 | Wiki invariants present on every launch-scope profile | agent | pending | P-SUR-D-002 | `EVIDENCE_INDEX.md#sur-f-002` | AC-CA-003 |
| P-SUR-F-003 | Brain record families populated for fixture (events, entities, observations, outputs, transactions, tasks, retrieval_context_snapshots, reconciliation_items, suggested_knowledge_changes, hunches, lookup_misses, assumptions, chat_records, adjacent_neighbors, embeddings, uploads, comms_log, metadata_audit, source_references, self_improvement_events) | agent | pending | P-SUR-D-001 | `EVIDENCE_INDEX.md#sur-f-003` | AC-G-001 (SRS 8.1.3) |
| P-SUR-F-004 | Memory layer reconstructs decision context for an arbitrary past action | agent | pending | P-SUR-F-003 | `EVIDENCE_INDEX.md#sur-f-004` | AC-G-001 (SRS 8.1.3) |
| P-SUR-F-005 | Upload surface + DSG classification round-trip | agent | pending | P-ENV-002 | `EVIDENCE_INDEX.md#sur-f-005` | AC-DR-004 |
| P-SUR-F-006 | Embeddings pipeline functional with local-hash-v1; `searchSimilar` returns ranked results | agent | pending | P-ENV-006 | `EVIDENCE_INDEX.md#sur-f-006` | AC-DR-005 |
| P-SUR-F-007 | Schema migrations: drift detection refuses to mount altered checksum; rollback procedure exercised on a sandbox profile | agent | pending | P-ENV-006 | `EVIDENCE_INDEX.md#sur-f-007` | AC-DR-007 |
| P-SUR-F-008 | Brain backup/restore round-trip with no cross-profile leak | agent | pending | P-ENV-002 | `EVIDENCE_INDEX.md#sur-f-008` | AC-DR-008 |
| P-SUR-F-009 | Chat memorialization: every customer-admin chat round-trip lands a chat_records row | agent | pending | P-SUR-B-011 | `EVIDENCE_INDEX.md#sur-f-009` | AC-DR-009 |

### Nexxus adaptation (Surface G)

NOTE: per Section 11 of the closeout prompt, we do NOT execute the business cutover. We DO complete and test the product surfaces, profiles, auth, routes, flows, mappings, and integrations that support the adaptation.

| id | task | owner | status | dep | evidence target | AC binding |
|---|---|---|---|---|---|---|
| P-SUR-G-001 | Each canonical-launch-scope dealer profile has working storefront login + 6-tab nav | agent | pending | P-CZ-002 | `EVIDENCE_INDEX.md#sur-g-001` | AC-P-002, AC-P-003 |
| P-SUR-G-002 | Huminic Motors test profile: Elliott agent enabled, others disabled, ADF email lead_notifications wired | agent | pending | P-CZ-003 | `EVIDENCE_INDEX.md#sur-g-002` | AC-CM-001 |
| P-SUR-G-003 | Vapi → ADF webhook → email pipeline exercised end-to-end for huminic-motors | agent + operator | pending | P-CZ-008 | `EVIDENCE_INDEX.md#sur-g-003` | AC-CM-001 |
| P-SUR-G-004 | Tavus video session creation path: either ship it OR hide every Tavus surface from launch UI/manifest | agent | pending | P-SRS-D2-A | `EVIDENCE_INDEX.md#sur-g-004` | AC-CM-002, AC-G-002 |
| P-SUR-G-005 | TextMagic/SignalWire SMS adapter: send + inbound round-trip for ≥1 profile with delivery id | agent | pending | P-CZ-002 | `EVIDENCE_INDEX.md#sur-g-005` | AC-CM-003 |
| P-SUR-G-006 | VinSolutions reference path: documented or hidden; no half-advertised integration | agent | pending | P-SRS-D2-A | `EVIDENCE_INDEX.md#sur-g-006` | AC-G-002 |

### Communications / 3rd party (Surface H)

| id | task | owner | status | dep | evidence target | AC binding |
|---|---|---|---|---|---|---|
| P-SUR-H-001 | `comms_send_email` via `/api/mcp/$profile` with real token; comms_log row + DSG audit row produced | agent | pending | P-SRS-G | `EVIDENCE_INDEX.md#sur-h-001` | AC-CM-004, AC-CM-005 |
| P-SUR-H-002 | `comms_send_sms` via MCP-mediated path | agent | pending | P-SRS-G | `EVIDENCE_INDEX.md#sur-h-002` | AC-CM-004, AC-CM-005 |
| P-SUR-H-003 | `comms_initiate_call` via MCP-mediated path | agent | pending | P-SRS-G | `EVIDENCE_INDEX.md#sur-h-003` | AC-CM-004, AC-CM-005 |
| P-SUR-H-004 | Rate cap enforcement: hit the per-minute cap, verify denial + comms_log row | agent | pending | P-SUR-H-001 | `EVIDENCE_INDEX.md#sur-h-004` | AC-CM-007 |
| P-SUR-H-005 | Allowlist enforcement: send to non-allowed recipient with `EMAIL_ALLOWED_USERS` set; verify denial | agent | pending | P-SUR-H-001 | `EVIDENCE_INDEX.md#sur-h-005` | AC-CM-007 |
| P-SUR-H-006 | SSE event bus carries Brain events for a fixture round-trip | agent | pending | P-ENV-006 | `EVIDENCE_INDEX.md#sur-h-006` | AC-DR-009 |

---

## Phase 5 — Test execution

| id | task | owner | status | dep | evidence target | AC binding |
|---|---|---|---|---|---|---|
| P-TEST-001 | Implement closeout vitest suites covering CZ-004/005, SRS-C1, SRS-G, SRS-D2 retained skills, SRS-D3 renderer (or hide-test) | agent | pending | Phase 2 + 3 | `EVIDENCE_INDEX.md#test-001-vitest-suites` | AC-TE-006 |
| P-TEST-002 | Implement Playwright headed suite per `AUTONOMOUS_TESTING_PLAN.md` ATC-* table | agent | pending | Phase 2 + 3 | `EVIDENCE_INDEX.md#test-002-playwright-traces` | AC-TE-007 |
| P-TEST-003 | Run full vitest suite + capture passing count; verify build clean | agent | pending | P-TEST-001 | `EVIDENCE_INDEX.md#test-003-vitest-final` | AC-TE-006 |
| P-TEST-004 | Run full Playwright suite headed; capture traces per ATC- | agent | pending | P-TEST-002 | `EVIDENCE_INDEX.md#test-004-playwright-traces` | AC-TE-007 |
| P-TEST-005 | Run audit-log verification tests (DSG/KSG denial → audit row with rule + outcome) | agent | pending | P-TEST-001 | `EVIDENCE_INDEX.md#test-005-audit-tests` | AC-TE-008 |
| P-TEST-006 | Pen-test sweep re-run (F.9 13 vectors) post-closeout to verify no regressions | agent | pending | P-TEST-003 | `EVIDENCE_INDEX.md#test-006-pentest` | AC-SC-008 |

---

## Phase 6 — Defect fix + regression

`P-FIX-*` tasks are created on demand during execution when P-SUR or P-TEST tasks discover defects. Each gets a stable id of the form `P-FIX-<seq>`, with the discovering task linked, the file path of the fix, an evidence target, and the test that proves the fix. Re-run of affected test suites is required before P-FIX is marked done.

---

## Phase 7 — Closeout report

| id | task | owner | status | dep | evidence target | AC binding |
|---|---|---|---|---|---|---|
| P-RPT-001 | Update `EXECUTION_CHECKLIST.md` with every item in the 21-item Section 8 list, statuses, owners, evidence links, blocking dependencies | agent | pending | Phase 6 done | `docs/launch/EXECUTION_CHECKLIST.md` | AC-FC-003 |
| P-RPT-002 | Update `EVIDENCE_INDEX.md` with every AC- → artifact mapping; zero unresolved cells | agent | pending | Phase 6 done | `docs/launch/EVIDENCE_INDEX.md` | AC-TE-005, AC-FC-002 |
| P-RPT-003 | Dispatch independent `code-reviewer` subagent to verify closeout claims against files | agent | pending | P-RPT-002 | review report in `docs/launch/CLOSEOUT_REVIEW.md` | AC-FC-005 |
| P-RPT-004 | Write `LAUNCH_CLOSEOUT_REPORT.md` per Section 12 (18-section format) with proof links | agent | pending | P-RPT-003 | `docs/launch/LAUNCH_CLOSEOUT_REPORT.md` | AC-FC-004 |
| P-RPT-005 | Post final completion message to operator only when AC-FC-001..005 are all GREEN | agent | pending | P-RPT-004 | final message to operator | AC-FC-001..005 |

---

## Phase 8 — Role × workflow audit + regenerated eval suite (added 2026-06-01 after operator diagnosis)

**Status:** ACTIVE. Supersedes the launch readiness claim in `LAUNCH_CLOSEOUT_REPORT.md` Section 18 (GO WITH CONDITIONS).

### Retraction

The conditional GO from `LAUNCH_CLOSEOUT_REPORT.md` is **retracted**. The prior Playwright sweep tested pages, routes, and single-actor surfaces. It did NOT test cross-actor, cross-handoff, cross-time work-completion surfaces. Operator surfaced multiple customer-blocking gaps in conversation within ten minutes of compact, confirming the prior eval covered the wrong class of behavior. "Ready" does not mean anything until both classes pass.

### Diagnosis (operator-stated, agent-acknowledged)

The gaps in the running log are not random defects. They share a category: the system was specified to operate, and the **operating layer that connects features into work that gets done across actors and across time was never fully built**. Code does the moment-to-moment thing (gate this write, render this page, run this prompt); the connective tissue between moments — workflows, handoffs, recovery paths, integrity over time — is missing in pieces. User stories surface this category of gap because they describe work-completion, not button-existence.

### Approach (minimum set; no new audit framework, no Devil's Advocate teammate yet)

1. **Role catalog** at `docs/launch/ROLES.md` — 12–15 actors, one paragraph each: identity, ownership, reads, writes, handoffs, escalation paths. Inputs: existing governor SOULs, `HUMAN_TESTING_SCRIPT.md`, this PLAN, the SRS.
2. **Workflow catalog** at `docs/launch/WORKFLOWS.md` — 3–5 workflows per actor, one sentence each, concrete, covering every user surface the operator enumerated (see Actor inventory below). No prose padding.
3. **Gap pass.** For every workflow, one question: *what has to be true for this to work end-to-end in the running system today?* If nothing is missing → mark green. If the answer involves manual steps no actor owns, missing endpoints, missing bindings, missing handoffs, missing recovery paths, or missing agents → log as a new `GAP-*` row in the running log below.
4. **Regenerate the Playwright eval suite against workflow surfaces (not pages).** Headed + headless. Real transactions across Vapi / TextMagic / Tavus / Studio-mediated MCP comms path / federation scopes / ADF webhook round-trip / password reset canary / Provisioner end-to-end / KSG integrity scan / DSG reconciliation path.
5. **Run + fix + re-run until green.** Both headed and headless. Real artifacts, not mocks.
6. **Aggregate every gap in the running log into a single triage view** before any further launch claim.

### Actor inventory (operator-listed; ~14 actors covering the operating layer)

1. Operator
2. Consulting human operator
3. Customer-admin (per profile)
4. Consultative agent
5. Performance engagement consultative agent (specialization)
6. Provisioner (GAP-PROV-001 — not yet built)
7. Knowledge Semantic Guardian (per profile; named SG agents in `<slug>-data-governor` — GAP-SG-001 for 7 missing)
8. Data Semantic Guardian (per profile; same)
9. Runtime agents (per customer / per channel — Elliott, Caroline, etc.)
10. Comms (the email / SMS / voice / video pipeline)
11. Federation (cross-source query layer)
12. Rollup (Huminic-the-company aggregation case)
13. Cross-actor interactions (concurrent edits, handoffs)
14. Failure & recovery (the negative-space surfaces)

### What is explicitly NOT in this phase

- **No** Devil's Advocate teammate built yet. Post-launch role.
- **No** 7-item failure-mode checklist or formal audit playbook authored yet. Catalog + workflows + one gap-pass question is sufficient.
- **No** scheduled integrity scanner cron. Post-launch.
- **No** new agent definitions beyond what the gap pass forces.
- **No** new infrastructure. Cron / webhook / Redis decision deferred to whenever the integrity scanner actually gets built.

### Augmentation 2026-06-01: manuals as the diagnostic

Per operator: writing the end-to-end user manual for each role IS the audit, not a deliverable on top of the audit. A workflow can say "operator approves a readiness gate" in one sentence and look green; the manual has to say *where the button lives, what the screen says, what happens after click* — and writing it surfaces the gap when there's no button. Same for agent SOUL wiki entries: drafting the SOUL forces naming the wiki pages it reads, the MCP scopes it needs, the consumers of its outputs — any missing piece is a gap surfaced mid-sentence.

**WORKFLOWS.md becomes the table of contents.** The body lives in the manuals and SOUL stubs below. Gap pass happens during the writing.

#### Human manuals (5)

| Path | Audience |
|---|---|
| `docs/launch/manuals/studio-admin-guide.md` | Huminic Studio operator (the system admin running everything). All `is_admin: true` paths: profiles, agents, MCP tokens, audit, engagements, promote-from-drafts, readiness gates. |
| `docs/launch/manuals/consulting-human-operator-guide.md` | Huminic sales professional using the consultative agent. Six-phase engagement walk, prescription read, handoff to Provisioner, resolving surfaced assumptions, editing pages the agent authored. |
| `docs/launch/manuals/customer-admin-guide.md` | Dealer's staff logging into their own storefront at `/p/<slug>/*`. Wiki editing under KSG, Comms send, audit trail read, password reset, customer-admin invite. |
| `docs/launch/manuals/nexxus-migration-customer-guide.md` | Existing Nexxus dealer transitioning to Huminic — what's different, where their old data is (or isn't), how to do the things they used to do, cutover from their side. (**Operator assumption: this is the dealer-side migration guide, not the end-consumer/car-shopper. Flag at writing time if interpretation is wrong.**) |
| `docs/launch/manuals/huminic-rollup-operator-guide.md` | Huminic-the-company operator reading aggregated data across child profiles. Authorizing rollup scope; reading rollup; auditing rollup reads. (Couples with SRS-E. Smaller manual.) |

#### Agent SOUL wiki entries (~17 identities)

Format: each SOUL is one markdown file with frontmatter (id, role, channels, scope_contract, workflow, kanban_lane, enabled) + a body describing what the agent does and what wiki pages it reads at runtime. Lives under `huminic/governance/agents/` for huminic-owned agents (Provisioner) and `<dealer>/governance/agents/` for per-dealer agents.

| Agent | Lives at | Notes |
|---|---|---|
| Provisioner | `huminic/governance/agents/provisioner.md` | GAP-PROV-001. Writes the SOUL stub here; building the agent itself is post-launch. |
| Knowledge Semantic Guardian | `<slug>-data-governor/SOUL.md` (unified KSG+DSG) | 4 exist (huminic, strukture, serra-automotive, cedar-ridge-automotive); 7 missing per GAP-SG-001 — write SOULs as part of this pass. |
| Data Semantic Guardian | Same as above | Same. |
| Consultative agent | `consultative-agent/SOUL.md` | Already exists. Verify drift between SOUL + actual `consultative-engine.ts` behavior; flag any divergence as a gap. |
| Elliott (per dealer) | `<dealer>/governance/agents/elliott.md` | Exists for huminic-motors (CZ-003). Template for other dealers when they go live. |
| Caroline (SMS responder, per dealer) | `<dealer>/governance/agents/caroline.md` | Template. |
| Lead follow-up agent (per dealer) | `<dealer>/governance/agents/lead-follow-up.md` | Template. |
| Lead response agent (per dealer) | `<dealer>/governance/agents/lead-response.md` | Template. |
| Service agent (per dealer) | `<dealer>/governance/agents/service.md` | Template. |
| CRM data guru (per dealer) | `<dealer>/governance/agents/crm-data-guru.md` | Template. |
| Sales coach (per dealer) | `<dealer>/governance/agents/sales-coach.md` | Template. |
| Communication writer (per dealer) | `<dealer>/governance/agents/communication-writer.md` | Template. |
| Photo studio (per dealer) | `<dealer>/governance/agents/photo-studio.md` | Template. |
| Video producer (per dealer) | `<dealer>/governance/agents/video-producer.md` | Template. |
| Copywriter (per dealer) | `<dealer>/governance/agents/copywriter.md` | Template. |
| Market intel (per dealer) | `<dealer>/governance/agents/market-intel.md` | Template. |
| Creative director (per dealer) | `<dealer>/governance/agents/creative-director.md` | Template. |

**Disabled by default.** Every per-dealer agent SOUL ships with `enabled: false` per the existing cutover-ritual convention. Operator flips `enabled: true` when they're actually ready to dispatch the agent.

**Templates live in huminic profile, instances are per-dealer copies.** Following the existing pattern from Phase C / Tranche A.

#### Workflow diagrams (per role, per agent)

Each human manual AND each agent SOUL gets a Mermaid diagram at the top showing the workflow shape. Mermaid is markdown-native (renders in GitHub + most viewers, no separate tool). One diagram per manual / SOUL, kept simple — sequence diagram for cross-actor flows, flowchart for single-actor decision trees. The diagram is its own diagnostic: if you can't draw the arrow from step A to step B, the handoff is missing — log it as a GAP row.

Diagram types per surface:
- **Human manuals** — flowchart (operator clicks → screen renders → action taken → branch on outcome)
- **Agent SOUL stubs** — sequence diagram (agent reads wiki → calls MCP → writes Brain → DSG audit → escalates or returns)
- **Cross-actor workflows** (in WORKFLOWS.md) — sequence diagram with all actors as lanes

Diagrams live in the same markdown file as the manual/SOUL — top of the body, before the prose. They are the *table of contents* for the prose that follows.

#### Gap-during-writing protocol

When writing a manual or a SOUL — prose OR diagram — if you can't complete a sentence or draw an arrow because the underlying button/screen/endpoint/wiki page/MCP scope/handoff doesn't exist, stop and log a new `GAP-MANUAL-*`, `GAP-SOUL-*`, or `GAP-FLOW-*` row in the running log below. Then write the next sentence (or draw the next arrow with a `:::missing` style) around the gap. Don't smooth over.

### Exit criteria (revised)

Phase 8 is complete only when ALL of:

- `docs/launch/ROLES.md` committed with ≥12 actor paragraphs
- `docs/launch/WORKFLOWS.md` committed (table of contents pointing into the manuals)
- All 5 human manuals committed under `docs/launch/manuals/`
- All ~17 agent SOUL stubs committed under the appropriate profile `governance/agents/` directories (including the 7 missing `<slug>-data-governor` SOULs, closing GAP-SG-001 at the wiki-entry level)
- Every gap surfaced during manual/SOUL writing logged as a new GAP-* row in the running log
- Regenerated Playwright suite committed and passing headed + headless, designed against manual workflows (not pages)
- Triage view assembled from the running log
- Every fix that closes a manual-surfaced gap has a live-verification screenshot or test artifact in `EVIDENCE_INDEX.md`

Only then can a fresh launch recommendation be drafted. Manuals + SOUL stubs ARE the eval surface; if I can't write a step, the eval would have failed too.

### /goal (operator-issued 2026-06-01, post-compact execution)

```
Before any further launch claim, complete the role catalog at docs/launch/ROLES.md (twelve to fifteen actors, one paragraph each covering identity, ownership, reads, writes, handoffs, and escalation paths) using existing governor SOULs and HUMAN_TESTING_SCRIPT as inputs; complete the workflow catalog at docs/launch/WORKFLOWS.md with three to five end-to-end workflows per actor (one sentence each, concrete, covering every user surface listed above including operator, consulting human operator, customer-admin, consultative agent, performance engagement consultative agent, Provisioner, KSG, DSG, runtime agents per customer, comms, federation, rollup, cross-actor interactions, and failure/recovery paths); for every workflow answer the question "what has to be true for this to work end to end in the running system today" and log every gap as a new GAP- row in the running log in docs/launch/PLAN.md; recognize explicitly that the prior Playwright eval pass tested pages, routes, and single-actor surfaces but did not test the cross-actor, cross-handoff, cross-time work-completion surfaces the new catalogs cover, so a new eval suite must be designed against the workflow surfaces rather than against pages; regenerate the Playwright eval suite against the workflow surfaces, headed and headless, with real transactions across Vapi, TextMagic, Tavus where in scope, the Studio-mediated MCP comms path, federation scopes, the ADF webhook round-trip, the password reset canary, the Provisioner end-to-end, the KSG integrity scan, and the DSG reconciliation path; run the new eval suite; fix every failure; re-run until green; aggregate every gap in the running log into a single triage view; do not return with a launch claim until the role catalog, workflow catalog, gap pass, regenerated eval suite, and full green re-run are all complete with evidence references in EVIDENCE_INDEX.md; the Devil's Advocate teammate, the integrity scanner cron, and the formal audit framework remain post-launch work and are not built in this pass.
```

---

## Closeout sweep gaps (running log — added 2026-06-01)

Living section. Every gap surfaced during the post-checkpoint live verification + operator Q&A lands here with a stable id, current status, and a one-line description. Items move out of this section once they're fully closed AND verified live. Items that are NOT yet started stay here as backlog.

Two kinds of gaps live here:

- **P-FIX-***: defects discovered during execution that did not exist in the original plan (caught + fixed within the closeout run).
- **GAP-***: structural/scope gaps the operator surfaced in conversation that were always implied by the spec but never delivered. These need PLAN-level attention; some may move to formal tasks once scoped.

| id | status | one-line | discovered | fix / next step | links |
|---|---|---|---|---|---|
| P-FIX-001 | DONE (verified live) | `<HermesOnboarding>` modal overlayed the storefront login on fresh-localStorage visitors. Removed mounts in `__root.tsx` + `workspace-shell.tsx`. | 2026-06-01 operator screenshot | commit `302df824a` | `EVIDENCE_INDEX.md#p-fix-001` |
| P-FIX-002 | DONE (verified live) | `/reset` rendered inside the Studio admin shell on `studio.huminic.app` because the bypass was nested inside the portal-host conditional. | 2026-06-01 live Playwright sweep | commit `6708302f7` | `EVIDENCE_INDEX.md#p-fix-002` |
| P-FIX-003 | DONE (verified live) | huminic-motors `studio.yaml` used wrong keys (`brand:`/`display_name:`) → Zod fell back to defaults → slug shown instead of brand + Data tile not marked DISABLED. | 2026-06-01 live Playwright sweep | commit `cfed63238` + script corrected | `EVIDENCE_INDEX.md#p-fix-003` |
| GAP-PROV-001 | OPEN — scoped but not started | No "Provisioner / Fulfillment" agent exists. Consultative agent writes the prescription; nothing executes it. SRS implies this in the run-time crew but it was never built. Smallest portable fix: SOUL fragment at `huminic/governance/agents/provisioner.md` + wiki playbook at `huminic/knowledge/provisioning/` + new MCP scopes (`profile_write`, `auth_write`, `studio_config_write`). ~half a day. | 2026-06-01 operator Q on prescription fulfillment | option A: hand-built one-time script per customer; option B: build the Provisioner now and dogfood it on next customer | this conversation 2026-06-01 |
| GAP-SG-001 | OPEN — scoped but not started | 7 customer-shaped profiles missing their named `<slug>-data-governor` sibling (serra-honda, serra-nissan, serra-service, tony-serra-ford, ford-of-columbia, hyundai-of-columbia, huminic-motors). Code-level KSG/DSG enforcement still runs against their writes; the named guardian *identity* is what's missing — no addressable role for reconciliations or operator queries. Existing huminic-data-governor SOUL is the template. ~30 min via a one-shot script, OR first job for the Provisioner agent in GAP-PROV-001. | 2026-06-01 operator Q on per-customer SGs | option A: `scripts/provision-data-governors.ts` now; option B: defer to Provisioner | this conversation 2026-06-01 |
| GAP-AGENT-WIKI-001 | OPEN — backlog | Studio custom agents (`/agents` form, `.runtime/agent-definitions.json`) have no first-class wiki-binding fields. Today the only "instructions" field is `systemPrompt: string`; pointing an agent at a wiki is a discipline embedded in prompt text, not a schema field. Profile-distributed SOULs DO bind via frontmatter (`scope_contract:`, `workflow:`) — that pattern doesn't exist on Studio custom agents. Path forward: add `scope_contract_path`, `workflow_path`, `kanban_lane` to `AgentDefinition` + surface in `/agents` form + inject file contents into the system prompt at session start. ~1 day. | 2026-06-01 operator Q on manual agent → wiki binding | backlog post-launch unless operator wants it before | this conversation 2026-06-01 |
| GAP-LOGOUT-001 | OPEN — small but real | No `/api/auth/logout` endpoint exists. Internal `clearSession()` exists in `auth-middleware.ts` but isn't exposed. UI has no logout button. Operator can't sign out without clearing cookies manually. Caught during 2026-06-01 Playwright sweep when I tried to test anonymous-state behavior. | 2026-06-01 live sweep | small: POST `/api/auth/logout` + UI control + invalidate session cookie. ~30 min. | this conversation 2026-06-01 |
| GAP-CONSOLE-001 | OPEN — non-blocking | Two pre-existing console warnings on every page load: CSP rejects Google Fonts stylesheet (`fonts.googleapis.com` not in `style-src`), and a minified React error #418 (hydration mismatch) on the chat route. Neither blocks functionality; both noise the dev console for customer-admins. | 2026-06-01 Playwright sweep noticed | small: add `https://fonts.googleapis.com` to `style-src` in CSP or self-host the fonts; debug the #418 hydration mismatch separately. ~1 hr. | this conversation 2026-06-01 |
| GAP-PROBE-SIDE-EFFECT-001 | OPEN — non-blocking, documented | `GET /api/brain/readiness?profile=<slug>` creates the profile's brain dir + brain.db if it doesn't exist. A GET endpoint should not mutate state. Discovered during 2026-06-01 env audit when probing huminic-motors silently provisioned its brain dir. Useful side effect this once; should still be fixed. | 2026-06-01 env audit | small: make the readiness probe read-only; expose provisioning as an explicit POST. ~30 min. | `DECISIONS.log` 2026-06-01T07:40:00Z |
| GAP-KSG-SCANNER-001 | OPEN — scoped | The Knowledge Semantic Guardian today is a write-time gate only (3 rules: protected-tree, canonical-frozen, missing-frontmatter). Spec + per-profile data-governor SOULs describe an additional integrity-scanner role (broken wikilinks, lint, drift detection, stale pages, dead ends, conflict detection, hunches on findings, cadenced renewals) that was never wired. No "kool-aid" wiki playbook for the SG agents exists either. Trigger options: cron (per-profile `cron/` dirs already provisioned but empty), webhook, or Redis pub/sub; operator confirmed cron OR webhook are both valid. Smallest fix: `src/server/ksg-scanner.ts` + `governance/semantic-guardian-playbook.md` in each profile + `cron/ksg-scan.yaml` per profile + `POST /api/webhooks/ksg-scan/<profile>` for ad-hoc trigger. Findings land as `metadata_audit` rows + hunches in Brain; surfaced in existing `/engagements/<customer>` panel. ~half a day. Pair with GAP-PROV-001 as the "drink-our-own-kool-aid" delivery. | 2026-06-01 operator Q on KSG integrity-maintenance role | scoped; awaiting go/no-go before launch | this conversation 2026-06-01 |
| GAP-CUSTOMER-INVITE-001 | OPEN — backlog | No self-service customer-admin invite flow exists. Today the operator runs `scripts/create-user.ts --profile <slug> --customer-admin` per customer. The customer cannot themselves invite an additional staff user; multi-user-per-profile is also deferred (see auth notes — today one `auth.yaml` = one user). Surfaced while writing `ROLES.md` Customer-admin paragraph. Smallest fix: POST `/api/profiles/<slug>/invite` admin endpoint emitting a Resend invite email with a single-use redeem token; redeem creates `auth.yaml` with `is_customer_admin: true`. ~half a day. | 2026-06-01 ROLES.md drafting | backlog post-launch unless operator wants it before | `docs/launch/ROLES.md` actor 3 |
| GAP-CONSULTATIVE-DRIFT-001 | OPEN — investigate | SOUL at `~/.hermes/profiles/consultative-agent/SOUL.md` vs. actual behavior in `src/server/consultative-engine.ts` not yet drift-checked. SOUL references six-phase method, scope contract, approval matrix, deployment-notes mandate; engine implements `advanceEngagementStage`, `approveReadinessGate`, `phaseToStage`. Drift would show as agent behavior that the SOUL doesn't describe (or SOUL prescriptions the engine ignores). To be checked while writing `docs/launch/manuals/consulting-human-operator-guide.md`. Fix: either update SOUL to match engine, update engine to match SOUL, or document the intentional split. ~1 hr investigate. | 2026-06-01 ROLES.md drafting | investigate during consulting-human-operator-guide.md write | `docs/launch/ROLES.md` actor 4 |
| GAP-PERF-CONSULTATIVE-001 | OPEN — backlog | The Performance Engagement Consultative Agent is named in the operator's actor inventory (PLAN.md Phase 8) but has no separate dispatch surface. consultative-engine.ts six-phase method is the closest substrate — it does an initial scope, not a periodic re-orient/re-audit against a live customer. Smallest fix: a second engine entry point `runPerformancePass(profile)` that reads engagement-state.yaml history + audit logs + KSG/DSG findings and produces a delta prescription. ~1 day. | 2026-06-01 ROLES.md drafting | backlog post-launch | `docs/launch/ROLES.md` actor 5 |
| GAP-ENG-STATE-PERF-001 | OPEN — schema bump | engagement-state.yaml schema (`src/lib/engagement-state.ts`) defines 7 stages: draft → gathering_data → solution_discovery → creation → submission → feedback → ready_to_run. A performance-review pass would need an 8th stage `performance_review` (returnable from `ready_to_run` and back). Adding a stage = zod schema bump + production engagement-state.yaml migration (additive default = null). ~2 hr. Couples with GAP-PERF-CONSULTATIVE-001. | 2026-06-01 ROLES.md drafting | backlog post-launch | `docs/launch/ROLES.md` actor 5 |
| GAP-MANUAL-promote-001 | OPEN — investigate | WF-OP-002 says operator promotes draft → published via Files screen Promote button. Confirm during studio-admin-guide.md write whether the Promote button exists in `/files` UI today or whether promotion is CLI-only / API-only. Phase 3 (revised) status (in archived plan) shipped utilities (`extractFrontmatter`, `readWikiFields`) but deferred the UI integration. If button is missing → wire it as a small UI fix, OR document the CLI path as the launch-time procedure. ~half day if UI fix is needed. | 2026-06-01 WORKFLOWS.md drafting WF-OP-002 | investigate during studio-admin-guide.md write | `docs/launch/WORKFLOWS.md` WF-OP-002 |
| GAP-FLOW-engagement-seed-001 | OPEN — investigate | WF-CHO-001 says consulting human operator seeds a new engagement-state.yaml at `draft`. Confirm during consulting-human-operator-guide.md write whether there's a Studio UI button for this or whether it's CLI-only. If CLI-only at launch, document explicitly + propose a Studio button as a post-launch follow-up. | 2026-06-01 WORKFLOWS.md drafting | investigate during consulting-human-operator-guide.md write | `docs/launch/WORKFLOWS.md` WF-CHO-001 |
| GAP-FLOW-concurrent-edit-001 | OPEN — CONFIRMED silent-overwrite | Confirmed during customer-admin-guide.md write: `src/server/ksg-gate.ts` has NO concurrent-edit detection. If two writers save the same page in the same minute, the last save wins silently — no conflict prompt, no ETag check, no audit warning. Launch-time procedure documented in `customer-admin-guide.md` Section 4 (single-writer convention per page; recovery via git history if loss suspected). Post-launch fix: add ETag-style optimistic concurrency to `POST /api/customer/wiki/save` — ~2 hr. | 2026-06-01 WORKFLOWS.md drafting; confirmed 2026-06-01 customer-admin-guide.md write | documented launch-time workaround; post-launch fix is small | `docs/launch/manuals/customer-admin-guide.md` Section 4 |
| GAP-FLOW-retry-policy-001 | OPEN — investigate | WF-F&R-001 says comms substrate retries per per-adapter policy. Confirm during studio-admin-guide.md write whether each adapter (Vapi, TextMagic, Tavus, Resend) has a documented retry policy (max attempts, backoff, deadlettering) or whether retry is ad-hoc. If ad-hoc → document the launch-time fallback (manual operator re-dispatch from audit log) + propose a policy doc as follow-up. | 2026-06-01 WORKFLOWS.md drafting | investigate during studio-admin-guide.md write | `docs/launch/WORKFLOWS.md` WF-F&R-001 |
| GAP-FLOW-stale-reconciliation-001 | OPEN — investigate | WF-F&R-007 says DSG reconciliation candidates that sit unapproved beyond N days get flagged stale. Confirm during studio-admin-guide.md write whether a timeout policy + UI surface exists for stale reconciliation entries. If not → flag the manual workflow operator should run (periodic `/engagements/<customer>` sweep) + propose UI surface for the post-launch backlog. | 2026-06-01 WORKFLOWS.md drafting | investigate during studio-admin-guide.md write | `docs/launch/WORKFLOWS.md` WF-F&R-007 |
| GAP-ENG-STATE-ABANDON-001 | OPEN — schema bump | engagement-state.yaml schema has no terminal-fail / `abandoned` stage. WF-F&R-003 says an operator may need to mark an abandoned engagement as such; today the closest move is leaving the engagement frozen mid-stage. Adding a terminal `abandoned` stage = zod schema additive + production migration. ~1 hr. | 2026-06-01 WORKFLOWS.md drafting | backlog post-launch unless operator wants now | `docs/launch/WORKFLOWS.md` WF-F&R-003 |
| GAP-FLOW-session-revoke-on-rotate-001 | OPEN — investigate | studio-admin-guide.md Section 13: when operator rotates a user's password via `scripts/create-user.ts`, does the rotation invalidate that user's existing session tokens? Today auth-middleware stores sessions in a Map; password rotation rewrites `auth.yaml` but the in-memory + Redis session token registries are NOT pruned. Confirm with code read of `src/server/auth-middleware.ts` + then either fix (prune sessions for the rotated profile on `auth.yaml` write) or document the launch-time procedure (operator must also run a session-purge step). ~1 hr investigate + small fix. | 2026-06-01 studio-admin-guide.md drafting | small fix post-launch unless launch-blocker | `docs/launch/manuals/studio-admin-guide.md` Section 13 |
| GAP-FLOW-operator-promote-approval-001 | OPEN — investigate | studio-admin-guide.md Section 15: today the customer-admin's promote call goes through `/api/customer/wiki/promote` (Phase C.3) which writes directly to `published/` without an operator-in-the-loop approval step. Question: should operator approval be required for customer-admin promotes? If yes, add a queued-approval flow (POST creates a pending promote, operator approves via `/files` UI, then move executes). If no (launch policy = "customer-admin owns their published wiki"), document explicitly. Operator decides. | 2026-06-01 studio-admin-guide.md drafting | operator decision needed | `docs/launch/manuals/studio-admin-guide.md` Section 15 |
| GAP-MIGRATION-DATA-PORT-001 | OPEN — operator-owned, post-launch | nexxus-migration-customer-guide.md Section 2: the Nexxus → Huminic Brain data migration is operator-owned and post-launch. At launch each dealer's Huminic Brain starts fresh; historical Nexxus data stays in Nexxus until per-dealer bulk import is scheduled. No migration tooling pre-built; operator-decided per dealership based on volume + retention need. | 2026-06-01 nexxus-migration-customer-guide.md drafting | post-launch operator-owned | `docs/launch/manuals/nexxus-migration-customer-guide.md` Section 2 |
| GAP-AUTH-HYDRATION-SPLASH-001 | OPEN — MEDIUM (initial paint UX) | Phase 8 live headed sweep surfaced: on `/engagements` (likely also `/agents`, `/tasks`, other auth-gated admin routes — not all checked), a transient "h Huminic Studio" splash overlay renders OVER the login form during hydration. Resolves within ~3s once auth-check completes. Likely cause: workspace-shell renders brand splash before auth-gate decides. Fix: defer splash render until after auth-check OR render as backdrop not overlay. ~1 hr. | 2026-06-01 Phase 8 live headed sweep | small post-launch fix; non-blocker | `docs/launch/evidence/phase8-headed-sweep/REPORT.md` |
| GAP-CSP-META-001 | OPEN — LOW (security policy) | Phase 8 live headed sweep surfaced: CSP `frame-ancestors` directive ignored because it's delivered via `<meta http-equiv="Content-Security-Policy">` not HTTP header. Browser logs the warning on every page. Effect: page is more permissively framable than intended. Fix: move `frame-ancestors` to a HTTP `Content-Security-Policy:` header set in server-entry.js. ~30 min. | 2026-06-01 Phase 8 live headed sweep | small fix; complements GAP-CONSOLE-001 | `docs/launch/evidence/phase8-headed-sweep/REPORT.md` |
| GAP-API-CONNECTION-STATUS-500 | OPEN — LOW | Phase 8 live headed sweep surfaced: `GET /api/connection-status` returns 500 to unauthenticated callers (other auth-protected endpoints correctly return 401). Not user-blocking but logs an unnecessary server-error on every chat-route init. Fix: route handler should return 401 (auth required) for unauthenticated callers, not 500. ~30 min. | 2026-06-01 Phase 8 live headed sweep | small fix | `docs/launch/evidence/phase8-headed-sweep/REPORT.md` |

| GAP-VER-005 | FIXED — PENDING-COOLIFY-REDEPLOY | `/engagements/<customer>` detail didn't render (parent route swallowed the child, no `<Outlet/>`). Fixed via `/w/`-style index route. | 2026-06-02 verifier PROC-012 | commit `7909e4a79` (branch `feature/phase-8-blocker-fixes`); live-verified local | `docs/launch/evidence/blocker-fixes/005/` |
| GAP-VER-003 | FIXED — PENDING-COOLIFY-REDEPLOY | Reset rate-limit never fired in prod. Root cause (live tcpdump): Caddy sets `X-Forwarded-For: IP:port` with a rotating port → unique key per request. Fixed by stripping the port in `getClientIp`. | 2026-06-02 verifier PROC-005/104 | commit `223b14a7c`; 10 unit tests + rebuilt-build live proof | `docs/launch/evidence/blocker-fixes/003/` |
| GAP-VER-004 | FIXED — PENDING-COOLIFY-REDEPLOY | `/agents` showed only 8 built-ins. Added `getProfileSoulAgents()` enumerating profile SOULs (`SOUL.md` + `governance/agents/*.md`), source-tagged read-only. | 2026-06-02 verifier PROC-011 | commit `baf89473d`; 5 unit tests + live "8 built-in · 2 profile" | `docs/launch/evidence/blocker-fixes/004/` |
| GAP-VER-002 | FIXED — PENDING-COOLIFY-REDEPLOY | Direct nav to admin routes showed login for authed sessions (auth resolved only by the startup overlay, which the protected-path guard bypassed). Fixed by resolving auth in a `useEffect` before the early returns. P-FIX-001/002 re-verified. | 2026-06-02 verifier PROC-010/130 | commit `936615dcf`; live-verified direct nav on 4 routes | `docs/launch/evidence/blocker-fixes/002/` |
| GAP-VER-007 | FIXED — PENDING-COOLIFY-REDEPLOY | `scripts/` (and `src/`) not in the runtime image → CLI workarounds failed. Dockerfile now COPYs both; manuals corrected to `npx tsx` + `hermes-studio-` container. | 2026-06-02 verifier PROC-020/022/103 | commit `3e577897a`; docker build + in-image run proof | `docs/launch/evidence/blocker-fixes/007/` |
| GAP-VER-001 | FIXED — PENDING-COOLIFY-REDEPLOY | No `/plugins` or `/mcp-tokens` admin UI (both 404). Added read-only screens + routes + sidebar entries on the existing APIs. | 2026-06-02 verifier PROC-001/013 | commit `78babf2c7`; live-verified both routes | `docs/launch/evidence/blocker-fixes/001/` |
| GAP-VER-006 | OPEN — LOW (spec drift) | `/audit` filter taxonomy differs from spec + empty under "All time". Not in the blocker-fix pass scope; needs audit-write-path confirmation. | 2026-06-02 verifier PROC-015 | backlog | `VERIFICATION_REPORT.md` GAP-VER-006 |
| GAP-VER-008 | OPEN — LOW (spec drift) | Knowledge tree shows protected paths (read-only via KSG) rather than hiding them. Functionally safe; spec/behavior mismatch. | 2026-06-02 verifier PROC-031 | backlog | `VERIFICATION_REPORT.md` GAP-VER-008 |

> **GAP-SG-001 update (2026-06-02):** `scripts/deploy-phase8-souls.sh` written + dry-run-validated (commit `ebf6b8b11`); deploys the 7 governor SOULs to the volume. **Committed but NOT run** (mutates production) — PENDING-OPERATOR-CONFIRMATION (`--apply`).

> **Blocker-fix pass status (2026-06-02):** see the `BLOCKER FIX PASS — 2026-06-02` section in `VERIFICATION_REPORT.md` for the full per-blocker table. All six GAP-VER code blockers are FIXED on `feature/phase-8-blocker-fixes` and PENDING-COOLIFY-REDEPLOY (production runs the pre-fix image). GAP-SG-001 + manuals→wiki are committed scripts, PENDING-OPERATOR-CONFIRMATION. LOW-bucket (GAP-CONSOLE-001 / GAP-CSP-META-001 / GAP-API-CONNECTION-STATUS-500 / GAP-VER-006 / GAP-VER-008) remain open, non-blocking.

### How this section is maintained

- New gaps surfaced in operator Q&A get a new row with a stable `GAP-*` id. Do not delete rows; status flips from OPEN → DONE (verified live) when truly closed.
- Each row links to the conversation turn or evidence anchor that surfaced it.
- A row is only DONE if it has a fix commit + a live-verification screenshot or test artifact in `EVIDENCE_INDEX.md`.
- DEFERRED-WITH-DISPOSITION is allowed when the operator explicitly accepts the gap as out-of-launch-scope; the row stays here with that label and a one-line reason.

---

## Operator-action-gated tasks (scheduled with fallback per Section 0.5 step 6)

For each operator-action task, the fallback is: agent surfaces the gate with what is needed, what is blocked, and what is unblocked; agent proceeds on the unblocked siblings. Operator gates do NOT permit a launch claim.

| id | task | owner | fallback if not done by sign-off |
|---|---|---|---|
| P-OP-001 | Nexxus DNS / cutover | operator | Launch claim still possible; cutover is Section 8.3 out-of-scope. Closeout report says "system launch-ready; cutover remains the operator's call." |
| P-OP-002 | Per-customer real Vapi / TextMagic / VinSolutions credentials | operator | Test creds remain. Closeout report itemizes which channels have real creds (huminic + huminic-motors at minimum) and which still use test creds; launch can proceed if customer-visible channels have real creds. |
| P-OP-003 | Metabase / MindsDB Coolify sidecar | operator | Plugin-native renderer for D.3 ships if Metabase deferred. MindsDB shim is removed from launch tool surface if MindsDB deferred (per P-SRS-D4). |
| P-OP-004 | Vapi assistant dashboard config (Elliott's end-of-call webhook URL) | operator | P-CZ-008 cannot close without this; if not done, Elliott→ADF webhook is hidden from launch claim and tracked as post-launch backlog. |
| P-OP-005 | Re-acknowledgment of ACCEPTANCE_CRITERIA.md at every session start | agent | hook in AGENTS.md; agent must self-enforce per session via DECISIONS.log append. |

---

## Invariants the plan must preserve

1. **No Hermes core fork.** Verified by P-SUR-C-005.
2. **No fourth cross-profile access surface.** Verified by P-SUR-E-002.
3. **Configuration over code.** Verified by P-SUR-C-005 + per-task DECISIONS.log entries for any code addition that could have been config.
4. **No silent re-deferral.** Section 3.G: if a task cannot close in this run, agent stops, documents in DECISIONS.log, raises in next status acknowledgment, then continues on unblocked siblings.
5. **Evidence-first.** No task marked done without ≥1 EVIDENCE_INDEX.md cell populated.
6. **Re-acknowledgment cadence.** Every session start appends to DECISIONS.log with sha256 of ACCEPTANCE_CRITERIA.md.

---

## What this plan deliberately does NOT do

1. Execute the Nexxus business cutover (DNS / Caddy / Nexxus stop). That is operator-only.
2. Fork Hermes core. Any apparent need to do so halts the responsible task and surfaces.
3. Introduce a fourth cross-profile access surface. Existing three: wildcard MCP token, `mcp__create_profile`, Studio admin login.
4. Claim done while any AC- is RED or any EVIDENCE_INDEX.md cell is unresolved.
