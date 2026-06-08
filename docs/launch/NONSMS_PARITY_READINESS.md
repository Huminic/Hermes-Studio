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

## Move 5 — independent certification (IN PROGRESS)
Subagent verifying, per store, against the live system: inbound (voice/video/form), storefront login → chat reply, knowledge, widgets, data/reports, teambox, campaigns, + security spot-checks. Results to be appended.

## Outstanding to fully close the goal
1. `VAPI_API_KEY` (operator/mcp-agent) → revert Elliott + per-store voice repoints (operator-gated cutover).
2. Independent cert results (subagent) appended + any defects resolved.
3. DNS/Caddy flip — operator's explicit go (out of scope).

## Explicitly deferred to the SMS feature run
TextMagic SMS (inbound/outbound), `SMS_FROM`, `channel_credentials.sms` shared flip, vin-watcher follow-ups, autonomous SMS replies, borrowed-number tests.
