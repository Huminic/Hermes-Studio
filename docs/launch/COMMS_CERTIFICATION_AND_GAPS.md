# Comms Certification & Gap Report — 2026-06-03

Adversarial certification of the Nexxus→Studio comms layer, plus the live-wire
evidence (real broker calls to the operator's own contacts). Verdict at the time
of audit: **NOT-CERTIFIED for live comms** — the engine logic is real and
fail-closed, but the shared path targeted broker tools that don't exist on the
deployed broker, and nothing had ever been sent live. This doc records what was
found, what's now fixed in code, and what still needs operator decision/provision.

## The root-cause miss (technical)

All comms tests used **mocked** providers, and the system is **fail-closed**
(`OUTBOUND_LIVE_ENABLED` unset), so zero real messages had ever been sent — by
design, but it meant **no live-integration evidence existed**. Worse, the shared
path called `tm_send_message` / `vapi_create_call` / `tavus_create_conversation`
/ `vin_query_leads` — tool names taken from the Nexxus design + central-mcp
*source*, **not** from the **live deployed broker** the Studio container points
at (`mcp.huminicdev.com/dax/mcp`). `tools/list` on that broker (queried twice,
independently) returns only `coolify_*`, `resend_*`, `signalwire_*`, `fal_*`.
**Lesson:** `allowed_providers` in a token config ≠ tools registered on the
deployed broker; an integration is only real when verified against the live
endpoint, and only proven when an artifact lands on the far side.

## Live-wire evidence (real calls, operator's contacts)

| Channel | Tool (live broker) | Result |
|---|---|---|
| **Email** | `resend_send_email` | **WORKS** — real email delivered to the operator (Resend returned a message id). Required adding the `from` field (was missing → would have failed schema validation). |
| **SMS** | `signalwire_send_sms` | **Reaches SignalWire**, returned real provider error `21601` — the only project-owned number (`+18886917953`) is toll-free and **not SMS-capable**. Code path correct; blocked on number provisioning. |
| **Voice** | `signalwire_make_call` | Not yet tested; the owned number IS voice-capable. SignalWire raw call ≠ Vapi AI voice agent (product decision). |
| **Video** | (none) | Tavus not on the broker. |
| **VIN/CRM** | (none) | `vin_query_leads` not on the broker → reports lead-funnel unavailable; DNC check now fails-closed. |

## Fixed in code (this branch)

1. **SMS re-pointed to the live tool** — `signalwire_send_sms {from,to,body}`,
   sender via `SIGNALWIRE_FROM` (no guaranteed-fail fallback). `dispatchTextMagic`
   → `dispatchSms`; own-mode keeps direct TextMagic for BYO creds.
2. **Email `from`** added (per-profile `RESEND_FROM`, default `notifications@huminic.ai`).
   Verified live.
3. **VIN DNC fails CLOSED** on lookup error (was silent fail-open). Blocks with
   `vin-unavailable` unless `comms.vin_check_fail_open=true`. TCPA-safe.
4. **`/api/files` requires admin** for writes (was any authenticated session) —
   it can write `governance/agents/*.md`; a customer-admin storefront session is
   now rejected 403.
5. **Campaign metric** — chat `simulated` records no longer count as `sent`.
6. **Guarded live-test runner** — `scripts/live-comms-test.ts` sends through the
   real gated path to a single explicit recipient (post-deploy, one command).

## Needs operator decision

- **D1 — SMS sender.** Provision an SMS-capable SignalWire number (10DLC long
  code + A2P brand/campaign registration, or toll-free SMS verification). Until
  then no SMS can land. (SignalWire tools to do this exist: `signalwire_buy_number`,
  `signalwire_create_brand/campaign` — but buying + A2P registration is a
  financial + multi-day compliance step left to you.)
- **D2 — Voice provider.** Use SignalWire `make_call` (raw call, needs TwiML) or
  enable **Vapi** on the broker for the AI voice agent (Caroline-style). These are
  not equivalent; pick the product behavior.
- **D3 — Video (Tavus).** Enable `tavus_*` on the broker, or defer video.
- **D4 — VIN/CRM.** Enable `vin_query_leads` on the dax broker (or point Studio at
  the broker/token that has VIN) so the lead funnel + DNC check work. Until then
  keep `vin_check` off (or scopes without `vin`) so the fail-closed gate doesn't
  block SMS/voice.
- **D5 — Webhook registration.** Inbound receivers exist
  (`/api/webhooks/textmagic.$profile`, `/api/webhooks/vapi.$profile`) but no
  provider is registered to POST to them. For Caroline to receive a real inbound,
  register the webhook URL in SignalWire/the SMS provider. (No Tavus inbound
  receiver; ADF/email inbound only via the generic endpoint + a normalizer.)

## Needs deploy to test live through Studio's own code

The running container is the OLD build; these fixes aren't live yet. The email
proof above was a direct broker call. To certify the *Studio code paths*
(inbound webhook → 2-way reply → gated outbound) end-to-end, merge → deploy →
run `scripts/live-comms-test.ts --confirm` with a single test recipient + an
SMS-capable sender.

## Still solid (verified)

CommGate fail-closed layering; human-takeover pause; auth (scrypt, per-profile,
10 stores have customer-admin users); integrity scanner; reports never fabricate
VIN numbers; central-mcp connectors are real HTTP. Email integration proven live.
