# EVIDENCE_INDEX — Huminic Studio launch closeout

**Date initialized:** 2026-06-01
**Format:** anchor links from `ACCEPTANCE_CRITERIA.md` AC-* ids and `PLAN.md` P-* tasks point here. Each cell either has evidence (PASS) or is open (RED).

A criterion can be marked GREEN in `ACCEPTANCE_CRITERIA.md` only when its anchor here references a real artifact.

---

## Status legend

- **PASS** — evidence captured, criterion green
- **PENDING** — task in progress, evidence not yet captured
- **DEFERRED-WITH-DISPOSITION** — out of launch scope per a `DECISIONS.log` entry; the disposition itself is the evidence
- **BLOCKED** — waiting on an operator gate (with fallback documented)

---

## Environment state

### #env-state — `P-ENV-001`
- **Status:** PENDING
- **Target evidence:** Coolify image hash + container env-var inventory + volume mount verification.

### #profile-state — `P-ENV-002`
- **Status:** PENDING
- **Target:** matrix of all production profiles × {auth.yaml present, studio.yaml present, mcp.json present, brain.db present, schema_version}.

### #dealer-universe — `P-ENV-003`
- **Status:** PROVISIONAL (recorded in `CHECKPOINT_PROOF.md` Section A; to be re-verified by HTC-NX-001 + ATC-API-002 at run time)
- **Canonical launch-scope dealer universe:** serra-honda, serra-nissan, serra-service, tony-serra-ford, ford-of-columbia, hyundai-of-columbia, serra-automotive (7 total). serra-honda already has `tester` auth.yaml; the other 6 receive auth.yaml in P-CZ-002.

### #coolify-state — `P-ENV-004`
- **Status:** PENDING
- **Target:** domain list, env-var-API endpoint that works for dockercompose apps, current image deployment state.

### #secrets-set — `P-ENV-005`
- **Status:** PENDING
- **Target:** confirm HERMES_PASSWORD, CENTRAL_MCP_TOKEN, CENTRAL_MCP_URL, CENTRAL_MCP_STUDIO_TOKEN, OPENROUTER_API_KEY, HERMES_API_URL all set durably in Coolify.

### #vitest-baseline — `P-ENV-006`
- **Status:** PENDING
- **Target:** baseline `pnpm test` output count + build clean.

---

## CZ closeout

### #cz-002-dealer-auth — `P-CZ-002` — AC-P-001..003
- **Status:** PENDING
- **Target:** list of 6 dealer slugs with auth.yaml file checksum + 0600 perm + successful login screenshot per dealer.

### #cz-003-huminic-motors — `P-CZ-003` — AC-CM-001, AC-P-001
- **Status:** PENDING
- **Target:** profile dir listing + studio.yaml content + auth.yaml content + Elliott agent SOUL + lead_notifications.adf_email.

### #cz-004-reset-endpoint — `P-CZ-004` — AC-A-003, AC-A-007
- **Status:** PENDING
- **Target:** `src/server/password-reset.ts` + endpoint file + vitest run id + curl-against-deployment result.

### #cz-005-reset-page — `P-CZ-005` — AC-A-004, AC-A-005
- **Status:** PENDING
- **Target:** `src/routes/api/auth/reset-confirm.ts` + `src/routes/reset.tsx` + vitest run id + Playwright trace.

### #cz-006-portal-domain — `P-CZ-006` — AC-A-002
- **Status:** BLOCKED on operator action OR resolved by fallback per `DECISIONS.log`.

### #cz-007-reset-canary — `P-CZ-007` — AC-A-006
- **Status:** PENDING
- **Target:** ATC-PW-008 trace + Resend email id + comms_log row id + audit row id.

### #cz-008-elliott-adf — `P-CZ-008` — AC-CM-001, AC-CM-003
- **Status:** BLOCKED on operator Vapi dashboard step OR DEFERRED-WITH-DISPOSITION per fallback.
- **Target:** webhook 200 log line + ADF email at neoweaver@gmail.com + transcript reference.

### #cz-009-cutover-doc — `P-CZ-009` — AC-G-002
- **Status:** PENDING
- **Target:** git diff against `docs/cutover-ritual.md`.

---

## SRS partial closeout

### #srs-c1-engagement-writeback — `P-SRS-C1` — AC-CA-004
- **Status:** PENDING
- **Target:** consultative-engine.ts diff + vitest run id (ATC-VT-003) + ATC-PW-015 trace.

### #srs-d2-skill-disposition — `P-SRS-D2-A` — AC-PS-002, AC-G-002
- **Status:** PENDING
- **Target:** per-skill row matrix {id, decision (real | remove), reason} in this file under the disposition heading.

### #srs-d2-skills-real — `P-SRS-D2-B` — AC-PS-002, AC-PS-003
- **Status:** PENDING
- **Target:** per-retained-skill TS module + vitest invocation evidence + audit row.

### #srs-d3-data-tab — `P-SRS-D3` — AC-DR-001
- **Status:** PENDING
- **Target:** per-decision artifact: either the new renderer module + vitest + ATC-PW-012 trace OR the removal verification + nav-absence check across launch-scope profiles.

### #srs-d4-federation — `P-SRS-D4` — AC-DR-003
- **Status:** PENDING
- **Target:** either MindsDB deployment proof + ATC-VT-006 against it OR removal from `/api/mcp/<profile>` tools/list verified by ATC-API-008.

### #srs-e-rollup-ui — `P-SRS-E` — AC-DR-002
- **Status:** PENDING
- **Target:** per-decision artifact: either the rollup UI module + ATC-VT-008 OR the absence verification.

### #srs-f7-pii-redactor — `P-SRS-F7` — AC-DR-006
- **Status:** PENDING
- **Target:** redactor module + ATC-VT-007 covering SSN/CC/email + opt-in remote model gate verification.

### #srs-g-mcp-mediated-comms — `P-SRS-G` — AC-CM-004, AC-CM-005
- **Status:** PENDING
- **Target:** per-channel MCP-mediated dispatch evidence (ATC-CMS-001/002/003) with email_id / SMS id / call sid + comms_log row id + audit row id.

---

## Surface verification

(All P-SUR-* tasks; each populates its own anchor once evidence is captured. Anchors are listed for completeness.)

| Anchor | Plan | Status |
|---|---|---|
| #sur-a-001 | P-SUR-A-001 | PENDING |
| #sur-a-002 | P-SUR-A-002 | PENDING |
| #sur-a-003 | P-SUR-A-003 | PENDING |
| #sur-a-004 | P-SUR-A-004 | PENDING |
| #sur-a-005 | P-SUR-A-005 | PENDING |
| #sur-a-006 | P-SUR-A-006 | PENDING |
| #sur-b-001..010 | P-SUR-B-001..010 | PENDING |
| #sur-b-011..017 | P-SUR-B-011..017 | PENDING |
| #sur-c-001..005 | P-SUR-C-001..005 | PENDING |
| #sur-d-001..005 | P-SUR-D-001..005 | PENDING |
| #sur-e-001..007 | P-SUR-E-001..007 | PENDING |
| #sur-f-001..009 | P-SUR-F-001..009 | PENDING |
| #sur-g-001..006 | P-SUR-G-001..006 | PENDING |
| #sur-h-001..006 | P-SUR-H-001..006 | PENDING |

---

## Test execution

### #test-001-vitest-suites — `P-TEST-001`
- **Status:** PENDING

### #test-002-playwright-traces — `P-TEST-002`
- **Status:** PENDING

### #test-003-vitest-final — `P-TEST-003`
- **Status:** PENDING

### #test-004-playwright-traces — `P-TEST-004`
- **Status:** PENDING

### #test-005-audit-tests — `P-TEST-005`
- **Status:** PENDING

### #test-006-pentest — `P-TEST-006`
- **Status:** PENDING

---

## Broken-link audit

### #broken-links — `P-SUR-B-001..017`
- **Status:** PENDING
- **Target:** route → http-status map dumped by ATC-PW-018 to `tests/traces/atc-pw-018/route-sweep.json`. Every reachable route returns 200 OR 401-with-correct-redirect OR an intentional 404 page.

---

## Final closeout

### #closeout-review — `P-RPT-003` — AC-FC-005
- **Status:** PENDING
- **Target:** `docs/launch/CLOSEOUT_REVIEW.md` from independent code-reviewer subagent.

### #launch-closeout-report — `P-RPT-004` — AC-FC-001..005
- **Status:** PENDING
- **Target:** `docs/launch/LAUNCH_CLOSEOUT_REPORT.md` per Section 12 format.
