# Plan — Serra/Columbia Text Recovery + Alerts, Reports & Monitoring Program

## Context
On **2026-08-15** an upstream OpenAI "no credits" failure killed outbound texting on the shared generation/broker path. **Serra Ford and Serra Nissan went silent for ~5 weeks** (provider-confirmed; Honda, on its own path, kept working). Monitoring watched aggregate volume, so two dark stores hid behind Honda's ~100/day. The client (Serra group, via Automotive) is upset and the contract is at risk.

This program does three things: (1) **safely restore texting** and run a **one-time catch-up** to leads missed during the outage, (2) **add the alerts, reports, and a text report** the client wants so the operator demonstrates rigor, and (3) **fix the monitoring blind spots** that let this go unnoticed. Real customer SMS is involved, so every send is gated, dry-run-previewed, double-verified, and rolled out one store at a time.

**Operator mandate:** ZERO assumptions; **every dataset for every check and send is independently re-derived by a second agent and must match before anything goes out**; test artifacts to the operator before each live step.

## VALIDATION UPDATE — 2026-09-23 (read-only, evidence-cited by 5 parallel validators)

> **EXECUTION STATUS: NOTHING HAS RUN.** Zero code/config/DB changes. No texts restored. **Recording link NOT fixed.** All work to date is read-only investigation. Where the findings below conflict with the P0–P7 prose, **these supersede it.**

**P0 root cause — CORRECTED.** NOT about `sms_triggers.trigger1`, the vin-watcher, or Honda's `sms:own` transport (red herrings). Actual mechanism: the scheduled outbound drivers are **hardcoded/defaulted to `serra-honda`** — `hermes-ops/followup.sh` & `scripts/cron-catchup-followup.sh` hardcode `--profile serra-honda`; `immediate.sh` uses `$IMMEDIATE_PROFILES` (default serra-honda); `comms-holds-cron.ts:10` = `['serra-honda']`. `runDueWork()`/vin-watcher never run in prod (`COMMS_TICK_ENABLED` unset; not in crontab), so `vin.watcher.enabled:false` is irrelevant. Ford/Nissan's only historical outbound was the **inbound-reply path** (`textmagic.$profile.ts`→`maybeAutonomousReply`, per-profile), which the Aug-15 OpenAI 429 broke; PR #90 fixed generation but the Honda-only cron re-primed nothing for Ford/Nissan. **Restore = generalize followup.sh / immediate.sh / comms-holds-cron.ts to include tony-serra-ford + serra-nissan** — NOT flipping trigger1 (a no-op here).

**RUNTIME PREREQUISITES (read brain.db BEFORE any restore — NOT yet done):** (1) Do Ford/Nissan each have an ACTIVE `new_lead` + `lead_followup` automation in brain.db? Catch-up scripts silently no-op without one. (2) Do Ford/Nissan hold live `mode:reply` thread subscriptions?

**P2 24h→72h — CORRECTED target.** `sms_triggers.trigger2.window_min` is a DEAD helper (only `shouldFireTrigger2`, called by nothing live). `FOLLOWUP_AFTER_MS` (`catchup-followup.ts:28`) is the **catch-up DUE cutoff**, SHARED with the follow-up delay (raising it narrows the P1 audience — decouple). The real ongoing 24h→72h is the **active automation's `wait_hours`** (brain.db DATA change) → set to 72.

**P1 catch-up — CORRECTIONS.** Builder = `gatherFollowupCandidates` via `vin_query_leads` (good). BUT: (a) NO Aug-15 floor — window is `now − --days`; add an explicit `createdUtc >= 2026-08-15` clamp. (b) Ships `renderCheckin` copy, NOT `sms_triggers.trigger2.template_sales`. (c) agent-handled NOT excluded (diverges from spec). (d) opt-outs only blocked at send → dry-run CSV over-counts; second-agent diff must account for CommGate drops. (e) **NO balance gate in code** — manual operator pre-check only. (f) dedup is per `automation_id`; re-seeding the automation orphans the ledger → re-blast risk. One stable active automation per store required.

**P3 recording link — CONFIRMED cause, NOT fixed.** Vapi mints short-lived presigned R2 URLs (`hipaa-recordings/…`); they expire → `InvalidArgument/Authorization` 400. Our code forwards the raw URL and never persists (`vapi.$profile.ts:112,184`; `lead-notifications.ts:573-585`). Fix is NET-NEW: download-on-webhook → `/mnt/storage/recordings/<profile>/<call_id>.wav` → authenticated serving route (reuse HMAC `mintTakeoverToken`; NOT the public/unauth route) → email → age-based 30-day reaper. Disk OK (72 GB free; ~7.8 GB/30d est). **HIPAA:** storing `hipaa-recordings` audio = PHI custody → auth-gated route + non-world-readable dir + retention decision required.

**P4/P7 monitoring — REALITY (worse than assumed).** (1) App Sentinel almost certainly NOT running in prod (`SENTINEL_TICK_ENABLED` unset; no cron/systemd; TextMagic probe creds unset) — primary reason $6.84 never alerted; probe may watch wrong provider. (2) NO per-store volume-floor check; all notification checks are failure-driven and early-return when `total<8`/`<6`, so a dark store (total=0) is invisible — the exact blind spot. (3) Rate/recipient checks hardcode `'email'` — SMS-blind (comms_log carries sms; one-line extension). (4) No `comms.business_hours` in any Serra studio.yaml → defaults **America/New_York 08:00–21:00** (plan wants Central Mon–Sat 08:00–19:00); `withinBusinessHours` has NO day-of-week gate → net-new. (5) Holiday calendar: zero implementation. (6) Sentinel alerts go to `SENTINEL_ALERT_EMAIL`, NOT `notifications.routing` → routing to Don/Shelby needs a bridge. (7) **`.net` vs `.co`:** routing has Don as `dwood@serrahonda.net` but VIN users + ADF are `@serrahonda.co` — the alert warning texting is dark could ITSELF silently fail. Verify Don's + Shelby's real addresses first.

**P4 checks feasibility:** (a) no-status, (b) >5-min-unactioned [weak at hourly], (c) >3-day → computable now from `leadStatus/createdUtc`. (d) same-status>1wk for NON-new statuses → needs the P4b nightly snapshot (net-new; nothing snapshots status today).

**P5/P6 — CONFIRMED drops + net-new.** Appointments = DROP (no appointment MCP tool). Team Sales Performance/per-rep = DROP (live `vin_get_lead` has NO owner field). Sold/lost-"today" = needs P4b snapshot. Some lead-source ids don't resolve to names ("Source <id>"). `renderLeadCardHtml`/`sendViaResend` are private (need export). Day/after-hours split, avg time-to-text, business-hours text count, "leads left behind", P6 reply→email routing = DERIVABLE but NET-NEW code ("LIVE" in the table = derivable, not built).

## Ground truth — data availability & substitutions (verified read-only)
| Item | Status | Source / Note |
|---|---|---|
| Leads in (day/after-hours), by source | LIVE | `vin_query_leads` + `summarizeOpportunities`; sales-only via `SALES_LEAD_TYPES`, service dropped (`DROPPED_LEAD_TYPES`) |
| Cars sold — **cohort** (of leads created in window, how many are now SOLD) | LIVE | `summarizeOpportunities` `by_source[].sold`. Caveat: lead-attributed cohort, **not** event-dated daily sales, not F&I units |
| After-hours inbound calls | LIVE | Vapi → messaging-hub `voice` threads |
| Teambox msgs sent/received; texts on store's behalf; after-hours avg time-to-text | LIVE | `aggregateMessages` / `aggregatePerformance`; time-to-text computed from inbound→outbound timestamps |
| New lead **no status**; new lead **sitting > N days** | LIVE | current `leadStatusType`/`leadStatus` + `createdUtc` |
| Sales **lost/active** as current state | LIVE | `leadStatusType` LOST/ACTIVE snapshot (current), sales-only, deduped |
| **DROPPED — Appointments** (scheduled/confirmed) | NOT via MCP | No VinSolutions appointment tool. Removed from Daily AI Mgmt + text report + commentary |
| **DROPPED — Per-salesperson** (assigned/active/no-contact/cold per rep) | NOT via MCP | **Verified:** `vin_query_leads`/`vin_get_lead` return no owner field; leads can't be tied to reps. → **Team Sales Performance report dropped/deferred** |
| **NOT via MCP — event-dated "today" status changes** (sold today, lost today, went cold, "same status >1wk" for non-new statuses) | Needs snapshot | VinSolutions exposes **no status-transition dates**. Requires a **new nightly status snapshot** (buildable, accrues from go-live). Without it, only createdUtc-based aging + current-status counts are truthful |
| Disk for recordings | OK | second disk `/mnt/storage` 200 GB; 30-day footprint < 300 MB at current volume |

## Global guardrails (risk mitigation — apply to all sends)
1. **Kill switch discipline:** `OUTBOUND_LIVE_ENABLED` + per-profile `comms.outbound_enabled` + per-channel `comms.channels.sms` (`comms-gate.ts`). Nothing sends unless explicitly enabled for the target store.
2. **Second-agent double-verify (ALL checks):** every audience list, every report figure, every alert candidate set is computed by the primary path AND independently recomputed by a separate agent/query. **Mismatch → abort + surface the diff.** No send/report proceeds on a single derivation.
3. **Dry-run before live:** every send produces a preview (exact recipients, phone numbers, rendered message, timeframe) delivered to the operator; live send only after sign-off.
4. **Dedup/idempotency:** reuse `automation_runs` ledger + `immediate-exclude` (`isAgentHandled`) so refills/re-runs never re-blast; per-send cooldowns.
5. **Balance gate:** check TextMagic balance (`defaultProbeTextmagic`) per target account immediately before any send; abort if below send need.
6. **Service filter enforced twice:** `leadType ∉ {SERVICE,PARTS_ORDER,WHOLESALE}` AND thread `domain='sales'`.
7. **Per-store rollout with operator gates** (below). Blast radius = one store at a time.

## Work — priority order
Reuse existing plumbing throughout: `comms-scheduler`/`comms-cron` + `sentinel-cron` (cron), `renderLeadCardHtml`/`sendViaResend`/`sendNotification` (email), `dispatchSms` (SMS), `notifications.routing` matrix + `/api/customer/notifications` UI (config), sentinel check framework (`sentinel.ts`).

### P0 — Restore texting safely (emergency)
- Confirm root cause of non-resume on the shared path (trace scheduler/gate for Ford/Nissan vs Honda's `sms:own`). Fix so scheduled sends resume.
- **Before enabling:** set `sms_triggers.trigger1.enabled: false` on target stores so the **initial after-hours message is NOT backfilled**; verify balance; verify dedup ledger intact.
- Re-enable outbound for the store; confirm Honda still healthy (regression check).
- **Risk:** re-enabling blasts stale leads. **Mitigation:** trigger1 disabled + dedup + dry-run + balance gate + one store at a time.

### P1 — One-time catch-up: 2nd (follow-up) message
- Audience: **open + active + sales-only** leads, **createdUtc ≥ 2026-08-15 (outage start) and < now-24h**, per target store; exclude opt-outs/agent-handled/already-sent.
- Send **trigger2 (follow-up) template only** — never trigger1.
- Build via a dedicated one-time run (model on `catchup-followup` selection + `dispatchOutbound`); **contact list built from VinSolutions leads** (audience-resolver lacks `created_at`/`type`), independently re-derived by second agent, diffed, dry-run CSV to operator, then live.
- **Risk:** wrong customers/timeframe/duplicate. **Mitigation:** double-derive + dry-run CSV sign-off + dedup + balance + kill switch.

### P2 — 24h → 72h follow-up; resume automation
- Change `FOLLOWUP_AFTER_MS` / `sms_triggers.trigger2.window_min` 1440 → **4320** (72h). No more 24h texts.
- Initial after-hours texts resume automatically tonight (trigger1 re-enabled per store **after** catch-up completes and operator confirms).

### P3 — Vapi recordings on our machine + link fix
- **Confirmed cause:** Vapi mints a short-lived presigned R2 URL (`hipaa-recordings/…`) that EXPIRES → `InvalidArgument/Authorization` 400 when the dealer clicks later. Our code forwards the raw URL and never persists it (`vapi.$profile.ts:112,184`; `lead-notifications.ts:573-585`). This is net-new work, not a config toggle.
- On Vapi webhook, download recording to `/mnt/storage/recordings/<profile>/<call_id>.wav` (72 GB free; ~7.8 GB/30d est); store local path in message metadata.
- Serve via an **authenticated** route (reuse the HMAC `mintTakeoverToken`/`verifyTakeoverToken` pattern, bind `profile|call_id`; do NOT reuse the public/unauth artifact route); email link points to our route (fixes the raw-R2 400).
- **30-day reaper** (sentinel/cron, **age/mtime-based** — existing `pruneOld` is count-based, needs a variant) deletes files older than 30 days + clears metadata path.
- **HIPAA:** the bucket is literally `hipaa-recordings` → storing = PHI custody. Serving route MUST authenticate; dir non-world-readable; retention/BAA decision confirmed by operator before storing real recordings.
- **Testing (before real recordings reach a dealer):**
  1. **Unit:** webhook handler writes the wav + stores local path; reaper deletes >30d files AND clears the metadata path (so the email link never 404s to a reaped file); expired/absent token → 403 on the serving route.
  2. **Integration:** simulate a Vapi end-of-call webhook → assert file lands on `/mnt/storage/recordings/<profile>/`, the authenticated route streams it (200 + `audio/*`), unauthenticated request = 403, old raw-R2 URL is NO LONGER emitted in the email/ADF.
  3. **Live end-to-end (operator sign-off):** a real after-hours Vapi call → the dealer email link (OUR route) plays the recording — the exact flow Serra reported broken. **Test artifact:** a working sample recording link sent to the operator to click before go-live.
- **Risk:** download failure → provider URL is the only fallback and it expires, so retry-on-webhook + alert (no second chance once the signature lapses). **Full test suite + `vite build` green before deploy.**

### P4 — Alerts → Don & Shelby (hourly daytime scan; linear aging open→close)
- New sentinel checks (reuse check framework + routing matrix; UI-configurable events):
  - **No status** on a lead (current `leadStatus`/`leadStatusType` empty/`NEW`).
  - **New VinSolutions lead not followed up within 5 min** (business hours) — signal = lead still `ACTIVE_NEW_LEAD` (unactioned) >5 min after `createdUtc` at the hourly scan. **Caveat:** hourly cadence, and "followed up" = status moved off `ACTIVE_NEW_LEAD` (only VinSolutions signal available — no rep-contact timestamp exists).
  - **New lead sitting > 3 days** (createdUtc-based; solid).
  - **Same status > 1 week** — for the new/unactioned case this is createdUtc-based (solid); for other statuses it needs the **nightly snapshot** (accrues from go-live).
- Aging computed **linearly within business hours = Mon–Sat 08:00–19:00 CT**; overnight (7pm–8am), all Sunday, and **holidays** are frozen. Requires a **holiday calendar** (proposed: US federal holidays, per-store UI override).
- **P4b — nightly status snapshot (APPROVED):** each night, snapshot every sales lead's `leadStatusType`/`leadStatus` so day-over-day changes (sold, lost, went cold, status-aging on non-new statuses) become computable. Accrues from go-live; no retroactive history.
- **Risk:** false/noisy alerts. **Mitigation:** dedup/throttle ledger (already in sentinel), zeros/down-segment framing, per-store enable.

### P5 — Three daily email reports → Don, Shelby, Durran (service filtered OUT)
- **Daily AI Management Report** — **8:00am CT (9:00am ET)**: leads day/after-hours, after-hours calls, texts sent, Teambox sent+received, after-hours avg time-to-text, business-hours text count (incl. 72h), leads left behind, active leads (30d). Covers prior business day + overnight after-hours (7pm–8am rolls in here). **Appointments DROPPED** (no MCP source).
- **Lead Source Report** — **12:30pm CT**: leads per named source over 24h/7d/30d with up/down deltas (solid). Cars-sold as **cohort** ("of this source's leads in the window, N are now sold"); day-over-day sold deltas via the approved snapshot.
- **Team Sales Performance** — **DROPPED/DEFERRED**: per-rep assignment/active/no-contact/cold/sold are **not reachable via MCP** (leads carry no owner). Revisit only with a CRM KPI upload feed or a new assignment source.
- All via `renderLeadCardHtml` + `sendViaResend`; recipients from routing matrix; UI-adjustable.

### P6 — Text (SMS) report → you, Durran, Don, Shelby — **6:00pm CT**
- Agent-voice message, format **Greeting | Data | Commentary | Outro**, short.
- Data: leads today, **sales lost today** (via approved snapshot, from go-live+1), active leads (30d). **Appointments DROPPED** (no MCP source). Commentary compares **leads (by source), cars sold, sales lost — today vs yesterday** (leads solid; sold/lost from the snapshot). Commentary is now **2–3 sentences (leads + sales/lost)**; no appointment sentence.
- Commentary tightly templated (better/worse vs yesterday only), fixed variation banks. **Replies routed to email → duane.wells@huminic.ai + Durran.**
- **Risk:** off-tone/hallucinated commentary. **Mitigation:** commentary drawn from fixed variation banks keyed to computed up/down deltas — no free generation of facts.
- **Draft variation banks (tightly controlled):**
  - **Greeting:** `Hey team,` · `Team —` · `Hi all!` · `Hola!` · `Evening, team —` · `Hey everyone,`
  - **Data (factual template, numbers filled):** `{leads_today} new leads today, {sales_lost} marked lost, {active} active. {needs_attention} need attention.` (phrasing variants swap word order only; numbers never invented)
  - **Commentary — 1 short sentence per metric, picked by computed delta:**
    - Leads ↑ `Leads beat yesterday` / `More leads than yesterday` / `Lead flow was up on yesterday` · ↓ `Leads ran lighter than yesterday` / `Fewer leads than yesterday` / `Lead flow dipped from yesterday` · = `Leads held even with yesterday` / `Lead flow matched yesterday`
    - Sales ↑ `sales landed ahead of yesterday` / `we closed more than yesterday` / `closings topped yesterday` · ↓ `sales came up short of yesterday` / `we closed fewer than yesterday` / `closings slipped from yesterday` · = `sales matched yesterday` / `closings held even`
    - **Appointments — DROPPED** (no MCP source). Commentary uses Leads + Sales/Lost only.
  - **Outro:** `I'll be watching the leads tonight!` · `Talk to you tomorrow!` · `Let me know if you need anything!` · `Talk soon,` · `Let's close some sales!` · `Onward and upward!` · `Let's go!`
  - **Signature:** the store's agent name (Caroline = Honda/Nissan sales, Georgia = Ford). Day-to-day pick rotates within each bank so consecutive nights don't read identically.

### P7 — Monitoring corrections + daily monitoring summary
- Add **per-store outbound-volume-floor** check (store expected to send, sent 0 / down-segment → alert) — the gap that hid this outage. Extend rate/recipient checks to **SMS** (currently email-only).
- Confirm the sentinel is actually running/delivering (low-balance should already have fired at $6.84 < 20 — verify cron + `SENTINEL_ALERT_EMAIL` delivery).
- **Daily monitoring summary**: rolls up all sentinel events (still-applicable vs auto-resolved false-faults) and **verifies the 3 reports + text report were sent**.

## Rollout sequence (operator-gated)
1. **All test artifacts to Duane** (dry-run CSV, test text, example emails, sample alerts, sample text report).
2. **Serra, one store at a time** (texts + emails) with sign-off between each.
3. **Re-test to Duane.**
4. **Columbia (Ford of Columbia, Hyundai of Columbia), one store at a time.**

## Test artifacts produced for sign-off (no live customer contact until approved)
- 2nd-message **audience CSV** (dry run) + count, per store.
- **Test SMS** to your phone (2nd-message template + text-report sample).
- **Rendered example email** for each of the 3 reports (to you).
- **Sample alerts** (no-status, 5-min, >3-day) to you.

## Verification (end-to-end)
- Provider truth: after fix, `tm_list_messages` shows new outbound for the store; catch-up recipients match the double-derived CSV exactly.
- Reports: figures reconcile to `vin_query_leads` / `aggregateMessages`; service excluded (assert 0 service rows).
- Recordings: link resolves + plays via our route; reaper removes >30d files.
- Monitoring: kill a store's sends in a test → volume-floor check fires.
- Full test suite + build green before each deploy.

## Confirmed parameters
- **Timezone:** Central. **Business hours:** Mon–Sat 08:00–19:00; **after-hours:** 19:00–08:00; **Sunday:** closed; **holidays:** honored (holiday calendar, US federal default + per-store UI override).
- **Send times (CT):** Management **8:00am** · Lead Source **12:30pm** · wrap-up text **6:00pm**. 6–7pm + overnight after-hours roll into next morning's Management report.
- **Snapshot:** approved (P4b).
- **Your email:** duane.wells@huminic.ai (reports + text-report reply routing). Don = dwood@serrahonda.net, Durran = durran@cageautomotive.com.
- **Rollout:** test-to-Duane → Serra one store at a time → re-test → Columbia one store at a time.

## Outstanding execution dependencies (not blocking approval; blocking specific go-lives)
1. **Shelby's email** — blocks Shelby-routed alerts + reports.
2. **Cell numbers** for the 4 text-report recipients (you, Durran, Don, Shelby) — blocks the SMS text report.
3. **Holiday calendar** confirm (US federal default acceptable, or provide the dealer's list).
4. **Account refill** (operator) + balance re-check before any live send.
