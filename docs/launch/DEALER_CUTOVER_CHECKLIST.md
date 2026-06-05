# Dealer Cutover Checklist + Readiness

**Updated:** 2026-06-05. **Branch:** `feat/nexxus-comms-engine` (committed, not pushed/deployed).
**End state of this goal:** every dealer staged at the **"ready to flip"** line. The flip itself
is operator-gated.

---

## Where each dealer stands

| Dealer | Group | Profile stood up | Lead format | Verified (dev) |
|---|---|---|---|---|
| serra-honda | Serra | ✅ (reference) | adf-xml | ✅ storefront + knowledge gated+captured (live) |
| serra-nissan | Serra | ✅ | adf-xml | ✅ branded, wiki+agents+widgets, schema-clean, APIs |
| tony-serra-ford | Serra | ✅ | adf-xml | ✅ |
| hyundai-of-columbia | Columbia | ✅ | email | ✅ |
| ford-of-columbia | Columbia | ✅ | email | ✅ |

All five exist **on the dev volume**. Production application is a separate, operator-gated step
(below). Each dealer: branded `studio.yaml`, 26-page starter `company-wiki`, 12-agent roster
(4 visible: caroline / nancy-gaston / crm-guru / semantic-guardian), 3 widgets, an admin
`auth.yaml` (`<slug>@huminic.app` / `De@l$ucce$` — reset on first login), zero cross-brand leakage.

Re-runnable any time: `pnpm tsx scripts/standup-dealer.ts [--dry-run] [--only=<slug>]`.

## What is VERIFIED (no production needed)

- **Profiles**: 4 new dealers stood up, schema-clean (`studio.yaml` parses as `file`), branded.
- **Knowledge Core v1.0**: wiki editable + accessible via **UI** and **MCP**, one tree
  (`company-wiki`), every write **gated + captured to the Brain**. UI path live-verified on
  serra-honda (`captured:true`); MCP path unit-proven through the same gate.
- **Follow-up flow**: configurable Text→Email→Call escalation, stop-on-reply (15 tests).
- **Safe-mode is fail-closed** (proven for the new dealers): SMS/voice/email blocked by
  `outbound-disabled-global`, `vin.watcher.enabled: false`, no follow-up flow configured.
  **Nothing can send until three independent switches are flipped.**

## What is ENV-GATED (needs production — cannot verify locally)

1. Live agent **chat reply** (needs `OPENROUTER_API_KEY` / inference).
2. **VIN "Leads"** tile + live SMS/call counts (needs broker token + real `vin.org_id`).
3. **Real outbound send** landing in Teambox + Data (needs broker token + `OUTBOUND_LIVE_ENABLED`).
4. Login **form render** (dev auto-auths; code is in place, render unverified).

---

## The flip — operator-gated steps (I do NOT do these autonomously)

### Stage 0 — ship the code (once)
- [ ] Merge `feat/nexxus-comms-engine` → main
- [ ] Coolify redeploy `hermes-studio`

### Stage 1 — production secrets (once)
- [ ] `CENTRAL_MCP_TOKEN` = `claude_nexxus-2.2` broker token
- [ ] `OPENROUTER_API_KEY` (or chosen provider)
- [ ] `HERMES_PASSWORD` durable in Coolify

### Stage 2 — per-dealer production config (run for each store)
- [ ] Run `scripts/standup-dealer.ts` on the **production** volume (or apply the same files)
- [ ] Set real `vin.org_id` in each `studio.yaml`
- [ ] Point `notifications.lead_recipient` / `lead_notifications.adf_email` at the dealership BDC list (currently the test inbox)
- [ ] Set `SMS_FROM` per the shared TextMagic sender

### Stage 3 — verify the 4 env-gated items live (per store, test mode)
- [ ] Chat reply · VIN counts · real send (via `PRELAUNCH_SMS_LOCK` + test phone) · login render

### Stage 4 — go live (per store — irreversible, operator-go each time)
- [ ] `vin.watcher.enabled: true` (lead follow-up master gate)
- [ ] `OUTBOUND_LIVE_ENABLED=true` (global send switch)
- [ ] Customer turns on their follow-up flow (Campaigns → Follow-up) — both gates required
- [ ] Point store traffic at the new storefront (DNS/Caddy)
- [ ] Decommission that store's Nexxus surface

Related tracked items: #201 (follow-up go-live), #170 (go-live env), #173 (flip the switch),
#177 (register inbound webhooks).
