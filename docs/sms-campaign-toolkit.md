# SMS Lead-Campaign Toolkit (reusable, per-store)

**Purpose:** launch a supervised SMS lead campaign for any dealership profile — an
IMMEDIATE after-hours lead-engagement text + a 24-HOUR follow-up — reusing the
tested, idempotent catch-up scripts. First proven live on **serra-honda 2026-07-08**
(48 accepted, opt-outs auto-honored, immediate engagement + trade-in buying signals
within minutes).

## The two scripts
- `scripts/catchup-immediate.ts` — today's NEW VinSolutions leads (`ACTIVE_NEW_LEAD`,
  not yet followed up), EXCLUDING Vapi/Tavus agent-handled leads. Window **6–8pm + 8am CT**.
- `scripts/catchup-followup.ts` — ALL sales leads from the last N days (default 7) whose
  24h anniversary has passed. **Sales-only by default** (SERVICE/PARTS excluded;
  `--include-service` to override). Window **8am–9pm CT** (A2P).

Both: **dry-run by default** (print recipient list, no sends). `--send` dispatches
through the full comms-gate. Idempotent via the `automation_runs` ledger — safe to
re-run to "catch up." Flags: `--profile <slug>`, `--send`, `--limit N`, `--days N`
(followup) / `--hours N` (immediate), `--ignore-window` (locked self-test only),
`--include-service` (followup).

## Per-store launch checklist
1. **Provision the number** (TextMagic account + toll-free verified) and pin it studio-side:
   `SMS_FROM=+1XXXXXXXXXX` in `~/.hermes/profiles/<slug>/.env` (container volume).
2. **studio.yaml `comms`:** `business_hours: { tz: America/Chicago (or store tz), start: "08:00", end: "21:00" }`,
   `vin_check: false` (operator opt-out model). Optional `send_windows` override + `immediate_exclude_via`.
3. **VIN:** `vin.org_id: <Nexxus UUID>` (federation read_scopes includes `vin`).
4. **marketing_automations:** one `new_lead`/sms + one `lead_followup`/sms, both `status: active`,
   `agent_id` = the store's sales agent. (Seeded as drafts; activate via the customer automations API/UI.)
5. **Env:** `OUTBOUND_LIVE_ENABLED=true`. `COMMS_TICK`/`autonomous_reply` OFF until decided.
6. **Deploy** the branch/main so the scripts + modules are in the container (`/app`).

## Safe launch sequence (what we did for serra-honda)
1. **Dry-run** both scripts → review the exact recipient list + counts.
   `docker exec <studio> npx tsx scripts/catchup-followup.ts --profile <slug>`
2. **Self-test** (optional): `PRELAUNCH_SMS_LOCK=true` + `PRELAUNCH_TEST_RECIPIENTS=+1<you>`, then `--send` — only your number sends.
3. **Canary:** `--send --limit 1` → verify delivery on TextMagic (`tm_get_message_history`, status `d`) + message content.
4. **Batch:** `--send` (ledger dedups the canary). Watch counts (sent/blocked/failed).
5. **Monitor** replies + opt-outs (see below). Investigate any failures.

## Opt-out / STOP (automatic)
Inbound "STOP" via the TextMagic webhook → `comms_blacklist` (brain.db) → comms-gate layer 5
blocks all future sends. Verified live. Every outbound includes "Reply STOP to opt out."

## Monitoring
- **Replies/opt-outs:** `scripts/`-style poller on the hub (`messages` where `direction='inbound'`);
  during the serra-honda launch we ran a 30s poll emitting each new reply + flagging STOP.
- **Sentinel:** `personaComplianceCheck` scans outbound agent SMS for pricing/inventory/specs
  hard-rule violations; reply-job + delivery-failure checks; email alerts (`SENTINEL_TICK_ENABLED=true`).

## Known gaps / cautions (see issues.md)
- **Continuous immediate** path (`processNewLead` via COMMS_TICK/vin-watcher) does NOT yet enforce
  the 6–8pm/8am window — only the manual script does. Wire `immediateWindowState` before automating immediate.
- **Phone validity:** `isValidSmsE164` drops malformed numbers but does NOT validate NANP area codes
  (e.g. `676` reached TextMagic and failed "Validation Failed"). Bad numbers surface as send failures.
- **Prelaunch lock OFF** in prod for real blasts → the blacklist/gate is the only net. Engage the lock for tests.
- Scripts copied into a running container are **ephemeral** (lost on redeploy) — merge+deploy for durability.
- Generic `/api/messaging/inbound` endpoint lacks STOP capture — serra-honda uses the TextMagic webhook (which handles STOP); fix before any store routes SMS through the generic endpoint.

## Reference run — serra-honda 2026-07-08
Follow-up sales-only: 51 candidates (12 service + ~13 email-only excluded), 48 accepted,
3 undeliverable (bad numbers), 2 STOPs auto-honored, multiple engaged replies incl. a trade-in
price inquiry. Canary delivery confirmed from 833-978-5374.
