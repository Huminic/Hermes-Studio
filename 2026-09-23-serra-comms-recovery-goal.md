# GOAL — Serra comms recovery: texting · alerts · reports · monitoring · recording link
Created: 2026-09-23 · Owner: operator (Duane) · Executor: Claude Code · Branch: `feat/serra-text-recovery-program`
Governs `2026-09-23-serra-comms-recovery-plan.md` (P0–P7 + VALIDATION UPDATE, which supersedes the older prose).

## Objective
Restore outbound texting for serra-ford + serra-nissan (dark since 2026-08-15) by generalizing the serra-honda-hardcoded send drivers (`followup.sh`, `immediate.sh`, `comms-holds-cron.ts`) to those stores AFTER verifying each has a live automation; run a double-verified one-time 72h catch-up to open sales leads created 2026-08-15→now-24h; ship 4 alerts, 3 daily email reports, and a nightly text report; fix the Vapi recording link; and close the per-store monitoring blind spot. Every customer send is gated behind a dry-run CSV, second-agent match, balance + kill-switch check, and per-store operator sign-off, rolled out one store at a time.

## Mandate
ZERO assumptions. Every audience/report/alert dataset independently re-derived by a second agent and must MATCH before anything sends. Verify EVERY store with provider ground truth. Nothing customer-facing without operator GO.

## Acceptance criteria
- **AC0 Runtime prereq (read-only):** For Ford + Nissan, confirm from brain.db whether an ACTIVE new_lead + lead_followup automation and live mode:reply subscriptions exist. If absent, that becomes the documented per-store enable step. No send until this is known.
- **AC1 Restore:** The three send drivers include tony-serra-ford + serra-nissan (not just serra-honda); after enable, `tm_list_messages` shows fresh outbound for each store; serra-honda regression-checked still healthy. trigger1/vin-watcher confirmed irrelevant (not touched).
- **AC2 Catch-up:** One-time follow-up-template send to open+ACTIVE, sales-only leads with `createdUtc` in [2026-08-15, now-24h] per store (explicit Aug-15 floor, not `--days` guesswork). Live recipients match the second-agent double-derived, operator-signed dry-run CSV exactly after CommGate drops; zero opt-out/duplicate/service sends; balance verified immediately prior.
- **AC3 72h:** Ongoing follow-up cadence set to 72h via the active automation's `wait_hours` (verified live path — NOT the dead `sms_triggers.trigger2.window_min`); no 24h texts remain; initial after-hours texts resume per store only after catch-up + operator confirm.
- **AC4 Recording link:** Vapi recording downloaded on webhook to `/mnt/storage/recordings/<profile>/`, served via an AUTHENTICATED route, email link points to our route, raw-R2 URL no longer emitted, age-based 30-day reaper deletes files + clears metadata. TESTED: unit + integration + one live end-to-end where the dealer email link plays the recording; sample link to operator before go-live; HIPAA retention decision confirmed.
- **AC5 Alerts:** Hourly business-hours sentinel fires on no-status lead, new lead unactioned >5min, new lead >3 days, same-status >1 week (last needs the nightly snapshot); linear aging Mon–Sat 08:00–19:00 CT (overnight/Sun/holiday frozen); nightly status snapshot runs; routes to Don + Shelby at VERIFIED addresses (.co vs .net resolved); dedup prevents noise.
- **AC6 Daily reports:** Daily AI Management (08:00 CT) + Lead Source (12:30 CT) delivered to Don, Shelby, Durran; figures reconcile to vin_query_leads/aggregateMessages; service asserted 0 rows; Appointments + Team Sales Performance correctly absent (no MCP source); UI-adjustable.
- **AC7 Text report:** 18:00 CT SMS to the 4 recipients, Greeting|Data|Commentary|Outro; numbers never invented; commentary only from fixed banks keyed to computed deltas (leads + sold/lost; sold/lost from snapshot); replies routed to duane.wells@huminic.ai + Durran.
- **AC8 Monitoring:** Sentinel confirmed running + delivering in prod; per-store outbound-volume-floor check fires when an expected-to-send store sends 0 (test: kill a store's sends → alert); SMS added to rate/recipient checks; daily monitoring summary rolls up alerts (applicable vs resolved) + verifies the 3 reports + text report went out.
- **AC-GLOBAL:** Full test suite + `vite build` green before each deploy; rollout = all test artifacts to Duane → Serra one store at a time (sign-off between) → re-test → Columbia one store at a time.

## Out of scope / dropped (evidence-confirmed)
Appointments metrics + per-salesperson Team Sales Performance (not reachable via MCP). Pre-go-live event-dated history (snapshot accrues forward only).

## Dependencies (block specific go-lives, not the build)
Shelby's verified email · 4 cell numbers for the text report · holiday calendar · TextMagic refill + pre-send balance re-check · Don/Shelby .co-vs-.net address confirmation.

## Start (authorized)
Build begins now under yesterday's authorization: read-only AC0 brain.db checks + the net-new, no-customer-contact work (P3 recording fix, monitoring, report/alert scaffolding, snapshot). Customer sends remain gated per AC1–AC3 until dry-run sign-off, one store at a time.
