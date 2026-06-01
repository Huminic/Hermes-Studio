# Open Issues / Backlog

**Last updated:** 2026-06-01
**Source:** Honest audit after operator's review of the launch readiness claims.
**Format:** Each entry has Status (DEFERRED / PARTIAL / NOT-DONE), Impact, Smallest portable fix, Operator-action vs Agent-action.

---

## Voice (new — added 2026-06-01)

### V-001 — Browser-native voice mode for Studio chat
- **Status:** NOT-DONE — added to backlog at operator's direction
- **Why deferred:** Hermes' built-in voice is CLI-only (per Nous docs). Vapi gives two-way voice today but each customer needs their own Vapi credential pool which isn't operator-budget-friendly for multi-customer deployment. Browser-native is the right shape for multi-tenant.
- **Impact:** Storefront chat is text-only. Operators/customers can't talk to their agent directly through the web UI.
- **Smallest portable fix:** Path B from 2026-06-01 conversation. Plugin component on Chat tab + `/api/voice/$profile` WebSocket + Whisper STT + Edge TTS. ~2 days work. Uses existing Hermes chat-completions for the brain part. No Hermes core changes.
- **Owner:** Agent (when prioritized)

---

## CZ.x portal cutover items (the work I conflated into Tranche A without delivering)

### CZ-002 — Provision the 6 Nexxus dealer placeholder auth.yaml accounts
- **Status:** NOT-DONE
- **Why deferred:** PLAN_INTEGRATION.md folded this into Tranche A.5 but it never got picked up — Tranche A was substrate work, not provisioning.
- **Impact:** 5 of the 6 Nexxus stores have NO auth.yaml. They can't be logged into via the portal yet (only serra-honda has the legacy `tester` account).
- **Smallest portable fix:** Script `scripts/provision-cz2-dealers.ts` that writes 6 auth.yaml files with `<slug>@huminic.app / De@l$ucce$`. Operator-driven on production volume.
- **Owner:** Agent

### CZ-003 — Huminic Motors test store profile
- **Status:** NOT-DONE
- **Why deferred:** Same fold-into-Tranche-A pattern.
- **Impact:** No canary store for password-reset testing + Elliott→ADF round-trip.
- **Smallest portable fix:** `scripts/provision-huminic-motors.ts` creating profile dir + studio.yaml (teal accent) + auth.yaml for `neoweaver@gmail.com / De@l$ucce$` + Elliott agent SOUL with `enabled: true` + 8 other agents disabled + `lead_notifications.adf_email: neoweaver@gmail.com`.
- **Owner:** Agent

### CZ-004 + CZ-005 — Password reset endpoints + /reset page
- **Status:** NOT-DONE — only the PortalLogin "forgot password?" button exists (clicks `/api/auth/reset-request` which 404s)
- **Why deferred:** Same fold pattern. The button exists in portal-login.tsx but the backend endpoint doesn't.
- **Impact:** PortalLogin's forgot-password button is broken.
- **Smallest portable fix:**
  - `src/server/password-reset.ts` (token registry, 15-min TTL, scrypt-hashed single-use tokens)
  - `src/routes/api/auth/reset-request.ts` POST `{email}` → emits Resend email via existing `comms_send_email` path
  - `src/routes/api/auth/reset-confirm.ts` POST `{token, new_password}` → updates matching profile's auth.yaml
  - `src/routes/reset.tsx` — page accepts `?token=` and renders new-password form
- **Owner:** Agent

### CZ-006 — Add portal.huminic.app to Coolify app domains
- **Status:** PARTIAL — env vars set (CENTRAL_MCP_*), but `portal.huminic.app` is NOT in the Coolify app's domain list
- **Why deferred:** Same fold pattern.
- **Impact:** Hitting `portal.huminic.app` doesn't reach Studio. Operator can't show customers the portal URL.
- **Smallest portable fix:** Coolify API call to add `portal.huminic.app` to the app's domain list + Cloudflare DNS check + `PORTAL_HOST` env var + redeploy. ~5 min.
- **Owner:** Agent (Coolify API has been authorized)

### CZ-007 — Password reset canary test
- **Status:** NOT-DONE (blocked on CZ-003 + CZ-004 + CZ-005)
- **Impact:** No proof of end-to-end password reset flow.
- **Owner:** Agent (after the above)

### CZ-008 — Elliott → Huminic Motors ADF round-trip
- **Status:** PARTIAL — Tranche G Story 8/8b/8c dispatched real comms (email + SMS + voice). But NOT the specific Vapi-webhook→ADF→email path through Huminic Motors.
- **Why deferred:** Different signal path: Vapi assistant Elliott dials/answers, generates a transcript, the transcript hits `/api/webhooks/vapi/huminic-motors`, the lead is parsed into ADF, ADF email goes out.
- **Impact:** Vapi inbound webhook + ADF emit pipeline hasn't been exercised end-to-end with a real Vapi call against a real profile.
- **Smallest portable fix:** Configure Elliott's end-of-call webhook to point at `https://studio.huminic.app/api/webhooks/vapi/huminic-motors`. Trigger via `scripts/elliott-test-huminic.ts`. Verify ADF email arrives at neoweaver@gmail.com. Operator-action partly because they need to configure the Vapi assistant.
- **Owner:** Agent + operator (Vapi dashboard step)

### CZ-009 — Update cutover-ritual.md for portal flow
- **Status:** NOT-DONE
- **Impact:** `docs/cutover-ritual.md` still describes the legacy `studio.huminic.app/p/<slug>` path, not the `portal.huminic.app` generic login flow.
- **Smallest portable fix:** Edit cutover-ritual.md to add portal hostname section + generic login + Huminic Motors canary + password reset flow.
- **Owner:** Agent

---

## SRS Tranche items that landed PARTIAL or DEFERRED

### SRS-C1-engagement-state-write (Tranche C.1)
- **Status:** PARTIAL
- **What's missing:** Consultative engine doesn't currently WRITE updates to `engagement-state.yaml` — it reads it and the adjacent neighbors flow into Brain, but stage transitions + readiness-gate signatures aren't persisted back to the YAML
- **Impact:** `/engagements/$customer` UI shows stale stage info after a consultative run
- **Smallest portable fix:** Add `writeEngagementState(profile, state)` to consultative-engine + call it at each phase transition
- **Owner:** Agent

### SRS-D2-skill-implementations (Tranche D.2)
- **Status:** SCAFFOLDS ONLY
- **What's missing:** 13 SKILL.md frontmatter stubs exist; actual TypeScript skill implementations don't
- **Impact:** Skill activation is decorative — the actual workflows hit raw MCP tools (which is honestly fine for now)
- **Smallest portable fix:** Per skill, when a workflow needs it: write a small skill module that orchestrates 2-3 MCP tools into a named capability
- **Owner:** Agent (per-workflow, no rush)

### SRS-D3-dashboard-renderer-real (Tranche D.3)
- **Status:** STUB
- **What's missing:** The customer Data tab is still a stub card. Metabase sidecar not deployed. Plugin-native renderer wasn't actually built either.
- **Impact:** No working dashboard for customers
- **Smallest portable fix:** Two paths — either deploy Metabase sidecar via Coolify + register per-profile DuckDB source + JWT embedding, OR build a small recharts/visx plugin renderer reading from `brain_query` + `mcp_rollup_query`. Per D-020, plugin-native is the lower-cost path.
- **Owner:** Agent (when post-launch capacity)

### SRS-D4-mindsdb-real (Tranche D.4)
- **Status:** SHIM
- **What's missing:** MindsDB sidecar not deployed; `federation_query` returns structured stub
- **Impact:** Federation queries don't actually hit external data sources
- **Smallest portable fix:** Coolify sidecar deployment of MindsDB + per-profile datasource config + `MINDSDB_URL` env. Operator-action for sidecar provisioning; Agent for the per-datasource config files.
- **Owner:** Agent + Operator

### SRS-E-rollup-dashboard (Tranche E SHOULD)
- **Status:** DEFERRED
- **What's missing:** Huminic-the-company dashboard surface that uses `mcp_rollup_query` to render aggregated views
- **Impact:** Rollup data exists; no UI shows it
- **Smallest portable fix:** Couples with D.3 — same renderer that handles customer Data tab handles Huminic-parent rollup view
- **Owner:** Agent

### SRS-F7-pii-redactor (Tranche F.7)
- **Status:** PARTIAL
- **What's missing:** Documented hook (`EMBED_PII_REDACTOR` env) but no default redactor implementation
- **Impact:** ONLY matters if operator enables a remote embedding model. Default local-hash-v1 has zero data egress.
- **Smallest portable fix:** Pluggable redactor module + 2-3 sample redactor implementations (regex for SSN/CC/email; spacy-NER for names; LLM-based)
- **Owner:** Agent + Operator (operator picks policy)

### SRS-G-comms-tools-real-path (Tranche G)
- **Status:** WIRED-BUT-NOT-E2E
- **What's missing:** `comms_send_email` / `comms_send_sms` / `comms_initiate_call` MCP tools exist + have tests + ride the DSG/rate-limit/audit pipeline. But the Tranche G eval bypassed them and called central-mcp tools directly. The full Studio→MCP-dispatcher→comms-handler→central-mcp path hasn't been exercised end-to-end with a real artifact in flight.
- **Impact:** Real comms work today via direct central-mcp tool calls; the MCP-mediated path is mechanically tested but lacks one e2e live artifact for evidence
- **Smallest portable fix:** Re-issue one email through `comms_send_email` via `/api/mcp/wiki` with a real token; capture the audit log + comms_log row as evidence
- **Owner:** Agent (5 min once a real customer token is issued)

---

## Operator-action gates (no agent action possible)

### OP-001 — Nexxus DNS / cutover
- **Status:** OPERATOR-ONLY (out of scope per SRS 8.3)
- **What's needed:** `live.huminic.app` → `portal.huminic.app` Caddy edit + Nexxus stop
- **Owner:** Duane

### OP-002 — Per-customer real provider credentials
- **Status:** OPERATOR-ONLY
- **What's needed:** Per-profile Vapi assistant IDs + TextMagic numbers + VinSolutions OAuth per dealer
- **Owner:** Duane

### OP-003 — Metabase / MindsDB sidecar Coolify deployment
- **Status:** OPERATOR-NEEDED (agent can prepare configs)
- **What's needed:** Coolify project edits to add MindsDB + Metabase containers
- **Owner:** Duane

---

## Honest mea culpa

I wrote a launch readiness report that said "GO" while CZ.2–CZ.9 was conflated into Tranche A acceptance and never actually delivered. The SRS tranches themselves landed honestly; the portal-cutover sub-deliverables I'd folded in did not. Operator caught it.

Going forward: every PLAN_INTEGRATION.md merge of CZ items into SRS tranche acceptance should be recorded as a sub-deliverable in the tranche report with DONE/PARTIAL/NOT-DONE status, the way Tranche F's PII redactor was. I'll apply that discipline if/when more sub-items get folded in.
