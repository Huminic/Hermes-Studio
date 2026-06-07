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

e.g. Serra Service SMS → https://studio.huminic.app/api/webhooks/textmagic/serra-service (number +19014361271, Nancy).

## Operator go-live checklist (the pieces I cannot/should not flip)
1. Register the inbound callbacks above in each TextMagic sub-account + Vapi + Tavus (diverts live inbound — do at cutover).
2. Set `OUTBOUND_LIVE_ENABLED=true` (Coolify env) + per-store `autonomous_reply_defaults.enabled` to turn on automatic two-way replies + VIN-watcher follow-up.
3. Replace per-store `lead_recipient` / ADF email with the real BDC distribution lists (currently neoweaver@gmail.com placeholder).
4. Rotate the leaked broker tokens.
5. Rotate the interim `HuminicLaunch2026` passwords.
6. DNS / Caddy flip to the live host.
