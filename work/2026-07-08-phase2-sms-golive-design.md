# Phase 2 — Serra Honda SMS supervised go-live: design spec

**Date:** 2026-07-08 · **Branch:** `feat/phase2-sms-golive-readiness` · **Status:** DESIGN (awaiting go-ahead)

Prep-only. No real-customer send or activation without explicit operator GO.

## Grounding findings (evidence-based, change the shape of the work)

1. **The immediate/follow-up engine already exists** — `src/server/automations.ts` `processNewLead()` (immediate) + `tickAutomations()` (follow-up), backed by the `automation_runs` dedup ledger (`hasAutomationRun`), prelaunch lock, and `gatedSend()` → comms-gate. serra-honda already has two automations, **both `status: active`** in the live container: `4ebcf94c…` "Instant SMS for new leads" (new_lead/sms/caroline) + `6b7aed1e…` "24-hour follow-up for all leads" (lead_followup/24h/sms/caroline). → **reuse + extend, don't rebuild.**
   - **⚠️ Both are ACTIVE now.** The only things stopping live sends today: no COMMS_TICK driver running + `vin.watcher.enabled:false`. The comms-gate would otherwise largely pass (OUTBOUND_LIVE_ENABLED on, prelaunch lock absent, vin_check off). → engage `PRELAUNCH_SMS_LOCK` before any live test; Script A targets ONLY the immediate automation (calling `processNewLead` would also enroll the follow-up).
2. **Agent leads (Vapi/Tavus/widget) do NOT enter the VinSolutions feed.** Each path (`vapi.$profile.ts`, `tavus.$profile.ts`, `callback-request.ts`, `widget-form.ts`, `widget-chat.ts`) creates a **messaging-hub thread** tagged with a distinct `via` and fires a dealer notification — none call `vin_create_lead`. So the exclude cannot be a VIN `leadSource` label (the dealer has no Vapi/Tavus source; our ADF maps to `Dealers WebSite`, indistinguishable from real website leads). **Precise exclude = cross-reference a VIN candidate's phone against hub threads created by agent channels.**
3. **comms-gate business-hours is a single global window** (layer 4, sms+voice), used by every send path. It cannot express two different windows. → add a **per-message-class send-window module**, do NOT change the global gate.
4. **Prelaunch lock is OFF in prod** (`OUTBOUND_LIVE_ENABLED=true`, no `PRELAUNCH_SMS_LOCK`). Already logged (issues.md "Comms pipeline driver is not running"). → engage `PRELAUNCH_SMS_LOCK` + `PRELAUNCH_TEST_RECIPIENTS=<operator #>` before any live test (needs GO). Scripts are dry-run-by-default regardless.
5. **Config drift** host vs container — container is source of truth (logged in issues.md).

## Confirmed rules (operator, 2026-07-08)

- **First Phase-2 send = the immediate lead-engagement text** (Script A).
- **Immediate window (CT):** `08:00–09:00` (pre-open catch for overnight arrivals) + `19:00–21:00` (evening after-hours). Off during business hours (09:00–19:00) and A2P quiet hours (21:00–08:00). Overnight arrivals get their text at 08:00.
- **Follow-up:** each lead's **arrival + 24h ("anniversary")**, sendable any time in the A2P daytime window `08:00–21:00` CT.
- **Immediate recipients:** NEW VinSolutions leads **not yet followed up**, EXCLUDING agent-handled (Vapi voice + Tavus video incl. widget video). Call-back/form/chat NOT excluded (config-driven so call-back can flip later).
- **Follow-up recipients:** ALL leads, 24h after arrival.

## Design

### D1. `src/server/send-windows.ts` (NEW, pure, TDD)
Reuses comms-gate's tz/HH:MM logic. Config lives in `studio.yaml` `comms.send_windows`:
```yaml
comms:
  send_windows:
    tz: America/Chicago
    immediate:            # after-hours engagement
      - { start: "08:00", end: "09:00" }
      - { start: "19:00", end: "21:00" }
    followup:             # A2P daytime
      - { start: "08:00", end: "21:00" }
```
Exports (all pure, `nowMs` injectable):
- `windowState(windows, tz, nowMs) → { open: boolean, nextOpenMs: number | null }`
- `immediateWindowState(cfg, nowMs)` / `followupWindowState(cfg, nowMs)` (defaults baked so an absent config still yields the confirmed windows — fail-safe to the compliant defaults, never “always open”).
Defaults are A2P-compliant; TCPA quiet-hours (21:00–08:00) can never be inside any default window.

### D2. Exclude filter `src/server/immediate-exclude.ts` (NEW, TDD)
`isAgentHandled(profile, phoneE164, cfg) → boolean` — true if a hub thread exists for that phone whose creating `via` ∈ `comms.immediate_exclude_via` (default `['vapi-webhook','tavus-webhook']`). Phone canonicalized via existing `canonicalizeContactHandle`. Config-driven so call-back (`widget-callback`) can be added in one line.

### D3. Catch-up Script A — immediate `scripts/catchup-immediate.ts` (NEW)
Reusable, re-runnable, idempotent. Steps:
1. Pull VIN leads created **today (CT)** via `vin_query_leads` (paginated).
2. Keep `leadStatus === 'ACTIVE_NEW_LEAD'` (not-yet-followed-up); drop `WAITING` (already contacted) + `BAD_*`.
3. Resolve phone + first name (existing name-resolve path).
4. Drop `isAgentHandled` (D2).
5. Drop already-sent via ledger `hasAutomationRun(profile, immediateAutomationId, handle)`.
6. **Window guard:** if `!immediateWindowState().open`, refuse to `--send` (dry-run still prints).
7. **Default DRY-RUN:** print exact recipient list (name, masked phone, leadId, vehicle) + counts. `--send` dispatches via the immediate automation (`gatedSend`, still behind prelaunch lock + comms-gate), recording to the ledger (idempotent).

### D4. Catch-up Script B — 24h follow-up `scripts/catchup-followup.ts` (NEW)
Reusable, re-runnable, idempotent. Steps:
1. Pull VIN leads created in the **last 7 days**, `leadStatusType === 'ACTIVE'`.
2. Compute anniversary = `createdUtc + 24h`; keep leads whose anniversary has passed (due).
3. Drop already-followed-up via ledger.
4. Follow-up window guard (`followupWindowState`).
5. Default DRY-RUN → recipient list + counts; `--send` enrolls/sends the follow-up automation (idempotent via ledger).

### D5. Sentinel adjustment
Extend `src/server/sentinel.ts` checks (once sends start): stuck `queued` reply jobs, provider errors, persona violations (price/inventory/specs, pre-9am scheduling, fabrication), delivery failures, send-rate anomalies → email alerts. (Build; live-verify only when sending.)

### D6. One-flip activation (staged, NOT activated)
Document the single change to go live: set the two serra-honda automations `status: active` + engage the comms driver (`COMMS_TICK_ENABLED`) with the send-window checks wired into `processNewLead`/`tickAutomations`. Written up, left OFF.

### D7. Adversarial system check
Red-team the pipeline (comms-gate fail-modes, dedup/idempotency, window logic, exclude, STOP/opt-out, handle normalization, phantom guard, never-dead fallback, notifications, rate limits, prompt-injection via inbound, mass-send runaway, wrong-number/double-send, opt-out bypass). Findings report → fix or log w/ severity.

## Testing
TDD for D1 (windows incl. quiet-hours + wraparound + overnight→08:00), D2 (exclude by via), D3/D4 dedup+idempotency + window guard. Full suite + build green. Live-verify each script against the operator's number (prelaunch allowlist) before any real backlog.

## Recipient lists for review (BEFORE any real send)
Script A + Script B run in dry-run against live VIN → exact who + counts, delivered to the operator for review. No real customer texted until explicit GO.

## Safety invariants
- Scripts DRY-RUN by default; `--send` still passes comms-gate + prelaunch lock.
- COMMS_TICK + autonomous_reply stay OFF until GO.
- Every send idempotent (ledger). Opt-outs honored (blacklist + carrier STOP).
- All code on this branch; PR/deploy only on GO.
