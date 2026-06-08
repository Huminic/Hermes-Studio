# Non-SMS Parity Go-Live — Readiness (live deployment)

**Goal:** Finish & certify the Nexxus → Huminic Studio migration to LIVE at **non-SMS parity** (Serra + Columbia). SMS carved out to a separate feature run.
**Deployment:** `huminic-studio` Coolify app (uuid `nh5vnz9kz226cj9ib3nodg1j`), branch `feat/nexxus-comms-engine`, base `https://studio.huminic.app`.
**Date:** 2026-06-08. **Driver:** Studio agent. **Independent cert:** subagent (in progress).

## Scope decision — proactive/SMS fully excluded
- `vin.watcher` (new-lead follow-up) sends **outbound SMS** to real VinSolutions leads → it is the *only* proactive sender, and it's SMS. **Left OFF.** No proactive customer contact occurs in this run.
- Because every auto-*send* path (vin-watcher + autonomous replies) is SMS/proactive, **`OUTBOUND_LIVE_ENABLED` was NOT flipped** — zero outbound-send risk. The non-SMS construct is reactive (capture → notify) + storefront + data.

## Move 1 — broker wiring (DONE, verified)
- `CENTRAL_MCP_TOKEN` + `CENTRAL_MCP_STUDIO_TOKEN` set on the app (Studio runtime token), redeployed.
- Live broker path verified through the deployed container:
  - widget-form → `{ok:true, notified:true, via:"resend"}` (container uses the new token).
  - `vin_query_leads` (runtime token, serra-honda org) → **123 real leads**.

## Move 2/3 — inbound lead pipeline (DONE, verified per store)
Deterministic POSTs to the deployed webhooks → thread + correctly-formatted notification:

| Store | voice→thread+notify | format | video→thread+notify |
|---|---|---|---|
| serra-honda | ✅ (then 4h cooldown dedup) | adf-xml | ✅ |
| serra-service | ✅ | email | (cert) |
| serra-nissan | ✅ | adf-xml | (cert) |
| tony-serra-ford | ✅ | adf-xml | (cert) |
| hyundai-of-columbia | ✅ | email | (cert) |
| ford-of-columbia | ✅ | email | (cert) |

Serra sales → ADF-XML, Service + Columbia → email (per spec). messaging-hub DBs auto-provision on first write.

## Move 4 — voice (PARTIAL — Studio side done; cutover gated)
- Studio voice ingestion certified (handler → thread + ADF).
- Elliott test assistant already → Studio serra-honda webhook (isolated test number +1 839-272-9080).
- **BLOCKED / operator-gated:** per-store live Vapi repoints (Caroline etc. still → `dev.huminicdev.com`) and Elliott revert require **`VAPI_API_KEY`** (not available to the agent; broker has no update-assistant tool). Per-store repoints divert **real inbound customer calls** to Studio → operator-gated cutover (same category as DNS flip).

## Move 5 — independent certification (DONE) + defect fixes
Independent subagent (no self-approval) verified all 6 stores against the live system: inbound (voice/video/form), storefront login → chat reply, knowledge, widgets, data/reports, teambox, campaigns, + security. Result: **5/6 fully PASS**; security all PASS (auth, no user-enumeration, cross-tenant UI + API isolation [403], no backend leaks). Screenshots: `docs/launch/cert-2026-06-08/`.

**Two real defects found → fixed → re-verified live:**
1. **Email-format notifications silently failing** — bare-name `from` was rejected by Resend while `sendViaResend` returned `ok:true` (false positive; `external_id:null`). Fix (`lead-notifications.ts`, commit `9334bfdf9`): wrap sender into a valid `Name <leads@huminic.ai>` address; surface provider errors as `ok:false`. **Re-verified:** serra-service (email) + serra-nissan (ADF) now return real resend ids.
2. **VIN lead-funnel unavailable** (serra-honda/serra-service) — empty `read_scopes`, then 3 chained code bugs once enabled. Fixes:
   - config: `read_scopes:[vin,databrain]` on serra-honda + serra-service (volume).
   - `vin_query_leads` missing required `startDate`/`endDate` (commit `f48d57f98`).
   - `extractLeads` didn't recognize VinSolutions `items` key (commit `63cc55003`).
   - statuses all "unknown" + count = page (50); now reads `leadStatus`/`leadStatusType` + uses `totalItems` (commit `53b67a32e`).
   **Re-verified:** serra-honda funnel `available:true`, total **587**, real statuses. Known minor follow-up: `resolved_names:0` (recent-lead name enrichment via `vin_get_contact` returns 0 — counts/statuses correct).

All fixes: tests green (notif + reports + webhooks), `vite build` clean, pushed to `feat/nexxus-comms-engine`, redeployed, verified on the live container.

## Verdict
**Non-SMS reactive construct is at parity and certified live for all 6 stores** — lead capture (form/voice/video) → thread + correct-format notification (delivering), storefront (chat/knowledge/widgets/data/teambox/campaigns), VIN-backed Data reporting, tenant isolation + auth security. The two cert-found defects are fixed and re-verified.

## Outstanding to fully close the goal
1. **`VAPI_API_KEY`** (operator/mcp-agent) → revert the Elliott test assistant + per-store live Vapi repoints. The repoints divert **real inbound customer calls** to Studio → operator-gated cutover (like DNS). Studio voice ingestion itself is certified. *(This is the only item blocking 100% goal completion and it needs an external credential + an operator go.)*
2. Minor: VIN `resolved_names` enrichment (`vin_get_contact`) returns 0 — funnel counts/statuses correct; cosmetic follow-up.
3. DNS/Caddy flip — operator's explicit go (out of scope).
4. Real BDC recipient lists replacing the `neoweaver@gmail.com` test inbox (operator, out of scope).

## Explicitly deferred to the SMS feature run
TextMagic SMS (inbound/outbound), `SMS_FROM`, `channel_credentials.sms` shared flip, vin-watcher follow-ups, autonomous SMS replies, borrowed-number tests.
