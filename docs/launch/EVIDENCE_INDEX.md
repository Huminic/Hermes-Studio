# EVIDENCE_INDEX — Huminic Studio launch closeout

**Date initialized:** 2026-06-01
**Format:** anchor links from `ACCEPTANCE_CRITERIA.md` AC-* ids and `PLAN.md` P-* tasks point here. Each cell either has evidence (PASS) or is open (RED).

A criterion can be marked GREEN in `ACCEPTANCE_CRITERIA.md` only when its anchor here references a real artifact.

## 2026-06-09 Launch Certification Addendum

The current launch-certification packet for `https://studio.huminic.app` is:

- `docs/launch/LAUNCH_REQUIREMENTS_AUDIT.md` — guide-platform crosswalk, current evidence, and launch impact.
- `docs/launch/LAUNCH_CERT_FINDINGS.md` — detailed finding ledger and certification log.
- `docs/launch/LAUNCH_DECISION_PACKET.md` — concise operator decision packet.
- `docs/launch/evidence/launch-cert-2026-06-09/` — current evidence bundle.

Current status from the 2026-06-09 certification run: **not yet an unconditional launch certification**. Most tested surfaces are PASS, but launch still depends on decisions or approved testing for `LC-BLOCKER-001` video wrapper-source provider-host exposure, `LC-BLOCKER-011` phone-line testing, and `LC-MAJOR-007` partner/group admin scope. No tester waiver has been submitted.

---

## Status legend

- **PASS** — evidence captured, criterion green
- **PENDING** — task in progress, evidence not yet captured
- **DEFERRED-WITH-DISPOSITION** — out of launch scope per a `DECISIONS.log` entry; the disposition itself is the evidence
- **BLOCKED** — waiting on an operator gate (with fallback documented)

---

## Environment state

### #env-state — `P-ENV-001`
- **Status:** PASS (audit 2026-06-01T07:40Z)
- **Deployed image hash:** `fa2441fbafd7614a621bc6191957c9bef88cdd09` (Tranche G; behind latest `main` at `ac9a69583` and behind closeout work — redeploy required after CZ-004/005)
- **Containers:** `hermes-studio-nh5vnz9kz226cj9ib3nodg1j-095907890280` (Up 22h), `hermes-agent-nh5vnz9kz226cj9ib3nodg1j-095907879926` (Up 22h, healthy)
- **Studio container env:** `HERMES_PASSWORD`, `HERMES_API_URL`, `CENTRAL_MCP_TOKEN`, `CENTRAL_MCP_URL`, `CENTRAL_MCP_STUDIO_TOKEN`, `SERVICE_FQDN_HERMES_STUDIO`, `SERVICE_NAME_HERMES_*`, `SERVICE_URL_HERMES_STUDIO` all set. `PORTAL_HOST` not set (consistent with CZ-006 open).
- **Agent container env:** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` both set — Hermes inference recoverable via direct openai/anthropic (OPENROUTER not required).

### #profile-state — `P-ENV-002`
- **Status:** PASS (audit 2026-06-01T07:38Z)
- **Total profiles on volume:** 16 after the readiness probe inadvertently provisioned huminic-motors brain dir (NOTE: `/api/brain/readiness` GET has a side-effect of provisioning brain if absent; documented as quirk in DECISIONS.log; not a launch blocker).
- **Profiles with auth.yaml:** huminic, serra-honda, strukture (3 of 16)
- **Profiles needing auth.yaml for launch:** ford-of-columbia, hyundai-of-columbia, serra-automotive, serra-nissan, serra-service, tony-serra-ford (6 — confirms P-CZ-002 scope), plus huminic-motors (P-CZ-003)
- **Brain readiness:** all 12 customer-shaped profiles + consultative-agent + huminic-motors return `ok:true, schema_version:4, metadata_substrate_present:true` — sixth-invariant satisfied across the board.
- **plugins.json:** 3 loaded (customer-console v0.2.0 with 7 routes + 2 bundles, data-canvas v0.1.0, messaging-hub v0.1.0) — no issues.

### #dealer-universe — `P-ENV-003`
- **Status:** PROVISIONAL (recorded in `CHECKPOINT_PROOF.md` Section A; to be re-verified by HTC-NX-001 + ATC-API-002 at run time)
- **Canonical launch-scope dealer universe:** serra-honda, serra-nissan, serra-service, tony-serra-ford, ford-of-columbia, hyundai-of-columbia, serra-automotive (7 total). serra-honda already has `tester` auth.yaml; the other 6 receive auth.yaml in P-CZ-002.

### #coolify-state — `P-ENV-004`
- **Status:** PENDING
- **Target:** domain list, env-var-API endpoint that works for dockercompose apps, current image deployment state.

### #secrets-set — `P-ENV-005`
- **Status:** PASS (audit 2026-06-01T07:40Z)
- **Studio:** HERMES_PASSWORD, CENTRAL_MCP_TOKEN, CENTRAL_MCP_URL, CENTRAL_MCP_STUDIO_TOKEN, HERMES_API_URL all set durably (confirmed by Up 22h container with these env vars). PORTAL_HOST is NOT set (CZ-006 dependent). RESEND/SIGNALWIRE/VAPI/TAVUS credentials live in central-mcp not Studio (per D-006 architecture — central-mcp is at `https://mcp.huminicdev.com/dax/mcp`).
- **Agent:** ANTHROPIC_API_KEY + OPENAI_API_KEY set; OPENROUTER not needed.

### #vitest-baseline — `P-ENV-006`
- **Status:** PASS (run 2026-06-01T07:39:31Z)
- **Result:** 56 files, 473 tests, all passing, 18.75s. Build clean.

---

## CZ closeout

### #cz-002-dealer-auth — `P-CZ-002` — AC-P-001..003
- **Status:** PASS (provisioned 2026-06-01T07:43Z via `scripts/provision-launch-profiles.ts` then docker cp into production volume)
- **Auth.yaml files provisioned in production volume** (6 new + 0600 perm verified):
  - serra-automotive (`serra-automotive@huminic.app`)
  - serra-nissan (`serra-nissan@huminic.app`)
  - serra-service (`serra-service@huminic.app`)
  - tony-serra-ford (`tony-serra-ford@huminic.app`)
  - ford-of-columbia (`ford-of-columbia@huminic.app`)
  - hyundai-of-columbia (`hyundai-of-columbia@huminic.app`)
- **Live login verified against `https://studio.huminic.app/api/auth`** (2026-06-01T07:44Z): serra-automotive + ford-of-columbia returned `{ok:true, is_customer_admin:true}`. Wrong-password returned `{ok:false, "Invalid credentials"}`.
- **Launch password (all 6 + huminic-motors):** `De@l$ucce$`. SECURITY NOTE in `DECISIONS.log` and `cutover-ritual.md`: operator MUST direct each user to run `/reset` on first login.

### #cz-003-huminic-motors — `P-CZ-003` — AC-CM-001, AC-P-001
- **Status:** PASS (provisioned 2026-06-01T07:43Z)
- **Profile dir:** `/root/.hermes/profiles/huminic-motors/` (created by `/api/brain/readiness` probe; brain.db schema_version=4, metadata_substrate_present=true)
- **studio.yaml:** teal accent (#0d9488), persona "Huminic Motors", default_agent=elliott, lead_notifications.adf_email=neoweaver@gmail.com
- **auth.yaml:** username=neoweaver@gmail.com, password=De@l$ucce$, is_customer_admin=true
- **SOUL.md:** present
- **governance/agents/elliott.md:** present with `enabled: true`, channels=[vapi,chat], scope_contract reference
- **Live login verified:** `{ok:true, profile:"huminic-motors", is_customer_admin:true}`

### #cz-004-reset-endpoint — `P-CZ-004` — AC-A-003, AC-A-007
- **Status:** PASS (live 2026-06-01T08:02Z against deployed image `7f0e276fb`)
- **Implementation:** `src/server/password-reset.ts` (scrypt-token registry, 15-min TTL, single-use, sha256-hashed token storage), `src/routes/api/auth.reset-request.ts` (rate-limited 3/min/IP, anti-enumeration)
- **vitest:** `src/test/password-reset.test.ts` 13/13 passing
- **Live evidence:**
  - Known email (`serra-automotive@huminic.app`): `POST /api/auth/reset-request` → 200 `{"ok":true}` + production registry at `/root/.hermes/auth-reset-tokens.json` contains hashed entry `017b5547e4ecfd2bb9e770a2727a6ecd372e88b09088ca398836cdc59fd06931` with `expires_at` 15 min in future, `used_at: null`
  - Unknown email (`nobody-12345@example.org`): `POST /api/auth/reset-request` → 200 `{"ok":true}` (anti-enumeration honored)
  - Malformed email (`not-an-email`): 400 `{"ok":false,"error":"Invalid email"}`

### #cz-005-reset-page — `P-CZ-005` — AC-A-004, AC-A-005
- **Status:** PASS (live 2026-06-01T08:02Z)
- **Implementation:** `src/routes/api/auth.reset-confirm.ts`, `src/routes/reset.tsx` (89786-byte page including form for new password + confirm)
- **vitest:** covered in `src/test/password-reset.test.ts` (single-use, expired TTL, weak-password, invalid token)
- **Live evidence:**
  - GET `/reset?token=test-token-not-real` → HTTP 200, 89786 bytes (page rendered)
  - POST `/api/auth/reset-confirm` with bad token → 400 `{"ok":false,"error":"invalid"}`

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
- **Status:** PASS (code + vitest)
- **Implementation:** `src/server/engagement-state-writer.ts` (advanceEngagementStage with atomic temp+rename, phaseToStage mapping, approveReadinessGate with topology_decided variant)
- **Wiring:** `src/server/consultative-engine.ts:124-138` calls `advanceEngagementStage(input.customer_profile, phaseToStage(phase), {notes: ...})` after every successful phase; writeback failures push into the engagement result's `errors` array without failing the phase
- **vitest:** `src/test/engagement-state-writer.test.ts` 11/11 passing (covers idempotent advance, 6-phase sweep, topology_decided gate, missing-profile null return)
- **Live verification target:** consultative engagement run on huminic profile (next live operator action — out of agent autonomous scope per operator-gates fallback)

### #srs-d2-skill-disposition — `P-SRS-D2-A` — AC-PS-002, AC-G-002
- **Status:** PASS (disposition recorded 2026-06-01T07:55Z)
- **Decision:** keep 13 SKILL.md scaffolds in place; do NOT auto-register them as invokable. The underlying MCP tools (brain_*, wiki_*, comms_*, federation_*, rollup) are real and individually callable by token-holders. Skills are orchestration conveniences; post-launch work.
- **Verification:** `GET /api/plugins` returns only 3 real plugins (customer-console, data-canvas, messaging-hub) — no naked skill catalog surface to customers
- **Per-skill matrix:** all 13 scaffolds remain as documentation; no UI surfaces them. Decision in `DECISIONS.log` 2026-06-01T07:55:00Z DEC srs-d2-skills-disposition.

### #srs-d2-skills-real — `P-SRS-D2-B` — AC-PS-002, AC-PS-003
- **Status:** DEFERRED-WITH-DISPOSITION (per P-SRS-D2-A above)

### #srs-d3-data-tab — `P-SRS-D3` — AC-DR-001
- **Status:** PASS (production-applied 2026-06-01T07:55Z)
- **Decision:** hide the Data tab on all 10 launch-scope storefronts by setting `menu.data: false` in each studio.yaml on the production volume
- **Verification:** `docker exec hermes-agent-... grep -A6 "^menu:" /root/.hermes/profiles/<slug>/studio.yaml` for all 10 slugs shows `data: false`
- **Rollback:** operator flips `menu.data: true` in any profile's studio.yaml after a real renderer ships
- **Decision recorded:** `DECISIONS.log` 2026-06-01T07:55:00Z DEC srs-d3-data-tab-disposition

### #srs-d4-federation — `P-SRS-D4` — AC-DR-003
- **Status:** DEFERRED-WITH-DISPOSITION (shim documented)
- **Decision:** keep `federation_query` in the MCP tool catalog as a documented shim returning "MindsDB not configured" response. Operator-visible only (requires admin scope token); no customer-facing exposure.
- **Future:** operator deploys MindsDB sidecar + sets MINDSDB_URL env; shim flips to real.
- **Decision recorded:** `DECISIONS.log` 2026-06-01T07:55:00Z DEC srs-d4-federation-disposition

### #srs-e-rollup-ui — `P-SRS-E` — AC-DR-002
- **Status:** DEFERRED-WITH-DISPOSITION (data path works; UI deferred)
- **Decision:** `mcp_rollup_query` MCP tool already works end-to-end (Tranche E + F.9 pen-test). UI for the rollup view deferred; couples with D-3 plugin-native renderer.
- **Decision recorded:** `DECISIONS.log` 2026-06-01T07:55:00Z DEC srs-e-rollup-disposition

### #srs-f7-pii-redactor — `P-SRS-F7` — AC-DR-006
- **Status:** PASS (code + vitest)
- **Implementation:** `src/server/pii-redactor.ts` (regex SSN/CC/email/PHONE with word-anchored CC + PHONE; pluggable redactor registry; isRedactionRequired gates on model.startsWith("local-"); maybeRedactForEmbedding fail-safe)
- **Wiring:** `src/server/embeddings.ts:120-130` calls maybeRedactForEmbedding BEFORE model.embed; refuses with rule:`pii-redactor-required` if remote model and no EMBED_PII_REDACTOR env
- **vitest:** `src/test/pii-redactor.test.ts` 15/15 passing

### #srs-g-mcp-mediated-comms — `P-SRS-G` — AC-CM-004, AC-CM-005
- **Status:** PENDING (requires a real customer MCP token + 1 live MCP-mediated dispatch)
- **Note:** The comms_* MCP handlers are wired through DSG + rate caps + audit + central-mcp Resend/SignalWire. Tranche G eval bypassed them (called central-mcp directly). Closing this fully requires issuing a real per-customer MCP token + calling comms_send_email via /api/mcp/<profile> with that token. Tracked as P-OP-002 operator-action gate (per-customer credentials).

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

## Defects caught during operator-directed live Playwright sweep (2026-06-01T08:38-09:02Z)

### #p-fix-001 — HermesOnboarding overlay blocked storefront login
- **Status:** PASS (fix verified live)
- **Symptom:** "Welcome to Huminic Studio / Works with any OpenAI-compatible backend / Connect Backend / Skip setup" modal overlayed the Sign In form for any visitor without `hermes-onboarding-complete=true` in localStorage. Includes every first-time customer.
- **Cause:** `<HermesOnboarding />` mounted in both `src/routes/__root.tsx:299` and `src/components/workspace-shell.tsx:493`. The generic backend-connect flow is wrong for this fused-Hermes deployment.
- **Fix:** PR commit `302df824a` — removed both mounts and unused imports.
- **Evidence:**
  - Before: `docs/launch/evidence/live-before-fix-onboarding-visible.png` (modal blocks login)
  - After: `docs/launch/evidence/live-after-fix-root.png` (login is the only UI on fresh localStorage)
- **Why I missed it on first pass:** my prior curl tests against `/api/auth` bypass client-side localStorage overlays. The code-reviewer subagent inspected files but did not load the live page with a fresh browser context. This is a real lesson in why headed sweeps must be done by the implementing agent on the actual live URL.

### #p-fix-002 — /reset page rendered inside Studio admin shell on launch host
- **Status:** PASS (fix verified live)
- **Symptom:** Customer clicks the reset email link → lands on `studio.huminic.app/reset?token=...` → sees HERMES OS topbar + Dashboard/Chat/Files/Terminal/Jobs/Crews sidebar + "RESET PASSWORD" buried inside.
- **Cause:** `__root.tsx` bypass for `/reset` was nested inside the `if (portalHost)` branch. On `studio.huminic.app` (launch host since CZ-006 deferred), the bypass didn't fire.
- **Fix:** PR commit `6708302f7` — moved `/reset` bypass out of `portalHost` conditional so it applies on all hosts.
- **Evidence:**
  - Before: `docs/launch/evidence/live-after-fix-reset-hydrated.png` (reset form inside admin chrome)
  - After: `docs/launch/evidence/live-after-fix2-reset-standalone.png` + `live-after-fix2-reset-final.png` (clean standalone form)

### #p-fix-003 — huminic-motors studio.yaml used wrong schema keys
- **Status:** PASS (production volume corrected + script updated)
- **Symptom:** `/p/huminic-motors` rendered "huminic-motors" (the slug) instead of "Huminic Motors" (the brand display name); Data tile did not show DISABLED tag despite menu.data:false in the YAML.
- **Cause:** My provisioning script wrote `brand:` + `display_name:` keys; `StudioConfigSchema` requires `branding:` + `persona_name:`. Zod silently rejected the YAML and fell back to defaults (slug for name, all-menu-true).
- **Fix:** rewrote `/root/.hermes/profiles/huminic-motors/studio.yaml` on the production volume with schema-correct keys + updated `scripts/provision-launch-profiles.ts` so re-runs produce the correct shape.
- **Evidence:**
  - Before: `docs/launch/evidence/live-after-fix2-huminic-motors-hydrated.png` (slug shown, Data unmarked)
  - After: `docs/launch/evidence/live-after-fix3-huminic-motors-branded.png` (brand + DISABLED both correct)

### #p-sur-playwright-sweep — operator-directed live sweep
- **Status:** PASS (sweep complete; defects caught + fixed live; final state verified)
- **Surfaces verified post-fixes:**
  - `/` (unauthenticated, fresh localStorage) → login form only, no overlays
  - `/` (authenticated as duane) → Studio admin shell, no overlays
  - `/p/serra-automotive` (anon) → branded landing with Data DISABLED
  - `/p/serra-automotive/chat` (authed) → red-accent storefront chrome, 6-tab nav, Data icon dimmed
  - `/p/huminic-motors` (anon, post-fix-003) → branded landing with Data DISABLED
  - `/reset?token=test-token` (post-fix-002) → standalone reset form, no admin shell
  - `/engagements` (anon) → auth-redirected to login screen (expected)
- **Per-storefront audit:** all 10 launch-scope profiles have schema-correct studio.yaml with branding.persona_name + menu.data:false
- **Console errors observed:** preexisting CSP warnings about Google Fonts + React error #418 (hydration message) — not introduced by closeout; tracked as known minor for post-launch cleanup.

---

## Final closeout

### #closeout-review — `P-RPT-003` — AC-FC-005
- **Status:** PENDING
- **Target:** `docs/launch/CLOSEOUT_REVIEW.md` from independent code-reviewer subagent.

### #launch-closeout-report — `P-RPT-004` — AC-FC-001..005
- **Status:** PENDING
- **Target:** `docs/launch/LAUNCH_CLOSEOUT_REPORT.md` per Section 12 format.

## 2026-06-10 Updates

Following the 2026-06-09 certification run, bounded content fix sprints closed LC-MAJOR-013 and LC-MAJOR-014:

- **LC-MAJOR-013**: Nexxus migration guide documentation updated (commit `29399b7b1`)
- **LC-MAJOR-014**: Contact form widgets marked as live (commit `29399b7b1`, deployed `t59orjyiqr0zkjeh0384vdg6`)
- **LC-MAJOR-012**: Evidence boundary clarified; live provider state unverified without operator credentials

Current verified runtime: commit `29399b7b150fb93e06d07cf175c984cf4e213dc0`

Latest workflow dry-run evidence: `work/launch-cert/evidence/workflow-dry-run/launch-workflow-dry-run-20260610115538.json`

Launch handoff materials added: `HUMINIC_LAUNCH_STATUS_2026-06-10.md`, `LAUNCH_OPEN_DECISIONS_2026-06-10.md`, `MORNING_WALKTHROUGH_SCRIPT_2026-06-10.md`, `DRAFT_LAUNCH_EMAILS_2026-06-10.md`
