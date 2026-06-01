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
