# SMS Feature Run — prep (deferred from the non-SMS goal)

**Status:** NOT started. SMS was explicitly carved out of the 2026-06-08 non-SMS parity goal. This file records the live-verified TextMagic state so the SMS run begins from truth.

## Live-verified TextMagic state (operator read-only inspection, 2026-06-08)

Logged in as **DURRAN MICHAEL CAGE (`oauthdurran`)** = parent account.

| Store | Number | TextMagic account/subaccount | Callback (inbound + delivery) |
|---|---|---|---|
| **Serra Honda** | **+1 833-893-5694** | **main** (oauthdurran) | ✅ both set → `https://studio.huminic.app/api/webhooks/textmagic/serra-honda` (format: multipart/form-data) |
| **Serra Service** | **+1 855-395-5571** | **subaccount 903173** (admin `addisonjones1981@gmail.com`) | ❓ not confirmable from parent UI — requires Service-account context |
| Tony Serra Ford | +1 833-391-0294 | subaccount 903171 | — |
| (unassigned) | +1 833-978-5374 | main | — |
| (unassigned) | +1 833-809-6836 | main | — |

## ⚠️ Findings that change the earlier SMS assumptions
1. **Number mapping CHANGED.** Serra Service is now **+1 855-395-5571** (a subaccount number), NOT `+1 833-978-5374` as older docs (CRITICAL_URLS.md, TEXTMAGIC_WIRING.md) state. `833-978-5374` is now **unassigned** on the main account. **Update the stale docs before the SMS run.**
2. **It's a SUBACCOUNT structure, not one shared account.** Numbers live across the main account (Serra Honda) + separate subaccounts (Serra Service 903173, Tony Serra Ford 903171). This breaks the earlier "single shared broker account + `tm_send_message` from any number" assumption:
   - **Outbound:** can the main-account broker creds send FROM a subaccount's number (855-395-5571)? TextMagic subaccounts have separate numbers/balances — likely need the **subaccount's own API key** (OWN mode per subaccount) rather than the parent broker. **Decision needed at SMS-run start.**
   - **Inbound callback for Serra Service:** cannot be set from the parent UI (no "Log in as this account" exposed). Must be set inside the Service subaccount context — via its own login (`addisonjones1981@gmail.com`) or its own API v2 settings. Same will apply to Tony Serra Ford (903171).
3. **Serra Honda is the cleanest first SMS store** — main account, number + both callbacks already set. It only needs: outbound creds wired + `channel_credentials.sms` flipped + `SMS_FROM` + a two-way test.

## SMS run open decisions (for when it gets its own goal)
- OWN-mode (per-subaccount API key) vs shared-broker outbound — resolve per the subaccount finding above.
- Reconcile/refresh CRITICAL_URLS.md + TEXTMAGIC_WIRING.md number map (Serra Service → 855-395-5571).
- Per-store inbound callback set inside each subaccount context.
- Then: `channel_credentials.sms` flip, `SMS_FROM`, `OUTBOUND_LIVE_ENABLED`, two-way test to an operator phone, vin-watcher follow-ups.
