# Comms Certification & Gap Report — 2026-06-03

Adversarial certification of the Nexxus→Studio comms layer, plus the live-wire
evidence (real broker calls to the operator's own contacts). Verdict at the time
of audit: **NOT-CERTIFIED for live comms** — the engine logic is real and
fail-closed, but the shared path targeted broker tools that don't exist on the
deployed broker, and nothing had ever been sent live. This doc records what was
found, what's now fixed in code, and what still needs operator decision/provision.

> **CORRECTION — 2026-06-03 (supersedes the SignalWire framing below).** The audit
> concluded `tm_send_message` / `vapi_create_call` / `tavus_create_conversation` /
> `vin_query_leads` "don't exist on the deployed broker." That was an artifact of
> querying `tools/list` with the **wrong token**. central-mcp registers tools
> **per-token** by `allowed_providers`: the **`claude_nexxus-2.2`** token (the live
> Nexxus token) DOES expose all of them. **No token combines SignalWire with
> vin/vapi/tavus**, so SignalWire is a dead end once VIN/Vapi/Tavus are in scope.
> Per operator decision D1 (see `NEXXUS_FIT_SPEC.md`): Studio uses the
> `claude_nexxus-2.2` token and SMS goes via **`tm_send_message`** — the proven
> Nexxus path. The SignalWire re-point (commit `448c7deec`) has been **REVERTED**
> in `messaging-adapters.ts` (shared SMS → `tm_send_message {text, phones, from?}`,
> optional `SMS_FROM`). The historical SignalWire findings below are kept as audit
> record, not as the current design. One residual SignalWire caller remains
> intentionally: `scripts/run-tranche-g-evals.ts` (`signalwire_send_sms` /
> `signalwire_make_call`) — an offline eval harness, NOT the product comms path;
> left as-is and tracked as follow-up, not part of the certified engine.

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

1. **SMS uses `tm_send_message`** (the proven Nexxus path) via the
   `claude_nexxus-2.2` broker token — `tm_send_message {text, phones, from?}`,
   sender via optional `SMS_FROM` (omitted → broker default sender, matching Nexxus
   trigger/greeting sends). `via: 'sms-textmagic-shared'`. Own-mode keeps direct
   TextMagic for BYO creds. *(The interim `signalwire_send_sms` re-point from commit
   `448c7deec` was reverted 2026-06-03 per D1 — see the correction banner above.)*
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

> **RESOLVED 2026-06-04.** Items D1/D2 below (SignalWire number, 10DLC/A2P
> registration, SignalWire voice) are **OBSOLETE** — they only existed for the
> reverted SignalWire detour. The stack is **TextMagic (SMS) + Vapi (voice) +
> Tavus (video) + Resend (email)**, all exposed by the `claude_nexxus-2.2` token.
> **No A2P / 10DLC / SignalWire provisioning is required of us** — TextMagic is the
> already-registered SMS provider, exactly as in live Nexxus. The only real
> remaining infra step is webhook registration at cutover (D5).

- ~~D1 — SMS sender (SignalWire number + 10DLC + A2P).~~ **Obsolete.** SMS =
  `tm_send_message` (TextMagic) via the `claude_nexxus-2.2` token; optional
  `SMS_FROM`, else the broker default sender. No A2P on our side.
- ~~D2 — Voice provider (SignalWire vs Vapi).~~ **Obsolete.** Voice = **Vapi**
  (`vapi_create_call`), already on the token.
- **D3 — Video (Tavus)** and **D4 — VIN/CRM** are already on the `claude_nexxus-2.2`
  token (verified live `tools/list`); VIN additionally needs per-profile `vin.org_id`.
- **D5 — Webhook registration (the one real remaining step).** Inbound receivers
  exist (`/api/webhooks/textmagic.$profile`, `/api/webhooks/vapi.$profile`); at
  cutover, register their URLs in the **TextMagic + Vapi dashboards** so inbound
  SMS/calls reach Studio. (No Tavus inbound receiver; ADF/email inbound via the
  generic endpoint + normalizer.)

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
