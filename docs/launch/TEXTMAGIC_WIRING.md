# TextMagic SMS Wiring — Serra entities (T2 cutover)

Source: Dexter's read-only audit of the live TextMagic UI, 2026-06-07. Verified against the adapter code by Claude. **Account owner / parent: DURRAN MICHAEL CAGE.**

## Locked shape (Claude-endorsed)
4 Serra SMS entities, each = its own sub-account + one number + inbound callback → its profile webhook. **No SMS for Columbia.**

| Profile | Agent | TextMagic # (recommended) | Current account | Inbound callback URL |
|---|---|---|---|---|
| serra-honda | Caroline (sales) | **+1 833-893-5694** | Durran (parent) → move to "Serra Honda" sub | `/api/webhooks/textmagic/serra-honda` |
| serra-service | Nancy (service) | **+1 833-978-5374** | Durran (parent, label "Serra") → move to "Serra Service" sub | `/api/webhooks/textmagic/serra-service` |
| serra-nissan | sales | **+1 855-395-5571** | Serra Nissan sub (exists) | `/api/webhooks/textmagic/serra-nissan` |
| tony-serra-ford | sales | **+1 833-391-0294** | Tony Serra Ford sub (exists) | `/api/webhooks/textmagic/tony-serra-ford` |
| (parked) | — | +1 833-809-6836 ("General") | Durran (hold/legacy) | — |

**Number choice (CONFIRMED 2026-06-07, Dexter + Claude; Duane: "no numbers firm, pick the sensible shape"):** serra-honda keeps **833-893-5694** (the historical Caroline/sales number in Nexxus evidence). **833-809-6836 ("General")** is parked in the parent — it carries old/default backlog, and parking it keeps legacy traffic/noise out of the clean Honda sales lane. **Swap caveat:** if Durran identifies "General" as the *true active Honda public number*, swap it in **before callbacks go live** (T2) — not after.

| hyundai-of-columbia | — | **none** (no SMS) | — | — |
| ford-of-columbia | — | **none** (no SMS) | — | — |

Host: `https://studio.huminic.app` during test; swap to the live host at the DNS flip if different.

> **Number correction (Dexter):** `+1 901-436-1271` is **Nancy's Vapi VOICE** number, NOT SMS. serra-service has two distinct numbers — voice (Vapi `+1 901-436-1271`) and SMS (TextMagic `+1 833-978-5374`). Don't conflate them.

## Credential mode: **OWN** (Claude + Dexter agree)
Each Serra profile uses its **own** sub-account credentials — clean isolation, no reliance on the parent sending "from" a sub number.
- studio.yaml per Serra profile: `channel_credentials: { sms: own }`
- `.env` per Serra profile: `TEXTMAGIC_USERNAME`, `TEXTMAGIC_API_KEY`, `TEXTMAGIC_FROM=<that number>` (+ optional `TEXTMAGIC_WEBHOOK_SECRET`)
- Code path verified: `credentialModeFor` (studio-config.ts:367) → adapter OWN branch (messaging-adapters.ts:166-199) sends direct via that sub-account.
- Use `shared` ONLY if TextMagic proves the parent/broker can send from each sub-account number with isolated inbound callbacks (not assumed).

## Open items requiring the account owner (Durran) / console (Dexter assists)
1. **Create 2 missing sub-accounts:** "Serra Honda" and "Serra Service" (Serra Nissan + Tony Serra Ford already exist).
2. **Reassign** the 4 numbers above into their matching sub-accounts; park `+1 833-809-6836`.
3. **Generate a TextMagic API key + username per sub-account** (Claude can't see/create these — owner action).
4. **Set the inbound callback URL** in each sub-account to its profile webhook (table above).

## Claude's server-side prep (on Duane's go, once keys exist)
- Set `channel_credentials.sms: own` in the 4 Serra `studio.yaml` (container volume). Safe now (outbound is gated).
- Write `TEXTMAGIC_USERNAME/API_KEY/FROM` into each Serra profile's `.env` as Durran provides them (never committed).
- Per-store two-way test (Dexter's plan E): inbound → correct Teambox; reply from same FROM; customer reply returns to same webhook; zero cross-profile bleed.
