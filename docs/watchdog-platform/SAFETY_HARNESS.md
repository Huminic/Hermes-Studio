# Dev Dry-Run Safety Harness — "no customer havoc"

The dev studio instance for the dry run is made **physically incapable of reaching a
real customer or double-processing a real lead.** Multiple independent layers; the
first alone is sufficient.

**Instance:** `feat/watchdog-dashboard @ 67c3a6446` (+ the ingest integration, D1) on an
**isolated data volume** — its own `BRAIN_PROFILES_ROOT` / Hermes root, seeded with only
the 3 Serra stores' config. It never shares production's `/root/.hermes`, lead queues, or
hub DBs. Exposed only as `studio-dev.huminicdev.com` (dev domain), never the prod Coolify app.

## Outbound is impossible (not just gated)
| # | Layer | Setting on the dev instance | Effect |
|---|-------|------------------------------|--------|
| 1 | **Global kill switch** | `OUTBOUND_LIVE_ENABLED` **unset** (comms-gate layer 1 requires exactly `"true"`) | Every SMS/voice/email customer send is blocked, fail-closed, recorded-not-sent |
| 2 | **No transport creds** | no `TEXTMAGIC_*`, `RESEND_*`, `VAPI_*` in the dev env | Even a bypass has nothing to send through |
| 3 | **No autonomous drivers** | `COMMS_TICK` unset; `vin.watcher` off; **no crons** scheduled for the instance | Nothing fires on its own — no catch-up, no follow-up, no tick |
| 4 | **No inbound webhooks** | no TextMagic/lead webhook points at the dev host/port | No real inbound lead → no auto-reply → no double text |
| 5 | **Isolated volume** | dedicated Hermes root, seeded config only | No shared queues to double-process |
| 6 | **Alert dispatch dry-run** | `dispatchFiringAlerts` defaults `send:false` (P2c); no scheduled tick calls it | Metric alerts decide but never email autonomously |

## The one intentional send (optional, scoped)
The only send we ever enable is the **single notification-test email to the operator's own
address `duanewells@icloud.com`** — never a customer address. Done explicitly (enable
`send:true` for that one dispatch, or trip one alert manually), scoped to that recipient,
and only if the operator wants to see a real email land.

## VIN / central-mcp
The dashboard's funnel denominator can read VIN live (read-only). For the dry run, prefer to
run **without** `CENTRAL_MCP*` tokens (VIN funnel shows "needs data", which is honest) unless
the operator wants the live read; VIN is never written. Codex's report deliveries are the data
source for the metrics — not VIN writes.

## Pre-exposure verification checklist (must pass before `studio-dev` is routed)
- [ ] `printenv | grep -E 'OUTBOUND_LIVE_ENABLED|TEXTMAGIC|RESEND|VAPI'` → **empty**
- [ ] instance config: `outbound_enabled` off / kill-switch on for all 3 profiles
- [ ] no cron entries reference the dev instance; `COMMS_TICK`/`vin.watcher` off
- [ ] no webhook registration points at the dev host/port
- [ ] `BRAIN_PROFILES_ROOT` is the isolated dev root, not `/root/.hermes`
- [ ] smoke test: a forced `checkCommGate(...)` returns `{ok:false, rule:'kill-switch'}` (proves layer 1 live)
- [ ] independent reviewer signs off that no code path can send to a non-allowlisted address

## Infra provisioning (via sysadmin, safe wrappers — operator-visible)
1. DNS A-record `studio-dev.huminicdev.com` → `150.136.6.207`.
2. Build + run the instance on a local port with the harness env + isolated volume.
3. Caddy route `studio-dev.huminicdev.com { reverse_proxy localhost:<port> }` via the sysadmin wrapper.
4. Run the pre-exposure checklist; only then hand the URL to Codex.
