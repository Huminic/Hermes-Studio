# Phase 2 — Staged go-live activation (Serra Honda SMS)

**Date:** 2026-07-08 · **Status:** STAGED — NOT ACTIVATED. Every flip below stays OFF
until an explicit operator GO. This is the runbook, not an action taken.

## Current live posture (container `hermes-studio-…-194118185938`, verified 2026-07-08)

| Control | State | Effect |
|---|---|---|
| `OUTBOUND_LIVE_ENABLED` | **`true`** | comms-gate layer 1 open (sends allowed if all other layers pass) |
| `PRELAUNCH_SMS_LOCK` | **absent** | ⚠️ layer 1b no-op — a real send could reach any number |
| `PRELAUNCH_TEST_RECIPIENTS` | absent | no allowlist |
| `COMMS_TICK_ENABLED` | **absent** | no driver ticks → `tickAutomations`/`runDueWork` never run |
| `vin.watcher.enabled` (studio.yaml) | **`false`** | vin-watcher never calls `processNewLead` → no auto immediate sends |
| `SENTINEL_TICK_ENABLED` | `true` | Sentinel monitors (email alerts) |
| `comms.vin_check` | `false` | VIN DNC layer off (operator decision; opt-out via carrier STOP + blacklist) |
| `comms.business_hours` | America/Chicago 08:00–21:00 | global comms-gate window (broad A2P bound) |
| marketing_automations | **both `active`** | `4ebcf94c…` immediate (new_lead/sms), `6b7aed1e…` follow-up (lead_followup/24h) |
| `autonomous_reply_defaults.enabled` | `false` | per-thread reply subscriptions used for tests |

**What actually stops a customer send today:** no driver runs (`COMMS_TICK` off) **and**
the watcher is off. The gate itself would largely pass. → **engage the prelaunch lock
before any live test.**

## Path A — Manual catch-up sends (Phase 2 FIRST SENDS, operator-driven)

This is the primary Phase-2 mechanism. No driver required. The scripts are
window-guarded and dry-run-by-default.

**Pre-send (once, needs GO):**
```
# In the container env (Coolify service env or container):
PRELAUNCH_SMS_LOCK=true
PRELAUNCH_TEST_RECIPIENTS=+1<operator-number>     # controlled self-test first
```
1. **Dry-run** (safe, read-only) — review the recipient list + counts:
   ```
   docker exec <studio> npx tsx scripts/catchup-immediate.ts --profile serra-honda
   docker exec <studio> npx tsx scripts/catchup-followup.ts  --profile serra-honda
   ```
2. **Self-test** (GO): with the lock engaged + your number allowlisted, in-window:
   ```
   docker exec <studio> npx tsx scripts/catchup-immediate.ts --send --limit 1
   ```
   Only your number receives it (prelaunch lock blocks all others).
3. **Real backlog** (separate explicit GO): widen `PRELAUNCH_TEST_RECIPIENTS` or lift the
   lock, run `--send` inside the immediate window (6–8pm or 8am CT). Re-run any time to
   catch up — the `automation_runs` ledger dedups (no double-text).

Immediate script refuses `--send` outside 6–8pm/8am CT (`--ignore-window` only for a
self-test). Follow-up refuses outside 08:00–21:00 CT.

## Path B — Continuous automation (LATER, not Phase-2-first, extra code required)

To have leads engaged automatically (no manual script run), the driver + watcher turn on:
```
COMMS_TICK_ENABLED=true
COMMS_TICK_PROFILES=serra-honda
# studio.yaml: vin.watcher.enabled: true
```
**⚠️ REQUIRED CODE CHANGE BEFORE THIS IS COMPLIANT (not yet implemented):**
`automations.processNewLead()` fires the immediate text **immediately** on lead detection
— it does NOT yet enforce the 6–8pm/8am immediate window (only the global comms-gate
08:00–21:00 applies). Before continuous go-live, wire `immediateWindowState` (send-windows.ts)
into the `new_lead` branch: when the window is CLOSED, **enroll** the immediate as a due-at
run for the next window open instead of sending now (queue, don't drop). The follow-up path
already lands inside 08:00–21:00 via the global gate; add `followupWindowState` for exactness.
Tracked as the D6 follow-up in backlog.md. Until then, **use Path A** (scripts enforce the
window correctly).

Also stage, if desired: `autonomous_reply_defaults.enabled: true` (so inbound replies
auto-respond via Caroline without a manual per-thread subscription).

## Rollback
- Set `PRELAUNCH_SMS_LOCK=true` (or remove the operator number) → no real sends.
- Unset `COMMS_TICK_ENABLED` → driver stops.
- `vin.watcher.enabled: false` → no auto immediate.
- Automations → `status: paused` via the customer automations API to stop follow-ups.
