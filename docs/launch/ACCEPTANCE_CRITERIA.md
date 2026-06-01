# ACCEPTANCE CRITERIA — Huminic Studio launch

**Date issued:** 2026-06-01
**Owner:** Implementation agent (Claude Opus 4.7) on behalf of Duane Wells
**Status:** ACTIVE — must be re-acknowledged at the start of every working session via `DECISIONS.log` append until launch sign-off

These criteria fold in:
1. Every Section 9 line from the closeout prompt issued 2026-06-01
2. Every MUST from `docs/next-phase-data-to-completion/SRS_PHASE_NEXT_PART_8_ACCEPTANCE_AND_GOAL.md`
3. Every wiki invariant and Data Architect handoff constraint from `docs/next-phase-data-to-completion/USER_INSTRUCTION_VERBATIM.md`

**Standard of evidence:** "done" means memorialized. An audit log id, a Playwright trace path, a Brain record id, a screenshot, a signed evidence reference, or a vitest run id under the launch evidence index. Anything else is in-flight.

A criterion is GREEN only when its evidence reference in `EVIDENCE_INDEX.md` points to a real artifact and the artifact substantiates the claim.

---

## AC-G — General

| id | criterion |
|---|---|
| AC-G-001 | Every MUST from the next-phase SRS is satisfied. |
| AC-G-002 | Every known deferred item listed in the closeout prompt (CZ-002..009, SRS-C1/D2/D3/D4/E/F7/G) is closed or removed from launch scope in a way that leaves no user-visible artifact and no false claim. |
| AC-G-003 | No surfaced feature remains broken, stubbed, shimmed, or unverified. |
| AC-G-004 | No visible control produces a surprise failure. |
| AC-G-005 | No major undocumented assumption remains. |

## AC-P — Provisioning / Tenancy

| id | criterion |
|---|---|
| AC-P-001 | All required tenant/customer/dealer profiles for launch validation exist on the production volume. |
| AC-P-002 | Each launch-scope profile has working auth state (auth.yaml exists, scrypt hash valid, login succeeds). |
| AC-P-003 | Each profile's storefront login path works end-to-end. |
| AC-P-004 | Tenant isolation is proven with negative evidence (cross-profile reads denied + logged). |
| AC-P-005 | The 5-vs-6-vs-7 dealer ambiguity is resolved in writing in `EVIDENCE_INDEX.md`. The canonical launch-scope dealer universe is listed with rationale. |

## AC-A — Auth / Portal

| id | criterion |
|---|---|
| AC-A-001 | Storefront login works for every launch-scope profile (admin + customer-admin paths). |
| AC-A-002 | Portal / domain behavior is correctly configured for launch OR intentionally removed from claim and surface (no half-advertised portal hostname). |
| AC-A-003 | Password reset request endpoint exists, accepts `{email}`, dispatches a Resend email via `comms_send_email`, and returns 200 on success / 400 on validation error. |
| AC-A-004 | Password reset confirm endpoint exists, accepts `{token, new_password}`, validates scrypt-hashed single-use token (15-min TTL), updates target profile auth.yaml, returns 200 on success / 400 on invalid token. |
| AC-A-005 | `/reset?token=` page renders the new-password form and submits to the confirm endpoint. |
| AC-A-006 | Canary password reset test passes against a real profile end-to-end (request → email → click → form → confirm → login with new password). |
| AC-A-007 | "Forgot password?" link in the storefront login is no longer dead. |

## AC-S — Studio / Storefront CRUD

| id | criterion |
|---|---|
| AC-S-001 | Admin CRUD works on every admin-visible surface (custom agents, profiles, MCP tokens, file manager). |
| AC-S-002 | Customer-admin CRUD works on every customer-admin-visible surface (wiki edit within KSG bounds, widget config within KSG bounds, campaign create/schedule). |
| AC-S-003 | Create/edit/delete/archive actions are validated on every surfaced screen with positive and negative cases. |
| AC-S-004 | Role restrictions are validated: customer-admin cannot reach Studio admin surfaces; tenant-limited user cannot reach another tenant's data. |
| AC-S-005 | Wiki creation works (admin authoring path). |
| AC-S-006 | Wiki editing works for customer-admin within KSG-allowed paths; rejection is graceful and audited for protected-tree writes. |
| AC-S-007 | Data, file, and markdown operations work (upload + classify + retrieve + edit + delete; markdown rendering with wikilink resolution against active profile). |
| AC-S-008 | MCP management UI works where exposed: create token, edit scopes, revoke, list audit entries. |
| AC-S-009 | Every visible link/button/form on every reachable Studio screen is exercised in the autonomous suite; no 404, no surprise failure. |

## AC-CA — Consultative Agent

| id | criterion |
|---|---|
| AC-CA-001 | Consultative audit for a fictitious organization runs end-to-end via the production dispatch path (not a local script-only path). |
| AC-CA-002 | Artifacts are generated properly and conform to spec frontmatter (`type: prescription`, scope_contract, etc.) — verified by reading at least one prescription artifact end-of-run. |
| AC-CA-003 | Wiki output is created with the six invariants (Scope Contract, Confidence Schema, Human Relay Spec, Integration Playbooks, House Canon Reference, Always-on Metadata Substrate). |
| AC-CA-004 | `engagement-state.yaml` writeback works at every phase transition; stage advances are persisted. |
| AC-CA-005 | Consultative agent consumes MCP-served information (wiki + brain + federation tools all callable from the engagement). |
| AC-CA-006 | Assumption surfacing is exercised ≥3 times in the simulation; lookup_misses + assumptions land in Brain with operator-visible state. |
| AC-CA-007 | Capability gap proposals are emitted when relevant and persisted as suggested_knowledge_changes. |
| AC-CA-008 | Performance-engagement specialization is integrated if in launch scope OR explicitly carved out in the launch closeout report. |

## AC-SG — Semantic Guardians

| id | criterion |
|---|---|
| AC-SG-001 | Semantic Guardians (KSG + DSG) are in the transaction flow for every write that touches knowledge or data stores. |
| AC-SG-002 | KSG + DSG share one policy engine and one audit log. |
| AC-SG-003 | Missing data and unresolved assumptions are logged as lookup_misses/assumptions records. |
| AC-SG-004 | Gate outcomes are recorded with rule id, outcome (approved/denied/needs_review), actor, action, target, timestamp, reason. |
| AC-SG-005 | Append-only metadata substrate (sixth invariant) is present on every launch-scope profile; readiness probe enforces. |
| AC-SG-006 | Reconciliation items are created on contradictions and resolvable through the governed path. |
| AC-SG-007 | No silent overwrite of knowledge/data stores — verified by pen-test attempt. |
| AC-SG-008 | Audit trail is queryable per profile and supports drift observability. |
| AC-SG-009 | Hermes self-improvement files are under cron + brought into the SG flow. |

## AC-PS — Plugins / Skills / Extensions

| id | criterion |
|---|---|
| AC-PS-001 | All required plugin bundles are present and load cleanly on a fresh Hermes + Studio host (per `docs/plugin-install.md`). |
| AC-PS-002 | All required skills are implemented and invokable from at least one launch-scope profile; no catalog item pretends to exist if it has no real implementation. |
| AC-PS-003 | Extension behavior is verified on real surfaces (load → invoke → audit row → expected effect). |
| AC-PS-004 | Plugin/skill failures are handled and audited; no silent swallow. |
| AC-PS-005 | Portability assumption preserved: no Hermes core fork; if any adapter required a core touch, it is recorded in `DECISIONS.log` with justification. |

## AC-DR — Data / Brain / Rendering

| id | criterion |
|---|---|
| AC-DR-001 | Data tab (or equivalent) renderer is real and shows real per-profile data; no stub card surfaces in launch scope OR the tab is hidden from launch surface. |
| AC-DR-002 | Rollup UI exists and is wired to authorized data flows (admin sees parent rollup; child profiles without grant are denied). |
| AC-DR-003 | MindsDB / federation requirement is genuinely satisfied OR the federation_query tool is explicitly removed from launch surface (no shim exposed as a real integration). |
| AC-DR-004 | Uploads are classified by DSG and governed; `brain/uploads/` flow exercised. |
| AC-DR-005 | Embeddings pipeline functional with at least one supported model (`local-hash-v1` is acceptable for launch; remote models opt-in). |
| AC-DR-006 | PII redaction default implementation works for embeddings OR remote embedding models are gated behind an explicit operator action. |
| AC-DR-007 | Migration discipline is in place: every schema migration is versioned, checksummed, forward-only, and reversible via documented rollback. |
| AC-DR-008 | Brain backup/restore round-trips per profile with no cross-profile leak. |
| AC-DR-009 | Chat memorialization works across Studio chat, MCP, and messaging-hub (chat_records populated for every customer-admin chat round-trip). |

## AC-CM — Communications / Third-party integrations

| id | criterion |
|---|---|
| AC-CM-001 | Vapi flow works end-to-end where in scope (Elliott → Huminic Motors webhook → ADF → email). |
| AC-CM-002 | Tavus flow works where in scope OR is hidden from launch surface. |
| AC-CM-003 | CRM / ADF / webhook / email round-trip works where in scope. |
| AC-CM-004 | Studio-mediated MCP path is the one actually used for production comms dispatch (not a central-mcp bypass) — evidence is a comms_log row + DSG audit row produced by an MCP call through `/api/mcp/$profile`. |
| AC-CM-005 | Notification/comms evidence exists for every launch-scope channel (email, SMS, voice) with delivery ids. |
| AC-CM-006 | Failures are recorded in context (comms_log carries error reason + originating thread + retry state). |
| AC-CM-007 | Rate caps and allowlists enforced per channel (verified by negative test). |

## AC-SC — Security / Governance

| id | criterion |
|---|---|
| AC-SC-001 | Role isolation tested (admin vs customer-admin vs tenant-limited). |
| AC-SC-002 | Token scopes tested (correct scope passes, missing scope denied, wildcard explicit). |
| AC-SC-003 | Guardian enforcement tested (KSG + DSG block bypass attempts). |
| AC-SC-004 | Audit logs verified to capture all enumerated events with actor/action/target/timestamp/reason/gate-event. |
| AC-SC-005 | Cross-customer rollup auth tested (parent reads authorized children with grant; reads without grant denied). |
| AC-SC-006 | No unauthorized cross-tenant data exposure — verified by pen-test. |
| AC-SC-007 | F.1 through F.8 pass with evidence per item. |
| AC-SC-008 | F.9 pen-test sweep shows zero open holes OR each finding has explicit accepted-risk disposition in `DECISIONS.log` before launch. |
| AC-SC-009 | Sensitive logging review — no payloads with secrets in logs, no PII in error messages. |

## AC-TE — Testing / Evidence

| id | criterion |
|---|---|
| AC-TE-001 | `HUMAN_TESTING_SCRIPT.md` is complete and traces every AC-* criterion to ≥1 HTC- case. |
| AC-TE-002 | `AUTONOMOUS_TESTING_PLAN.md` is complete and traces every AC-* criterion to ≥1 ATC- case. |
| AC-TE-003 | Autonomous tests were actually executed against the deployed system (not idealized local fixtures). |
| AC-TE-004 | Failures discovered during testing were fixed; tests were re-run; suite is green at sign-off. |
| AC-TE-005 | `EVIDENCE_INDEX.md` links every AC-* criterion to ≥1 concrete artifact (audit row id, Playwright trace path, Brain record id, screenshot path, vitest run id, etc.). |
| AC-TE-006 | The full vitest suite passes (>473 tests as of 2026-06-01 baseline, allowing growth from new closeout tests). |
| AC-TE-007 | Headed Playwright traces exist for every UI surface listed in the autonomous plan. |
| AC-TE-008 | Audit-log verification tests exist and pass (DSG denial creates audit row with rule + outcome=denied; KSG denial likewise; comms send creates comms_log + DSG audit row). |

## AC-CP — Planning checkpoint

| id | criterion |
|---|---|
| AC-CP-001 | `docs/launch/PLAN.md` exists and supersedes prior plans; every CZ + SRS item maps to a P- task id. |
| AC-CP-002 | `docs/launch/ACCEPTANCE_CRITERIA.md` (this file) is committed and the session-start hook forces re-acknowledgment via `DECISIONS.log` append at each session start. |
| AC-CP-003 | `docs/launch/CHECKPOINT_PROOF.md` is committed, self-coherent, and contains zero unresolved entries; every deferred item has a P- task id, an AC- id, and an HTC-/ATC- id. |
| AC-CP-004 | Both eval scripts (`HUMAN_TESTING_SCRIPT.md` + `AUTONOMOUS_TESTING_PLAN.md`) existed on disk before execution began. |
| AC-CP-005 | Stale/competing plan documents have been archived under `docs/archive/2026-06-01/` with one-line notes. |
| AC-CP-006 | The session-start hook is wired through the repo's existing convention (AGENTS.md) so that every future session re-reads ACCEPTANCE_CRITERIA, EXECUTION_CHECKLIST, EVIDENCE_INDEX and appends an acknowledgment to DECISIONS.log. |

## AC-FC — Final claim standard

The agent may say "complete / done / ready to launch / production-ready / no deferrals / nothing skipped" ONLY when:

| id | criterion |
|---|---|
| AC-FC-001 | Every AC-* criterion above is GREEN with evidence. |
| AC-FC-002 | `EVIDENCE_INDEX.md` has zero unresolved cells. |
| AC-FC-003 | `EXECUTION_CHECKLIST.md` has every item resolved (no "in progress" at sign-off). |
| AC-FC-004 | `LAUNCH_CLOSEOUT_REPORT.md` follows the Section 12 format from the prompt, with proof for every claim. |
| AC-FC-005 | A `code-reviewer` subagent has independently verified the closeout claims against files, and its report is referenced in the closeout. |

---

## Re-acknowledgment hash binding

Each session start MUST append to `DECISIONS.log` a line of the form:

```
YYYY-MM-DDTHH:MM:SSZ ACK acceptance-criteria sha256=<hex> by <agent-id>
```

where `<hex>` is the result of `sha256sum docs/launch/ACCEPTANCE_CRITERIA.md`. If the hash differs from the prior acknowledgment without a `CHANGE` entry explaining why, the session is in violation and must stop until reconciled.

The session-start hook is described in `AGENTS.md` under the "Launch checkpoint acknowledgment" section.
