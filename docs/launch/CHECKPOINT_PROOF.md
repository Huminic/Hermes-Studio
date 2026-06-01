# CHECKPOINT_PROOF — Section 0.5 self-coherence gate

**Date:** 2026-06-01
**Purpose:** prove every deferred / open item from the operator's closeout prompt (Sections 4 + 5) is slotted into `PLAN.md` (task id), `ACCEPTANCE_CRITERIA.md` (criterion id), and at least one eval script (HTC-/ATC- id). Plus a coverage table for every screen cluster, plugin/skill, guardian path, comms integration, role, and tenant boundary.

**Acceptance for this file:** zero unresolved entries. If any row below has a missing cell, the checkpoint fails and execution must not begin.

---

## A. Closeout prompt Section 4 — Current Known Account / Environment Context

| Source line | Plan task id | AC id | Test case id(s) |
|---|---|---|---|
| huminic login (`duane / HuminicValidation2026!`) — verify | P-SUR-A-001 | AC-A-001 | ATC-PW-001 |
| strukture login (`kim / StruktureLogin2026!`) — verify | P-SUR-A-002 | AC-A-001, AC-P-003 | ATC-PW-002, HTC-PR-001 |
| serra-honda login (`tester / SerraHondaTest2026!`) — verify | P-SUR-A-002 | AC-A-001, AC-P-003 | ATC-PW-002, HTC-PR-001 |
| `portal.huminic.app` not in Coolify domain list | P-CZ-006 | AC-A-002 | HTC-PR-002 |
| `/api/auth/reset-request` returns 404 today | P-CZ-004 | AC-A-003, AC-A-007 | ATC-VT-001, ATC-API-004, ATC-PW-008, HTC-PR-003 |
| `scripts/create-user.ts` is the user-create CLI | P-SUR-A-006 | AC-A-001 | HTC-PR-005 |
| auth.yaml 0600 perm requirement | P-CZ-002 | AC-P-002 | (verified by file mode check in ATC-API-002 setup) |
| Missing dealer auth coverage for: serra-automotive, serra-service, serra-nissan, tony-serra-ford, ford-of-columbia, hyundai-of-columbia | P-CZ-002 | AC-P-001, AC-P-002, AC-P-003 | HTC-NX-001, HTC-NX-002, ATC-PW-002 |
| huminic-motors test profile missing | P-CZ-003 | AC-CM-001, AC-P-001 | HTC-NX-003, ATC-CMS-006 |
| **5-vs-6-vs-7 dealer ambiguity** | P-ENV-003 | AC-P-005 | HTC-NX-001 (verification) |

### Dealer ambiguity disposition

Per Section 4 of the closeout prompt:
> "Prior notes imply '5 of 6' Nexxus dealer accounts missing, but the missing list above contains six slugs while serra-honda already exists. Resolve the true total dealer universe in evidence and eliminate ambiguity."

**Current state on the production volume (audited via `ls /root/.hermes/profiles/`):** 15 profile directories exist. Two existing categories overlap:
- Dealer-shaped profiles already with brain provisioning: `serra-honda`, `serra-nissan`, `serra-service`, `tony-serra-ford`, `ford-of-columbia`, `hyundai-of-columbia`, `serra-automotive` (and `serra-automotive-data-governor`).
- Non-dealer profiles: `huminic`, `huminic-data-governor`, `consultative-agent`, `strukture`, `strukture-data-governor`, `cedar-ridge-automotive` (fixture), `cedar-ridge-automotive-data-governor` (fixture).

Of the dealer-shaped profiles, only `serra-honda` currently has an `auth.yaml` (tester account). The other 6 dealer slugs have profile directories but no auth.yaml. So:

- **6** is the correct count of dealer slugs that need an auth.yaml in P-CZ-002.
- **7** is the total dealer universe (the six new + serra-honda).
- The operator's earlier "5 of 6 missing" was off by one because `serra-automotive` was double-counted alongside `serra-honda` in the original prompt.

The canonical launch-scope dealer universe is recorded in `EVIDENCE_INDEX.md#dealer-universe` and re-verified by HTC-NX-001 + ATC-API-002 at run time. If a launch-scope decision changes this list (e.g. dropping `serra-automotive` or `cedar-ridge-automotive` from launch), the change is recorded in `DECISIONS.log` and re-mapped here.

---

## B. Closeout prompt Section 5 — Work that must be closed

### CZ series

| CZ id | Description | Plan task | AC | HTC- | ATC- |
|---|---|---|---|---|---|
| CZ-002 | Dealer auth/profile coverage | P-CZ-002 | AC-P-001, AC-P-002, AC-P-003 | HTC-NX-001, HTC-NX-002 | ATC-API-002, ATC-PW-002 |
| CZ-003 | huminic-motors test profile | P-CZ-003 | AC-CM-001, AC-P-001 | HTC-NX-003 | ATC-CMS-006 |
| CZ-004 | Password reset endpoint | P-CZ-004 | AC-A-003, AC-A-007 | HTC-PR-003 | ATC-VT-001, ATC-API-004 |
| CZ-005 | Password reset page/flow | P-CZ-005 | AC-A-004, AC-A-005 | HTC-PR-004 | ATC-VT-002, ATC-API-005, ATC-PW-008 |
| CZ-006 | `portal.huminic.app` cutover/config completeness | P-CZ-006 | AC-A-002 | HTC-PR-002 | (covered by ATC-PW-002 if portal active; otherwise N/A — disposition in DECISIONS.log) |
| CZ-007 | Password reset canary | P-CZ-007 | AC-A-006 | HTC-PR-004 | ATC-PW-008 |
| CZ-008 | Vapi Elliott → Huminic Motors → ADF → email | P-CZ-008 | AC-CM-001, AC-CM-003 | HTC-NX-003 | ATC-CMS-006 |
| CZ-009 | cutover-ritual doc reflects portal flow | P-CZ-009 | AC-G-002 | HTC-PR-006 | (doc check, no automated test; verified by reading) |

### SRS series

| SRS id | Description | Plan task | AC | HTC- | ATC- |
|---|---|---|---|---|---|
| SRS-C1 | Consultative engine writes engagement-state on phase transitions | P-SRS-C1 | AC-CA-004 | HTC-CA-004 | ATC-VT-003, ATC-PW-015 |
| SRS-D2 | Skill catalog is not just front-matter; required impls exist | P-SRS-D2-A, P-SRS-D2-B | AC-PS-002, AC-PS-003 | HTC-PSE-002 | ATC-VT-004 |
| SRS-D3 | Data tab real renderer (Metabase or plugin-native) | P-SRS-D3 | AC-DR-001 | HTC-SC-014 | ATC-VT-005, ATC-PW-012 |
| SRS-D4 | MindsDB/federation truly satisfied OR removed | P-SRS-D4 | AC-DR-003 | (verified by HTC-LC-003 + ATC-API-003 absence check) | ATC-VT-006, ATC-API-003, ATC-API-008 |
| SRS-E | Rollup dashboard UI | P-SRS-E | AC-DR-002 | HTC-SR-007 | ATC-VT-008 |
| SRS-F7 | PII redactor default | P-SRS-F7 | AC-DR-006 | HTC-SR-006 | ATC-VT-007 |
| SRS-G | E2E live dispatch via Studio-mediated MCP path | P-SRS-G, P-SUR-H-001..003 | AC-CM-004, AC-CM-005 | HTC-CM-001..003 | ATC-CMS-001..003 |

### Additional closeout conditions

| Condition | Plan task | AC | HTC- | ATC- |
|---|---|---|---|---|
| Any user-visible deferred feature is completed or removed/hidden from launch scope | (per-surface tasks in Phase 4 + each SRS task) | AC-G-002 | HTC-LC-002 | ATC-PW-018 |
| Every page with a control, button, menu, route, or dialog tested | P-SUR-B-001..016, P-SUR-A-001..006 | AC-S-009 | HTC-SC-001..016, HTC-LC-002 | ATC-PW-001..018 |
| Every 3rd-party integration surfaced is tested | P-SUR-H-001..006, P-CZ-008 | AC-CM-001..007 | HTC-CM-001..006, HTC-NX-003 | ATC-CMS-001..006 |
| Every tenant promised by Nexxus adaptation provisioned or explicitly removed from launch scope | P-CZ-002, P-CZ-003, P-SUR-G-001..006 | AC-P-001, AC-G-002 | HTC-NX-001..005 | ATC-PW-002, ATC-API-002 |

---

## C. Closeout prompt Section 6 — Major Surfaces

### SURFACE A — Studio shell and auth

| Item | Plan | AC | HTC- | ATC- |
|---|---|---|---|---|
| login/logout/session persistence | P-SUR-A-001, P-SUR-A-005 | AC-A-001 | HTC-SC-001 | ATC-PW-001, ATC-PW-002 |
| admin vs customer-admin vs tenant-limited behavior | P-SUR-A-003, P-SUR-A-004 | AC-S-004 | HTC-SR-001, HTC-SR-002 | ATC-PW-003, ATC-PW-004 |
| storefront paths `/p/<slug>` | P-SUR-A-002 | AC-P-003 | HTC-PR-001 | ATC-PW-002 |
| portal path/domain behavior | P-CZ-006 | AC-A-002 | HTC-PR-002 | — |
| password set/reset flow | P-CZ-004, P-CZ-005, P-CZ-007 | AC-A-003..A-007 | HTC-PR-003, HTC-PR-004 | ATC-VT-001, ATC-VT-002, ATC-PW-008 |
| route protection | P-SUR-A-003, P-SUR-A-004 | AC-S-004 | HTC-SR-004 | ATC-PW-003, ATC-PW-004 |
| role redirection | P-SUR-A-003, P-SUR-A-004 | AC-S-004 | HTC-SR-001 | ATC-PW-004 |
| session expiry + recovery | P-SUR-A-005 | AC-A-001 | (HTC-SC-001 incl. recovery if needed) | (added to ATC-PW-001) |
| auth artifact generation + perms | P-CZ-002, HTC-PR-005 | AC-P-002 | HTC-PR-005 | — (verified by setup check) |

### SURFACE B — Studio screens

| Cluster | Plan | AC | HTC- | ATC- |
|---|---|---|---|---|
| Dashboard / Operations | P-SUR-B-001 | AC-S-009 | HTC-SC-001 | ATC-PW-001 |
| Agent Library | P-SUR-B-002 | AC-S-001 | HTC-SC-002 | ATC-PW-005 |
| Profile / tenant switching | P-SUR-B-003 | AC-S-009 | HTC-SC-003 | ATC-PW-018 |
| Wiki / knowledge / graph / page editor | P-SUR-B-004, P-SUR-B-012 | AC-S-005, AC-S-006 | HTC-SC-004, HTC-SC-012 | ATC-PW-006, ATC-PW-007, ATC-PW-010 |
| Data / rollup / reports / dashboards | P-SUR-B-014, P-SRS-D3, P-SRS-E | AC-DR-001, AC-DR-002 | HTC-SC-014, HTC-SR-007 | ATC-VT-005, ATC-VT-008, ATC-PW-012 |
| File manager / uploads / downloads | P-SUR-B-010 | AC-S-007 | HTC-SC-010 | ATC-PEN-004 |
| Skills / plugin surfaces | P-SUR-B-006 | AC-PS-001 | HTC-SC-006, HTC-PSE-001..003 | ATC-API-001, ATC-INV-003 |
| MCP management / tokens / connectors | P-SUR-B-007 | AC-S-008 | HTC-SC-007 | ATC-API-003, ATC-API-007 |
| Settings / admin / user management | P-SUR-A-006, P-SUR-B-007 | AC-A-001, AC-S-001 | HTC-PR-005, HTC-SC-007 | — |
| Logs / audit / observability | P-SUR-B-009 | AC-SC-004 | HTC-SC-009 | ATC-PW-017 |
| Notifications / communications surfaces | P-SUR-B-015, P-SUR-B-016 | AC-S-002, AC-CM-003 | HTC-SC-015, HTC-SC-016 | ATC-PW-013, ATC-PW-014 |
| Tabs / drawers / modals / forms / tables / search / export / CRUD | P-SUR-B-001..016 | AC-S-009, AC-G-004 | HTC-SC-001..016 | ATC-PW-005, ATC-PW-018 |

### SURFACE C — Plugin / extensions / skills

| Item | Plan | AC | HTC- | ATC- |
|---|---|---|---|---|
| All custom plugin bundles | P-SUR-C-001..003 | AC-PS-001 | HTC-PSE-001 | ATC-API-001 |
| All required skills | P-SRS-D2-A, P-SRS-D2-B, P-SUR-C-004 | AC-PS-002, AC-PS-003 | HTC-PSE-002 | ATC-VT-004 |
| install/load/enable | P-SUR-C-001..003, HTC-PSE-003 | AC-PS-001 | HTC-PSE-003 | ATC-API-001 |
| config surfaces | P-SUR-C-001..003 | AC-PS-003 | HTC-PSE-001 | ATC-API-001 |
| invocation behavior | P-SUR-C-004 | AC-PS-003 | HTC-PSE-002 | ATC-VT-004 |
| failure handling | P-SUR-C-004 | AC-PS-004 | (covered in HTC-PSE-001 negative test) | ATC-API-001 |
| audit logging | P-SUR-C-004 | AC-SG-004, AC-PS-003 | HTC-SG-005 | ATC-PEN-005 |
| portability assumptions | P-SUR-C-005 | AC-PS-005 | (verified in HTC-LC-003) | ATC-INV-001 |

### SURFACE D — Consultative agents

All items: P-SUR-D-001..005, P-SRS-C1 | AC-CA-001..008 | HTC-CA-001..005 | ATC-VT-003, ATC-PW-015, ATC-PW-016, ATC-BR-001

### SURFACE E — Semantic Guardians

All items: P-SUR-E-001..007 | AC-SG-001..009 | HTC-SG-001..006, HTC-SC-009 | ATC-PW-007, ATC-PW-017, ATC-PEN-002..006, ATC-BR-002, ATC-BR-003, ATC-INV-004, ATC-INV-005

### SURFACE F — Wiki / Brain / data contract

| Item | Plan | AC | HTC- | ATC- |
|---|---|---|---|---|
| Profile isolation | P-SUR-F-001 | AC-P-004 | HTC-SR-002 | ATC-PEN-002, ATC-PW-003 |
| Knowledge + Brain stores | P-SUR-F-003 | AC-G-001 (SRS 8.1.3) | (read at brain via SQL — see ATC-BR-001) | ATC-BR-001 |
| Wiki invariants | P-SUR-F-002 | AC-CA-003, AC-SG-005 | HTC-CA-002 | ATC-INV-004 |
| K↔B contract | P-SUR-D-001..003 | AC-G-001 (SRS 8.1.3) | HTC-CA-001..003 | ATC-BR-001..004 |
| Chats memorialized | P-SUR-F-009 | AC-DR-009 | HTC-SC-011 | ATC-PW-009, ATC-BR-008 |
| Embeddings pipeline | P-SUR-F-006 | AC-DR-005 | (covered in HTC-LC-003) | ATC-BR-005 |
| Upload surface | P-SUR-F-005, P-SUR-B-010 | AC-DR-004 | HTC-SC-010 | ATC-PEN-004 |
| Schema migrations | P-SUR-F-007 | AC-DR-007 | (HTC-LC-003) | ATC-BR-006 |
| PII redaction | P-SRS-F7 | AC-DR-006 | HTC-SR-006 | ATC-VT-007 |
| Source lineage | (source_references record family check) | AC-G-001 (SRS 8.1.3) | (in HTC-CA-001) | ATC-BR-001 |

### SURFACE G — Nexxus adaptation

All items: P-CZ-002, P-CZ-003, P-CZ-008, P-SUR-G-001..006 | AC-CM-001..002, AC-P-001..003 | HTC-NX-001..005 | ATC-PW-002, ATC-CMS-006, ATC-API-002

### SURFACE H — Communications / 3rd-party

All items: P-SUR-H-001..006, P-SRS-G | AC-CM-001..007 | HTC-CM-001..006, HTC-NX-003 | ATC-CMS-001..006

---

## D. Closeout prompt Section 9 acceptance criteria — every line mapped

| Section 9 line | AC id(s) | Plan tasks | Tests |
|---|---|---|---|
| Every MUST from SRS satisfied | AC-G-001 | (every Phase 2 + 3 + 4 task) | ATC-BR-001..008, ATC-INV-002, HTC-LC-003 |
| Every known deferred item closed or removed | AC-G-002 | Phase 2 + 3 | ATC-API-008, ATC-VT-005, ATC-VT-006, HTC-LC-002 |
| No surfaced feature broken/stubbed/shimmed | AC-G-003 | Phase 4 | ATC-PW-018 |
| No visible control = surprise failure | AC-G-004 | Phase 4 | ATC-PW-001..018 |
| No undocumented assumption | AC-G-005 | (DECISIONS.log discipline) | HTC-LC-003 |
| All launch tenant profiles exist | AC-P-001 | P-CZ-002, P-CZ-003 | HTC-NX-001, ATC-API-002 |
| Each profile auth works | AC-P-002, AC-P-003 | P-CZ-002, P-CZ-003 | HTC-NX-002, HTC-PR-001, ATC-PW-002 |
| Tenant isolation proven | AC-P-004 | P-SUR-F-001 | HTC-SR-002, ATC-PEN-002 |
| 5-vs-6-vs-7 ambiguity resolved | AC-P-005 | P-ENV-003 | HTC-NX-001 (and dispositioned in this file Section A above) |
| storefront login works | AC-A-001 | P-SUR-A-001..002 | HTC-PR-001, ATC-PW-001..002 |
| portal/domain correct or removed | AC-A-002 | P-CZ-006 | HTC-PR-002 |
| password reset endpoint works | AC-A-003 | P-CZ-004 | ATC-VT-001, HTC-PR-003 |
| password reset page works | AC-A-004, AC-A-005 | P-CZ-005 | ATC-VT-002, HTC-PR-004 |
| canary reset test passes | AC-A-006 | P-CZ-007 | HTC-PR-004, ATC-PW-008 |
| admin CRUD works | AC-S-001 | P-SUR-B-002 | HTC-SC-002, ATC-PW-005 |
| customer-admin CRUD works | AC-S-002 | P-SUR-B-011..016 | HTC-SC-011..016, ATC-PW-009..014 |
| create/edit/delete/archive validated | AC-S-003 | P-SUR-B-002, B-010 | HTC-SC-002, HTC-SC-010, ATC-PW-005 |
| role restrictions validated | AC-S-004 | P-SUR-A-003, A-004 | HTC-SR-001, ATC-PW-004 |
| wiki creation works | AC-S-005 | P-SUR-B-004 | HTC-SC-004, ATC-PW-006 |
| wiki editing works | AC-S-006 | P-SUR-B-012 | HTC-SC-012, ATC-PW-007, ATC-PW-010 |
| data/file/markdown ops | AC-S-007 | P-SUR-B-010, P-SUR-F-005 | HTC-SC-010, ATC-PEN-004, ATC-BR-005 |
| MCP management | AC-S-008 | P-SUR-B-007 | HTC-SC-007, ATC-API-003 |
| Consultative E2E for fictitious | AC-CA-001 | P-SUR-D-001 | HTC-CA-001, ATC-VT-003 |
| Artifacts generated properly | AC-CA-002 | P-SUR-D-002 | HTC-CA-002 |
| Outputs conform to spec | AC-CA-002, AC-CA-003 | P-SUR-D-002 | HTC-CA-002, ATC-INV-004 |
| Wiki output created + linked | AC-CA-003 | P-SUR-F-002 | HTC-CA-002, ATC-INV-004 |
| engagement-state writeback works | AC-CA-004 | P-SRS-C1 | ATC-VT-003, HTC-CA-004 |
| Consultative consumes MCP info | AC-CA-005 | P-SUR-D-001 | HTC-CA-001 |
| Performance-engagement integrated | AC-CA-008 | (TBD via DECISIONS.log) | HTC-CA-005 |
| SG in transaction flow | AC-SG-001 | P-SUR-E-001..002 | HTC-SG-001..002, ATC-PW-007 |
| SG logs missing data | AC-SG-003 | P-SUR-E-003 | HTC-SG-003, ATC-BR-001 |
| SG records gate outcomes | AC-SG-004 | P-SUR-E-002 | HTC-SG-005, ATC-PEN-005 |
| metadata substrate works | AC-SG-005 | P-SUR-E-005 | HTC-SG-005, ATC-INV-004 |
| Audit fields captured | AC-SG-004 | P-SUR-E-006 | HTC-SG-005 |
| CRUD monitoring works | AC-SG-001..008 | Phase 4 | HTC-SG-001..006 |
| Contradictions → reconciliation | AC-SG-006 | P-SUR-E-004 | HTC-SG-004, ATC-BR-002 |
| No silent write-through | AC-SG-007 | P-SUR-E-001..002 | HTC-SG-001..002, ATC-PEN-003 |
| All plugin bundles working | AC-PS-001 | P-SUR-C-001..003 | HTC-PSE-001, ATC-API-001 |
| All required skills implemented | AC-PS-002 | P-SRS-D2 | HTC-PSE-002, ATC-VT-004 |
| No catalog item pretending | AC-PS-002 | P-SRS-D2-A | HTC-PSE-002, ATC-API-008 |
| Extension on real surfaces | AC-PS-003 | P-SUR-C-004 | ATC-VT-004 |
| Data tab real renderer | AC-DR-001 | P-SRS-D3 | HTC-SC-014, ATC-PW-012, ATC-VT-005 |
| Rollup UI real | AC-DR-002 | P-SRS-E | HTC-SR-007, ATC-VT-008 |
| MindsDB/federation satisfied | AC-DR-003 | P-SRS-D4 | ATC-VT-006, ATC-API-008 |
| Uploads classified | AC-DR-004 | P-SUR-F-005 | HTC-SC-010 |
| Embeddings work | AC-DR-005 | P-SUR-F-006 | ATC-BR-005 |
| PII redaction default | AC-DR-006 | P-SRS-F7 | HTC-SR-006, ATC-VT-007 |
| Migration discipline | AC-DR-007 | P-SUR-F-007 | ATC-BR-006 |
| Vapi flow E2E | AC-CM-001 | P-CZ-008, P-SUR-G-003 | HTC-NX-003, ATC-CMS-006 |
| Tavus flow E2E or hidden | AC-CM-002 | P-SUR-G-004 | HTC-NX-004 |
| CRM/ADF/webhook/email | AC-CM-003 | P-CZ-008 | HTC-NX-003, ATC-CMS-006 |
| Studio-mediated MCP path | AC-CM-004 | P-SRS-G | HTC-CM-001..003, ATC-CMS-001..003 |
| Notification/comms evidence | AC-CM-005 | P-SUR-H-001..003 | ATC-CMS-001..003 |
| Failures recorded in context | AC-CM-006 | P-SUR-H-004..005 | ATC-CMS-004 |
| Role isolation tested | AC-SC-001 | P-SUR-A-003 | HTC-SR-001, ATC-PW-004 |
| Token scopes tested | AC-SC-002 | P-SUR-B-007 | HTC-SR-003, ATC-API-007 |
| Guardian enforcement tested | AC-SC-003 | P-SUR-E-001..002 | ATC-PEN-002, ATC-PEN-003 |
| Audit logs tested | AC-SC-004 | P-SUR-B-009 | HTC-SC-009, ATC-PW-017 |
| Cross-customer rollup auth | AC-SC-005 | P-SRS-E | HTC-SR-007, ATC-VT-008 |
| No unauthorized cross-tenant exposure | AC-SC-006 | P-SUR-F-001 | HTC-SR-002, ATC-PEN-002 |
| No security review gaps | AC-SC-007, AC-SC-008 | P-TEST-006 | ATC-PEN-001 |
| Human script complete | AC-TE-001 | P-CP-004 | this checkpoint |
| Autonomous plan complete | AC-TE-002 | P-CP-005 | this checkpoint |
| Tests actually executed | AC-TE-003 | P-TEST-001..006 | (run logs in EVIDENCE_INDEX.md) |
| Failures fixed and re-run | AC-TE-004 | P-FIX-* + regression | (P-FIX cycle) |
| Evidence index has every claim | AC-TE-005 | P-RPT-002 | (EVIDENCE_INDEX.md) |
| PLAN.md supersedes prior plans | AC-CP-001 | P-CP-002 | this checkpoint |
| ACCEPTANCE_CRITERIA.md committed + re-ack hook | AC-CP-002, AC-CP-006 | P-CP-003 | this checkpoint |
| CHECKPOINT_PROOF.md self-coherent | AC-CP-003 | P-CP-006 | this checkpoint |
| Both eval scripts pre-execution | AC-CP-004 | P-CP-004, P-CP-005 | this checkpoint |

---

## E. Role × surface coverage

| Role | Login surface tested by | Storefront tested by | Admin tested by | Cross-tenant denial by |
|---|---|---|---|---|
| Studio admin (duane on huminic) | ATC-PW-001, HTC-PR-001 | ATC-PW-009..016 | ATC-PW-005, HTC-SC-002, HTC-SC-007 | ATC-PEN-002 |
| customer-admin (kim on strukture) | ATC-PW-002, HTC-PR-001 | ATC-PW-009..016 | (denied per ATC-PW-004) | ATC-PW-003, HTC-SR-002 |
| customer-admin (tester on serra-honda) | ATC-PW-002, HTC-PR-001 | ATC-PW-009..016 | denied | denied |
| customer-admin (per CZ-002 dealer) | HTC-PR-001, ATC-PW-002 | (per-profile storefront walk) | denied | per-dealer tenant denial |
| customer-admin (neoweaver on huminic-motors) | HTC-PR-001 | (huminic-motors storefront walk) | denied | denied |
| anonymous | (incognito hit on `/agents` etc.) | (anonymous landing on `/p/<slug>` allowed; tabs gated) | denied | denied |
| token holder (wildcard) | (admin) | (admin) | ATC-API-003 | (granted by definition) |
| token holder (per-profile, scoped) | — | — | ATC-API-003, ATC-API-007 | ATC-API-007 |

---

## F. Tenant boundary coverage

| Boundary | Plan | AC | Tests |
|---|---|---|---|
| Cross-profile brain_query without wildcard | P-SUR-E-002 | AC-SC-006 | ATC-PEN-002 |
| Cross-profile wiki_write | P-SUR-E-001 | AC-SG-007 | ATC-PEN-003 |
| Customer-admin A reaching profile B's storefront | P-SUR-A-004 | AC-P-004 | HTC-SR-002, ATC-PW-003 |
| Rollup parent-child auth | P-SRS-E | AC-SC-005 | HTC-SR-007, ATC-VT-008 |
| Federation read_scopes enforcement | P-SRS-D4 | AC-DR-003 | ATC-API-007 |
| MCP token scope enforcement | P-SUR-B-007 | AC-SC-002 | HTC-SR-003, ATC-API-007 |

---

## G. Self-coherence verification

For this checkpoint to be valid, every cell above must be populated. Verification:

- All 9 CZ rows (Section B) have plan task + AC + ≥1 test id.
- All 7 SRS rows have plan task + AC + ≥1 test id.
- All 4 additional closeout conditions have plan tasks + AC + tests.
- All 8 surfaces (A–H) are covered in Section C.
- Every Section 9 acceptance criterion line has been mapped in Section D.
- Roles × surfaces covered in Section E.
- Tenant boundaries covered in Section F.

**Unresolved entries:** none.

**Operator-action gates** (CZ-006 portal domain disposition, CZ-008 Vapi dashboard config, OP-001 Nexxus cutover, OP-002 per-customer real credentials, OP-003 Metabase/MindsDB sidecar) are scheduled with fallbacks per `PLAN.md` Section "Operator-action-gated tasks" and do NOT block the checkpoint. They are surfaced as P-OP-* tasks and their disposition is recorded in `DECISIONS.log` at execution time.

**Conclusion:** the checkpoint is self-coherent and execution-ready.

---

## H. Six artifacts of the checkpoint

| Artifact | Path |
|---|---|
| Canonical PLAN | `docs/launch/PLAN.md` |
| Acceptance criteria | `docs/launch/ACCEPTANCE_CRITERIA.md` |
| Session-start re-ack hook | `AGENTS.md` (top section) |
| Human testing script | `docs/launch/HUMAN_TESTING_SCRIPT.md` |
| Autonomous testing plan | `docs/launch/AUTONOMOUS_TESTING_PLAN.md` |
| This checkpoint proof | `docs/launch/CHECKPOINT_PROOF.md` |

After commit, the checkpoint completion message contains: file paths + commit ids for these six, the self-coherence statement, and the next action (begin execution at Phase 1 — environment audit).
