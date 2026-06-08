# TextMagic — exactly what I need to wire Serra Honda (sales) + Serra Service

For **Dexter** (TextMagic console operator). **No Durran / no new sub-accounts needed** — any number/sub-account already in the account is usable. Just validate what exists now and assign two of them. Server side is ready and validated; this is the only thing blocking the first two SMS stores. Priority order: **Serra Honda (sales) first, then Serra Service.**

## What's already done (Claude, server side)
- `serra-honda/studio.yaml`: `channel_credentials.sms: own`, `sms.inbound_domain: sales`, `notifications.lead_format: adf-xml` — validated.
- `serra-service/studio.yaml`: `channel_credentials.sms: own`, `sms.inbound_domain: service`, `notifications.lead_format: email` — validated.
- Inbound webhook routes live: `/api/webhooks/textmagic/serra-honda` and `/api/webhooks/textmagic/serra-service`.
- Outbound OWN-mode adapter verified (sends from the sub-account's own number via TextMagic v2 API), gated by `OUTBOUND_LIVE_ENABLED` until go-live.

## What I need from you (validate what's available now, then fill this in)
First: list the sub-accounts that already exist + their numbers (we believe ≥2). Then pick one existing sub per store and give me:

| Field | Serra Honda (sales / Caroline) | Serra Service (Nancy) |
|-------|-------------------------------|----------------------|
| Existing sub-account chosen (name) | ? | ? |
| **TextMagic API key** (X-TM-Key) | ? | ? |
| **Username** (X-TM-Username) | ? | ? |
| **FROM number** on that sub (E.164) | ? | ? |
| (optional) webhook secret | ? | ? |

…and in the console, **set each chosen sub-account's inbound callback URL** to:
- Serra Honda → `https://studio.huminic.app/api/webhooks/textmagic/serra-honda`
- Serra Service → `https://studio.huminic.app/api/webhooks/textmagic/serra-service`

(Note: numbers aren't firm — any number in the account is usable. Pick the sensible one per store; tell me which number you put on each sub so the FROM matches.)

## What I do the moment you send the above
1. Write `TEXTMAGIC_USERNAME` / `TEXTMAGIC_API_KEY` / `TEXTMAGIC_FROM` (+ optional `TEXTMAGIC_WEBHOOK_SECRET`) into each profile's `.env` (never committed).
2. Flip `OUTBOUND_LIVE_ENABLED` + per-store `autonomous_reply` (+ `vin.watcher`) for that store.
3. Run a real two-way SMS test to an operator-owned phone: inbound → correct Teambox segment (sales vs service) → dealer notification (ADF for Honda, plain email for Service) → reply sent from the store's own number → my reply returns to the same webhook. Zero cross-profile bleed.
4. That store is then LIVE; repeat for the next.

Secure delivery: drop the keys into the profile `.env` directly on the server if you have access, or send them over the tmux/secure channel — not into git.
