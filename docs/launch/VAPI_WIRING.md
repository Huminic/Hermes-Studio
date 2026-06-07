# Vapi Voice Wiring — inbound webhook migration (dev → Huminic Studio)

Source: Claude read-only inventory of the live Vapi account via `VAPI_PRIVATE_KEY`, 2026-06-07. Mirrors `TEXTMAGIC_WIRING.md` for the voice channel.

## Current state (read-only audit)
All 6 store assistants + the Elliott test assistant currently send their server events to the **old dev endpoint** `https://dev.huminicdev.com/api/webhooks/vapi` — **no profile in the path**, so today every call routes to one undifferentiated endpoint. Studio's per-profile webhook is `…/api/webhooks/vapi/$profile`. Migration = repoint each assistant's `server.url` to its profile endpoint + set `server.secret` = `VAPI_WEBHOOK_SECRET`.

## Assistant → store → number map (locked)
| Assistant (Vapi name) | Assistant id (prefix) | Profile | Voice number | Target `server.url` |
|---|---|---|---|---|
| Caroline - Serra Honda | `90a876c0` | serra-honda | +1 901-203-8267 | `https://studio.huminic.app/api/webhooks/vapi/serra-honda` |
| Nancy Serra Service | `c777f029` | serra-service | +1 901-436-1271 | `https://studio.huminic.app/api/webhooks/vapi/serra-service` |
| Magnolia - Serra Nissan | `2203b188` | serra-nissan | +1 256-862-3318 | `https://studio.huminic.app/api/webhooks/vapi/serra-nissan` |
| Georgia - Tony Serra Ford | `ad478eb2` | tony-serra-ford | +1 256-459-9707 | `https://studio.huminic.app/api/webhooks/vapi/tony-serra-ford` |
| Elizabeth - Hyundai of Columbia | `6d12a8fa` | hyundai-of-columbia | +1 901-203-9398 | `https://studio.huminic.app/api/webhooks/vapi/hyundai-of-columbia` |
| Savannah - Ford of Columbia | `6216451c` | ford-of-columbia | +1 931-369-2815 | `https://studio.huminic.app/api/webhooks/vapi/ford-of-columbia` |
| Elliott - Test Assistant | `c303d993` | (test) | +1 839-272-9080 | `https://studio.huminic.app/api/webhooks/vapi/serra-honda` *(point at a real profile only for the safe inbound test; revert after)* |

Notes:
- `+1 901-436-1271` is the serra-service **voice** number (Vapi) — distinct from its **SMS** number `+1 833-978-5374` (TextMagic). Don't conflate.
- Host shown is the **test** URL `studio.huminic.app`; at the DNS flip, swap to the live host. One unrelated assistant ("Christine - Quality Check") already points at `live.huminic.app` — leave it alone.
- The host-level `server.url`/`server.secret` is on the **assistant**, not the phone number (phone-number `server` is `(none)` for all 8 — they inherit the assistant's).

## How registration works (Vapi)
There is no standalone "register webhook" endpoint. Inbound events (end-of-call-report, transcript, status) are delivered to the assistant's `server.url`. So registration = `PATCH https://api.vapi.ai/assistant/<id>` with `{ "server": { "url": "<target>", "secret": "<VAPI_WEBHOOK_SECRET>" } }`.

## Tooling
`scripts/register-vapi-webhooks.ts` — **dry-run by default** (prints the planned PATCH per assistant; mutates nothing). Pass `--execute` to apply, `--only <profile>` to do one store, `--host <url>` to override the host. **Executing diverts live inbound voice → cutover-moment / operator-go action.**

## Safe test path (recommended first step, on operator go)
1. `--execute --only-test` repoints **only the Elliott test assistant** to a real profile webhook → call `+1 839-272-9080` from an operator phone → verify a thread + notification land in Studio → revert.
2. Then per-store at each store's cutover: `--execute --only <profile>`.

## Tavus (video) — different model
Tavus does **not** use a standing account-level webhook; the `callback_url` is passed per-conversation at creation. Studio's outbound conversation-create path supplies `…/api/webhooks/tavus/$profile`. There is nothing to pre-register in the Tavus console — inbound video events follow the callback_url Studio sets when it starts a session. `TAVUS_WEBHOOK_SECRET` authenticates them (already wired in `tavus.$profile.ts`).
