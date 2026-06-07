# Critical URLs & Logins — 6-Entity Launch (test deployment)

**Base:** https://studio.huminic.app  (test URL; DNS flip to the live host is the operator's step)
**Interim login (all 6):** password `HuminicLaunch2026` — operator rotates at go-live.

## Public entry
| What | URL |
|------|-----|
| Store-picker landing (customers start here) | https://studio.huminic.app/ |
| Studio admin (operator) | https://studio.huminic.app/chat |

## Per-store storefronts + logins
| Store | Storefront | Username | Notif format |
|-------|-----------|----------|--------------|
| Serra Honda | /p/serra-honda | serra-honda-admin@huminic.dev | ADF-XML |
| **Serra Service** *(new 6th)* | /p/serra-service | serra-service-admin@huminic.dev | plain email |
| Serra Nissan | /p/serra-nissan | serra-nissan-admin@huminic.dev | ADF-XML |
| Tony Serra Ford | /p/tony-serra-ford | tony-serra-ford-admin@huminic.dev | ADF-XML |
| Hyundai of Columbia | /p/hyundai-of-columbia | hyundai-of-columbia-admin@huminic.dev | plain email |
| Ford of Columbia | /p/ford-of-columbia | ford-of-columbia-admin@huminic.dev | plain email |

Each storefront has 7 tabs: `/p/<store>/{chat,knowledge,tools,data,comms,campaigns,notifications}`
(labelled Agents · Knowledge · Widgets · Data · Teambox · Campaigns · Notifications).

## Widgets (embed)
- Widget admin (per store): `/p/<store>/tools` → Widgets sub-page (live demo + copy embed snippet).
- Public widget surface: `/w/<slug>` (e.g. /w/serra-honda-sales-chat, /w/serra-service-chat).
- Embed asset: `/api/public/widget.js?id=<slug>` (single-ID snippet shown in the Widgets tab).

## Inbound webhook endpoints (operator registers these in TextMagic sub-accounts / Vapi / Tavus at cutover)
| Channel | URL pattern |
|---------|-------------|
| SMS (TextMagic) | https://studio.huminic.app/api/webhooks/textmagic/<profile> |
| Voice (Vapi) | https://studio.huminic.app/api/webhooks/vapi/<profile> |
| Video (Tavus) | https://studio.huminic.app/api/webhooks/tavus/<profile> |

e.g. Serra Service SMS → https://studio.huminic.app/api/webhooks/textmagic/serra-service (TextMagic # +1 833-978-5374). NOTE: +1 901-436-1271 is Nancy's **Vapi voice** number, not SMS. Full TextMagic map: `docs/launch/TEXTMAGIC_WIRING.md`.

## Per-store go-live state (rolling rollout — updated 2026-06-07)

Legend: **CODE-READY** = storefront + agents + webhook route + widgets all built & tested; nothing more for Claude to build. Remaining columns are the *external* gates before that store flips live, in order.

| Store | Code | TextMagic sub + number | API key (Durran) | Callback set (Dexter) | Claude server-side (on go) | Operator cutover flip | LIVE? |
|-------|------|------------------------|------------------|-----------------------|----------------------------|-----------------------|-------|
| **serra-honda** (priority #1) | ✅ READY | ❌ create "Serra Honda" sub + move **833-893-5694** | ❌ | ❌ | `sms:own` + `.env` key/FROM | OUTBOUND + autonomous_reply + vin.watcher | ⏳ blocked on Durran |
| **serra-service** | ✅ READY | ❌ create "Serra Service" sub + move **833-978-5374** | ❌ | ❌ | `sms:own` + `.env` key/FROM | OUTBOUND + autonomous_reply | ⏳ blocked on Durran |
| **serra-nissan** | ✅ READY | ✅ sub exists (**855-395-5571**) | ❌ generate key | ❌ | `sms:own` + `.env` key/FROM | OUTBOUND + autonomous_reply + vin.watcher | ⏳ blocked on key+callback |
| **tony-serra-ford** | ✅ READY | ✅ sub exists (**833-391-0294**) | ❌ generate key | ❌ | `sms:own` + `.env` key/FROM | OUTBOUND + autonomous_reply + vin.watcher | ⏳ blocked on key+callback |
| **hyundai-of-columbia** | ✅ READY | — no SMS (inbound webhook + plain email only) | n/a | Vapi/Tavus callback only | none (email via Resend) | OUTBOUND (no SMS) | ⏳ blocked on provider callback reg |
| **ford-of-columbia** | ✅ READY | — no SMS (inbound webhook + plain email only) | n/a | Vapi/Tavus callback only | none (email via Resend) | OUTBOUND (no SMS) | ⏳ blocked on provider callback reg |

**Voice (Vapi) side — prepped, awaiting go:** read-only audit captured the full assistant→store→number map (`docs/launch/VAPI_WIRING.md`); all 6 store assistants currently point at the old dev endpoint. `scripts/register-vapi-webhooks.ts` (dry-run-default) repoints each to `…/api/webhooks/vapi/<profile>` — one `--execute` per store on your go (diverts live inbound voice → cutover action). Tavus needs no console registration (per-conversation `callback_url`, already wired).

**Critical path to first live store (Serra Honda):** Durran creates the "Serra Honda" sub-account + reassigns 833-893-5694 + generates an API key → Dexter sets the callback to `…/api/webhooks/textmagic/serra-honda` → Claude writes `channel_credentials.sms: own` + the sub's `TEXTMAGIC_USERNAME/API_KEY/FROM` into the profile `.env` (on your go) → operator flips `OUTBOUND_LIVE_ENABLED` + serra-honda `autonomous_reply` + `vin.watcher` → live two-way SMS verified to an operator-owned phone. **No store can flip without its sub active + callback set + outbound verified (goal constraint).**

## Operator go-live checklist (the pieces I cannot/should not flip)
1. Register the inbound callbacks above in each TextMagic sub-account + Vapi + Tavus (diverts live inbound — do at cutover).
2. Set `OUTBOUND_LIVE_ENABLED=true` (Coolify env) + per-store `autonomous_reply_defaults.enabled` to turn on automatic two-way replies + VIN-watcher follow-up.
3. Replace per-store `lead_recipient` / ADF email with the real BDC distribution lists (currently neoweaver@gmail.com placeholder).
4. Rotate the leaked broker token — coordinated 4-system window (see `docs/launch/BROKER_TOKEN_ROTATION.md`; blast radius reaches LIVE Nexxus — do not swap blind).
5. Rotate the interim `HuminicLaunch2026` passwords.
6. DNS / Caddy flip to the live host.
