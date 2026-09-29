---
title: Serra comms recovery — finish plan for an executing model
created: 2026-09-24
updated: 2026-09-24
type: project
status: proposed (awaiting Duane's go for S0)
repo: /home/ubuntu/Claude-store/huminic-studio (Andromeda), branch feat/serra-text-recovery-program
implementer: executing model in tmux on Andromeda, one tranche per session; Major reviews; Duane accepts
governs: 2026-09-23-serra-comms-recovery-goal.md (AC0–AC8, AC-GLOBAL) and 2026-09-23-serra-comms-recovery-plan.md (P0–P7 + VALIDATION UPDATE)
---

# Serra comms recovery — finish plan for an executing model

## Goal
Restore outbound texting for tony-serra-ford and serra-nissan (dark since 2026-08-15; Ford last outbound
2026-08-25, Nissan 2026-08-15), run a double-verified one-time catch-up, ship the alerts, two daily email
reports and the nightly text report, fix the Vapi recording link, and close the per-store monitoring blind
spot. Acceptance criteria are AC0–AC8 + AC-GLOBAL in the goal file; this page only sequences the work so a
supervisor can verify each step from the outside. No customer contact happens inside any builder tranche.

## Ground truth at the start (verified by Major 2026-09-24, read-only)
- Live `marketing_automations`: serra-honda `new_lead`+`lead_followup` ACTIVE (fired 2026-09-24 00:00Z);
  tony-serra-ford and serra-nissan both `draft`, never triggered, `wait_hours` 24.
- Running container `hermes-studio-…-183656295422` = image `c3e4c5332` (the last commit on the branch).
  Mounts: `hermes-state → /root/.hermes`, `studio-sessions → /app/.runtime`. **`/mnt/storage` is NOT
  mounted into the container** (the recording fix as written would save to the container's throwaway disk).
- Working tree: 5 tracked files modified, 9 new server modules + 9 new test files untracked, 0 commits on
  the branch, branch not on the remote. Full suite 1279 passed / 1 skipped, `vite build` exit 0.
- Send drivers: `scripts/cron-catchup-followup.sh` hardcodes `--profile serra-honda`;
  `scripts/cron-catchup-immediate.sh` uses `IMMEDIATE_PROFILES` (default serra-honda);
  `/home/ubuntu/hermes-ops/{followup,immediate,holds}.sh` are in crontab and are OUT OF SCOPE for the builder.

## Rules for the executing model (read before every tranche)
- Work ONLY in `/home/ubuntu/Claude-store/huminic-studio` on branch `feat/serra-text-recovery-program`.
- NEVER, in any tranche: `git push`; `docker exec` or any docker command; edit crontab; write anything under
  `/var/lib/docker/volumes`, `/home/ubuntu/.hermes` or `/home/ubuntu/hermes-ops`; run any script with
  `--send`, `--live` or equivalent; change any `marketing_automations` row; touch Coolify; send an email or
  SMS; call TextMagic, Resend, Vapi or VinSolutions write endpoints; change serra-honda's behaviour (every
  driver keeps its current default until an operator sets an env var).
- One tranche per session. Do the steps in order. Do not start the next tranche. Do not widen scope; write
  anything else you find to `defects/finish-plan-followups.md` and continue.
- Do not create new markdown files at the repo root. Do not touch the pile of untracked `*.png` and older
  `*.md` files at the root; they belong to other sessions.
- Every tranche ends with: `npx vitest run` fully green (no fewer passes than the frozen baseline
  `defects/finish-plan-evidence/test-baseline-c3e4c5332.txt`); `npx vite build` exit 0; a commit on the
  branch with message `finish(S<n>): <summary>`; the evidence commands pasted verbatim with their output into
  `defects/finish-plan-evidence/S<n>.md`; and the exact word `READY` followed by the commit sha. If any gate
  fails, write `BLOCKED: <reason>` instead and stop.
- Do not ask Duane questions inside the tmux session; write them to `defects/finish-plan-questions.md` and
  stop with `BLOCKED`. Major reads that file and answers in `defects/finish-plan-reviews/S<n>.md`.
- Do not write tests that read source files with regex. Test behaviour through the functions and routes.
- Commit in small `wip(S<n>.<step>): …` commits as you go so the supervisor can follow progress.

## Roles
- **Builder** (tmux session per tranche): code, tests, evidence, `READY`. Never customer-facing.
- **Major** (supervisor loop on Duane's Mac): reviews every `READY`, writes `defects/finish-plan-reviews/S<n>.md`
  as APPROVED / REJECTED (with the exact fix) / RULING, updates the Progress line, launches the next tranche,
  independently re-derives every audience and report figure (the second agent), and runs the operator
  steps D1, S6, S7 and the enable steps WITH Duane, command by command.
- **Duane**: gives GO files (`defects/finish-plan-reviews/GO-<step>.md`, relayed by Major), reviews test
  artifacts, supplies inputs (Don/Shelby addresses, Shelby's email, 4 cell numbers, holiday list), refills
  TextMagic, signs each store's dry-run CSV.

## Progress
Progress: N1, N2, N2.6 (a3bfe1796), N3 (17010a383) APPROVED; D1 deployed 2026-09-25; go-live Monday 2026-09-28 08:00 CT; next = D2 deploy → test battery to Duane → battery to Durran → audience config + activate + crontab → smoke → Duane authorizes. Reviews in defects/finish-plan-reviews/.

## Plan (tranches)

### S0 — Preserve the work and freeze the baseline (no source changes; ~20 min)
Why: the entire session's output exists only as untracked files on one disk.
1. `git status --short` and record it. Stage ONLY: the 5 modified tracked files, every untracked file under
   `src/`, and the two files `2026-09-23-serra-comms-recovery-goal.md` and
   `2026-09-23-serra-comms-recovery-plan.md`. Nothing else (no png, no other root md, no `.claude/`,
   no `scripts/` additions from other sessions).
2. Commit as `wip(S0.1): serra comms recovery — recording fix, alerts, reports, snapshot, preview cores`.
3. Create `defects/finish-plan-evidence/`, `defects/finish-plan-reviews/`, `defects/finish-plan-followups.md`,
   `defects/finish-plan-questions.md`. Run `npx vitest run 2>&1 | tee defects/finish-plan-evidence/test-baseline-c3e4c5332.txt`
   and `npx vite build; echo exit=$?`.
4. List every remaining untracked file at the repo root in `defects/finish-plan-followups.md` under
   "Unowned files at root (not committed by S0)".
5. Evidence: `git log --oneline -3`, `git status --short | wc -l`, the `Test Files`/`Tests` lines, the build
   exit code, `git diff --stat c3e4c5332..HEAD | tail -1`.
Tests: full suite green. Commit `finish(S0): work preserved, baseline frozen`. `READY <sha>`.

### S1 — Recording fix hardening (AC4; ~half a day)
Why: `/mnt/storage` is not mounted into the container, and a failed download only logs a warning although
the fallback URL expires (plan P3 requires an alert).
1. `src/server/call-recording.ts`: add `recordingsStorageStatus(root?)` returning
   `{ ok, root, reason }` (root exists, is a directory, is writable; test with a temp dir and a read-only dir).
2. New sentinel check `recordings-storage` in `src/server/sentinel.ts` (scope global): critical finding when
   `recordingsStorageStatus()` is not ok, title "Recording storage unavailable", detail naming the root and
   reason. Add to `DEFAULT_CHECKS`. Unit test it.
3. Download failures: persist each failure (`profile`, `callId`, ISO time, reason) to
   `<root>/../recording-failures.jsonl` (or, if the root is unusable, to the OS temp dir) via a small
   `recordDownloadFailure()`; new sentinel check `recording-downloads` raises a warning listing failures in the
   last 24h (critical if ≥ 3). The webhook calls `recordDownloadFailure` where it currently only warns.
   Unit test both.
4. Do NOT change the default root (`/mnt/storage/recordings`); the volume mount and `RECORDINGS_ROOT` are set
   at deploy (D1, Major).
5. Evidence: test names + counts for the new tests; `git diff --stat`; the full-suite and build lines.
Tests: `npx vitest run src/test/call-recording.test.ts src/test/recordings-route.test.ts src/test/sentinel*.test.ts`
green + full suite. Commit `finish(S1): recording storage + download-failure alerts`. `READY <sha>`.

### S2 — Catch-up audience builder, read-only (AC2 input; ~half a day)
Why: the operator signs a CSV; the second agent must be able to re-derive it from the same rules; Ford
texted through 2026-08-25 so "created since Aug 15" alone over-includes.
1. `scripts/serra-catchup-audience.ts`: flags `--profile <p>`, `--from 2026-08-15`, `--to <ISO, default now-24h>`,
   `--out <dir>`. Uses the same lead gather as `scripts/catchup-followup.ts` (`vin_query_leads`, ACTIVE,
   paginated fully). Rules, each applied and COUNTED separately: sales lead types only (`SALES_LEAD_TYPES`);
   drop `leadSource` name "Service Dept" (Duane's ruling 2026-09-24); dedupe by contact id; drop any contact
   that already has an outbound `sms` row in the profile's `messages` table on or after `--from`; mark
   `phone_missing`; mark `opted_out` using the existing opt-out lookup that CommGate uses if it is callable
   without sending (otherwise column `gate=unknown` and say so in evidence).
2. Output: `<out>/<profile>-audience-<date>.csv` (contactId, leadId, createdUtc, leadType, leadSource, phone
   masked to last 4, exclusion reason or `SEND`) and `<out>/<profile>-audience-<date>.summary.json` with every
   count. The script must not import any send function; add a test that asserts its module graph excludes
   `dispatchSms`, `dispatchOutbound` and the TextMagic client.
3. Fixture tests for every rule (including the Ford already-texted case). No live run in this tranche.
4. Evidence: test names + counts; `--help` output; full-suite and build lines.
Commit `finish(S2): read-only catch-up audience builder`. `READY <sha>`.

### S3 — Live preview runner, read-only (AC6/AC7 artifacts; ~half a day)
Why: reports and the text report must be shown to Duane from real data before anything is scheduled.
1. `scripts/comms-preview.ts`: `--profile <p>`, `--out <dir>`. Fetch the inputs `assemblePreviewBundle`
   needs (leads over the 4 windows via the vin client; messaging-hub aggregates via the existing aggregate
   functions), render with `renderPreviewText`, and write `<profile>-daily-management.txt`,
   `<profile>-lead-source.txt`, `<profile>-alerts.txt`, `<profile>-text-report.txt`, plus a
   `<profile>-raw-counts.json` holding the raw numbers each figure was computed from (for reconciliation).
2. Same no-send module-graph test as S2. Fixture test that the runner writes the five files from a fixture
   bundle. No live run in this tranche.
3. Evidence as S2. Commit `finish(S3): read-only comms preview runner`. `READY <sha>`.

### D1 — Deploy the branch (Major + Duane; NOT a builder tranche; needs `GO-D1.md`)
No customer contact. Steps Major runs with Duane watching: push the branch; in Coolify add the volume
`/mnt/storage/recordings:/mnt/storage/recordings` and env `RECORDINGS_ROOT=/mnt/storage/recordings`,
`PUBLIC_BASE_URL=<studio public URL>`; preview the change; Duane confirms; execute; verify new image sha,
mounts, `/api/health`, the `recordings-storage` check passes, serra-honda still sends at the next tick.
Rollback = redeploy `c3e4c5332`. Evidence in `defects/finish-plan-evidence/D1.md`.

### S4 — Live artifacts for Duane (read-only, post-D1; ~2 h; Major runs it, builder idle)
1. `docker exec` the new container: `npx tsx scripts/serra-catchup-audience.ts` for tony-serra-ford and
   serra-nissan; `npx tsx scripts/comms-preview.ts` for tony-serra-ford, serra-nissan and serra-honda (control).
2. Major independently re-derives both audiences with a separate query path and diffs against the CSVs;
   mismatch = stop. Reconcile every report figure against `raw-counts.json` (AC6).
3. Copy artifacts to `defects/finish-plan-evidence/S4/`; Duane reviews. Test SMS to Duane's phone (one send,
   needs his number and his word) once the text-report sample reads right.
Output: signed CSV per store (Duane writes "signed" into `GO-Ford.md` / `GO-Nissan.md`).

### S5 — Restore tooling, code only (AC1/AC3 tooling; ~one day)
Why: the restore must be a reviewed, dry-run-first command, not a hand edit on a live database.
1. `scripts/cron-catchup-followup.sh`: iterate `FOLLOWUP_PROFILES` (default `serra-honda`, so nothing changes
   until an operator sets it), mirroring `cron-catchup-immediate.sh`.
2. `scripts/activate-store-automations.ts --profile <p> --wait-hours 72` : prints the current
   `marketing_automations` rows, the exact UPDATE it would run, and stops. `--live` additionally requires
   `SERRA_RESTORE_CONFIRM=<profile>` in the environment and prints before/after rows. Never touches serra-honda
   unless named. Tests against a temp SQLite copy.
3. `scripts/catchup-followup.ts`: add `--from-csv <signed csv>` (only `SEND` rows), `--since 2026-08-15` floor,
   and keep `--send` required for live; dry run prints will-send / dropped-with-reason after CommGate and a
   balance line from `defaultProbeTextmagic`; abort if balance < need. Fixture tests.
4. Evidence: dry-run outputs from fixtures; full-suite and build lines. Commit
   `finish(S5): restore tooling, dry-run first`. `READY <sha>`.

### S6 — Serra Ford go-live (Major + Duane runbook; needs `GO-Ford.md`, TextMagic refilled)
Balance check → `activate-store-automations --live` for tony-serra-ford (72h) → catch-up from the signed
CSV with `--send`, one store → `tm_list_messages` shows the sends → serra-honda regression check → set
`comms.sms_volume_floor_24h` for Ford → `FOLLOWUP_PROFILES` includes Ford. Evidence in `S6.md`.

### S7 — Serra Nissan go-live (same runbook; needs `GO-Nissan.md`)

### S8 — Alerts, reports, text report and monitoring wired but OFF by default (AC5–AC8; ~one day)
1. Sentinel: add the lead-aging checks (`lead-aging.ts`) to `DEFAULT_CHECKS` gated by
   `comms.alerts.enabled` per profile; alert recipients and holiday list from studio config
   (`comms.alerts.recipients`, `comms.holidays`); nightly `lead-status-snapshot` job; daily monitoring summary
   that lists open vs auto-resolved findings and whether each scheduled report went out.
2. Scheduler: Daily AI Management 08:00 CT, Lead Source 12:30 CT (email via the existing send path to
   `comms.reports.recipients`), text report 18:00 CT via `dispatchSms` to `comms.text_report.recipients`.
   All three no-op when their recipient list is empty. `comms.reports.preview_to` sends to the operator only.
3. Tests for gating (empty config → nothing scheduled/sent). Evidence as before. Commit
   `finish(S8): alerts/reports/text report wired, config-gated`. `READY <sha>`.
Enable step (Major + Duane, after Duane's inputs): set recipients/holidays/numbers in each store's config,
preview-to-operator for one day, then live. Evidence in `S8-enable.md`.

### S9 — Columbia (Ford of Columbia, Hyundai of Columbia) — same S4→S6 pattern per store; needs `GO-Columbia.md`.

### LC — Close-out (Major + Duane)
AC0–AC8 + AC-GLOBAL walked one by one with evidence links; dated client narrative for Serra; branch merged
or kept per Duane; goal file marked complete.

## Supervisor loop (Major)
Each tick (self-paced): `git log` for new `wip(S…)`/`finish(S…)` commits; tmux pane tail for `READY`/`BLOCKED`;
on READY → pull the diff, re-run the suite and build myself, check the evidence claims against real output,
write `defects/finish-plan-reviews/S<n>.md`, update the Progress line, launch the next tranche unless it
needs a GO file; on BLOCKED → answer `finish-plan-questions.md` in the review file if it is within the plan,
otherwise ask Duane; report to Duane in three to five lines each time something changes.

## Launch command (Major runs it; one session per tranche)
```
tmux new-session -d -s serra-S0 -c /home/ubuntu/Claude-store/huminic-studio \
  'claude --model sonnet --dangerously-skip-permissions "Read /home/ubuntu/Claude-store/huminic-studio/2026-09-24-serra-recovery-finish-plan.md. Execute tranche S0 only, following the Rules section exactly. End with READY <sha> or BLOCKED <reason>."'
```


## NIGHT TRANCHE (added 2026-09-24 ~00:00 CT by Major; supersedes S1–S3 ordering for tonight)

Deadline: customers at Serra Ford and Serra Nissan get their catch-up text at 08:00 CT today, and the
store managers get the Daily AI Management Report by email at 08:00 CT today. You have ~90 minutes. Prefer
the simplest correct change. Everything you write is read-only against live systems: NO docker, NO sends.

### N1 — Catch-up audience flags + live preview runner + report emailer (opus; ~90 min)
Baseline: `defects/finish-plan-evidence/test-baseline-be8556ae2.txt` (1279 passed / 1 skipped). Start by
reading `scripts/catchup-followup.ts`, `src/server/catchup-followup.ts`, `src/server/comms-preview.ts`,
`src/server/daily-management-report.ts`, `src/server/lead-source-report.ts`, `src/server/text-report.ts`,
`src/server/lead-aging.ts`, `src/server/messaging-hub-store.ts` (message/thread readers) and
`src/server/vin-client.ts` (lead query + `resolveLeadNames`). Commit `wip(N1.x)` after each step.

**N1.1 — Catch-up script flags** (`scripts/catchup-followup.ts` + `src/server/catchup-followup.ts`):
- `--since YYYY-MM-DD`: explicit `createdUtc` floor (UTC midnight). When given, the lead query window starts
  there (overrides `--days`), and any lead with `createdUtc < since` is dropped with reason `before since floor`.
- `--exclude-source "<name>"` (repeatable): drop a lead whose lead-source NAME (resolved the way the rest of
  the codebase resolves source ids to names; fall back to the raw id string) equals the value,
  case-insensitive, reason `excluded source: <name>`.
- `--skip-texted-since YYYY-MM-DD`: drop a candidate whose canonical phone has ANY outbound `sms` message in
  the profile's messaging-hub `messages` table on/after that date (read through the existing store helpers,
  read-only), reason `already texted since <date>`. This covers Ford customers who were texted 2026-08-15→25
  through the reply path and are not in the automation ledger.
- `--csv <path>`: in dry-run, ALSO write a CSV: `decision,phone_last4,firstName,leadId,createdUtc,leadType,
  leadSource,reason` with one row per candidate (`SEND`) and per dropped lead (`DROP`), plus a
  `<path>.summary.json` with every count (polled, active, sales, dropped-by-reason, candidates).
- Dry-run stays the default; `--send` semantics unchanged; the CommGate path is untouched.
- Tests: fixture tests in `src/test/` for each flag through `gatherFollowupCandidates` (inject deps as the
  existing tests do). Do not touch the existing behaviour when the flags are absent (existing tests stay green).

**N1.2 — Live preview runner** (`scripts/comms-preview.ts`, new): `--profile <p> --date <YYYY-MM-DD, default
today in the store's comms.business_hours tz> --out <dir>`. Fetch, read-only, everything `assemblePreviewBundle`
needs and write `<out>/<profile>-preview.txt` (from `renderPreviewText`), `<out>/<profile>-daily-management.json`,
`<out>/<profile>-lead-source.json`, `<out>/<profile>-text-report.txt`, `<out>/<profile>-alerts.json` and
`<out>/<profile>-raw-counts.json`. The raw-counts file must hold, for every figure, the raw inputs it was
computed from (counts, window bounds in ISO, the query used) so Major can reconcile by hand.
Derivations (use the store's `comms.business_hours` for day/after-hours; "report day" = the previous
business day 08:00 → today 08:00 local, so overnight rolls in):
- leadsDuringDay / leadsAfterHours: VIN leads (sales types only, service/parts dropped) by `createdUtc`.
- afterHoursInboundCalls: inbound `voice` messages/threads in the window created outside business hours.
- textsSentOnBehalf: outbound `sms` messages in the window. businessHoursTextCount: those inside business hours.
- teamboxSent / teamboxReceived: from the existing Teambox aggregate helpers (if none exist, count messages by
  direction on non-sms channels and SAY SO in raw-counts).
- afterHoursAvgTimeToTextMin: `avgAfterHoursTimeToTextMin` over (inbound, first outbound after it) pairs
  per thread in the window.
- leadsLeftBehind: sales leads created ≥24h before window end still in `ACTIVE_NEW_LEAD` with no outbound sms.
- activeLeads30d: ACTIVE sales leads created in the last 30 days.
- leadSource windows (24h/7d/30d/prev24h) and the text-report input from the same lead pulls; alerts from
  `lead-aging.ts` over the current lead set; `staleStatus` = [] tonight (snapshot has no history yet) and say so.
If a figure cannot be derived from available data, write `null` and the reason; never invent.
Tests: a fixture test that the runner's pure assembly function writes the six files from an injected input;
a test that the runner's module graph does not include `dispatchSms`, `dispatchOutbound`, `sendAutomationNow`
or the TextMagic client.

**N1.3 — Report emailer** (`scripts/send-daily-report.ts`, new): `--profile <p> --from <dir written by N1.2>
--to a@x,b@y --store-name "<Display name>"`. Renders the Daily AI Management Report as an HTML email using the
existing email rendering/sending helpers in `src/server/lead-notifications.ts` / `notifications.ts` (export
what is private; do not fork the template). Subject: `Daily AI Management Report — <Store> — <date>`. Body:
the report lines as a two-column table, the footnote, and a one-line "Sales only; generated <ISO time>".
Dry-run by default: prints recipients + the rendered HTML to stdout and writes `<from>/<profile>-email.html`.
`--send` required to send. Tests: rendering from a fixture bundle; `--send` absent ⇒ no send function called.

**Gate + finish:** `npx vitest run` fully green (≥ baseline passes), `npx vite build` exit 0. Evidence in
`defects/finish-plan-evidence/N1.md`: the new test names + counts, `--help`/usage of each script, `git diff
--stat be8556ae2..HEAD`, the suite and build lines. Commit `finish(N1): catch-up flags, live preview runner,
report emailer`. Print `READY <sha>`. If blocked, `BLOCKED: <reason>` + the question in
`defects/finish-plan-questions.md`.


## NIGHT TRANCHE 2 (added 2026-09-25 ~01:15 CT by Major)

Context: N1 is deployed (main@984884c7f). Duane reviewed the first samples and rejected the email design
("a list, not a report"). His manifest is FOUR deliveries per store per day, plus a one-time intro text.
Everything stays dry-run by default. Same rules as N1: no docker, no sends, no push, no crontab.
~90 minutes. Commit `wip(N2.x)` per step. Times below are narrative only; scripts take no clock.
1. Morning — Daily AI Management Report (email)
2. Noon — Lead Source Report (email)
3. 18:30 CT — End-of-day Wrap-up (email)
4. ~19:00 CT — Text-message wrap-up (SMS, Greeting|Data|Commentary|Outro, agent voice)

### N2 — Report email design + the other three deliveries + intro text (opus)
Read first: `src/server/lead-notifications.ts` (`renderLeadCardHtml`, BRAND_* constants,
`renderDailyManagementEmail`), `scripts/send-daily-report.ts`, `scripts/comms-preview.ts`,
`src/server/comms-preview.ts`, `src/server/text-report.ts`, `src/server/prelaunch-lock.ts`, and
`src/server/messaging-adapters.ts` (`dispatchOutbound` — the outbound SMS path with CommGate + prelaunch lock).

**DESIGN REFERENCE (must match):** `/tmp/email-template-ref/design-reference.png` — a light card on a
grey page: small logo/wordmark top-left, a bold headline ("See what your team has been up to"), a one-line
greeting + one-line context sentence, then a 2×2 grid of white KPI tiles (large number, colored dot +
label), then a section headline and a row list where each row has an identity on the left (name + role)
and four small stats on the right (number over dot+label), then one solid green CTA button, then a
plain-text footer. Email-safe coding conventions (tables, inline CSS, no flex/grid, 600px column,
system font stack) can be borrowed from `/tmp/email-template-ref/index.html` (a licensed template pack;
copy PATTERNS and CSS, not its Lorem content or images). No external images except our logo if one is
already hosted; dots are CSS-colored table cells, not images. Must render in Gmail web, Outlook desktop
and iPhone Mail. Keep a plain-text alternative.

**N2.1 — Report email template** (`src/server/report-email.ts`, new; used by every report email).
Export `renderReportEmail({ storeName, agentName, headline, greeting, context, tiles, sections, cta?, footnotes })`:
- header: Huminic wordmark (text) + store name; headline bold; greeting "Hi team," (or `--greeting-name`);
  context sentence in the agent's voice with numbers filled from data, never invented
  (e.g. "Overnight at Tony Serra Ford: 5 new leads came in, 0 were texted, 1 is waiting on a salesperson.").
- tiles: 2×2 grid; each { value, label, dotColor, delta?: { text, direction: up|down|even } } — delta shown
  small under the label, green ▲ / red ▼ / grey =.
- sections: each { title, rows: [{ primary, secondary, stats: [{ value, label, dotColor }] }] } rendered
  like the "Active team members" rows (identity left, up to four stats right). Also allow a simple
  `table` section { title, columns, rows } for the noon source table.
- cta: optional single green button { label, url }; use it for "Open VinSolutions" (link to the store's
  VinSolutions CRM home) on every report.
- footnotes: small grey text block; the omission footnote appears ONCE (fix N1's duplicate "Sales only").
Rewrite `renderDailyManagementEmail` on it: tiles = New leads (day+after-hours, delta vs yesterday),
AI texts sent (delta), After-hours calls, Needs attention (unactioned>5min + sitting>3d); section
"Needs attention" = rows per lead (first name + source as identity; stats: hours waiting, status, lead
type) up to 10 — the runner must include lead first names/sources for alert buckets (extend the alerts
artifact in comms-preview with `{leadId, firstName, source, createdUtc, leadStatus}` per bucket, read-only);
section "AI coverage" = one row (Georgia/Caroline as identity; stats: after-hours leads handled, avg
time-to-text, business-hours texts, active leads 30d). Subject unchanged.
Tests: renders tiles/sections/cta/footnotes; escapes HTML; single footnote; no external images.

**N2.2 — Lead Source Report email** (`scripts/send-lead-source-report.ts`, new; same flags/dry-run as
send-daily-report): reads `<from>/<profile>-lead-source.json`. Tiles = leads 24h, leads 7d, leads 30d,
sold 24h (cohort). Section rows = top sources by 30d (identity: source name; stats: 24h, 7d, 30d, sold)
for the top 10, then a compact table for the rest. Unnamed sources render "Source <id>" with the footnote
"Unnamed sources are legacy VinSolutions source ids". Subject `Lead Source Report — <Store> — <date>`.

**N2.3 — End-of-day Wrap-up email** (`scripts/send-daily-wrapup.ts`, new): add `--window wrapup` to
`scripts/comms-preview.ts` = report-day 08:00 → now, writing the same artifact set with suffix `-wrapup`.
Tiles = leads today (delta vs yesterday), AI texts sent today, replies received today (inbound sms),
needs attention. Sections: "Today's leads by source" (rows, top 8), "Needs attention" (rows as N2.1),
"Sold / lost today (cohort of today's leads)" as a 2-stat row. Subject `Daily Wrap-up — <Store> — <date>`.

**N2.4 — Text-message wrap-up sender** (`scripts/send-text-report.ts`, new): reads
`<from>/<profile>-text-report.txt` (`-wrapup` variant when `--window wrapup`), `--to +1…,+1…`; dry-run prints
the exact SMS + recipients; `--send` sends through `dispatchOutbound` (so CommGate, the prelaunch lock and
comms_log apply) from the store's number, one message per recipient, `bypassBusinessHours: false`.
Refuse `--send` when `--to` is empty. Tests: dry-run calls no sender; `--send` calls the injected sender
once per recipient with the exact text.

**N2.5 — One-time intro text** (`scripts/send-intro-text.ts`, new): same sender/flags as N2.4;
`--agent-name` per store (Honda "Caroline", Nissan "Caroline", Ford "Georgia" unless `comms.agent_name`
exists in studio config — check and prefer config). Copy (exact):
`Good morning! This is <Agent> with <Store>. Starting today I'll be texting you a short end-of-day wrap-up
with key numbers on the dealership, and you'll see some new reports in your email. Over the coming weeks
you'll be able to chat with me here too. Have a great day and let's get 'em!` Tests as N2.4.

**Gate + finish:** full suite green (≥ 1289), `npx vite build` exit 0, evidence in
`defects/finish-plan-evidence/N2.md` (test names, `--help` of each script, one rendered HTML sample per
report from fixtures saved under `defects/finish-plan-evidence/N2/`), commit `finish(N2): report email
design, lead-source + wrap-up emails, text senders, intro text`, print `READY <sha>`.

### N2.6 — Design fixes from Duane's review (2026-09-26)
1. Header: the logo sits centered on the white card with NO box or background behind it (if a hosted
   transparent Huminic logo exists in the codebase or BRAND_* constants use it; otherwise the centered
   wordmark). Directly under it, a full-width gradient banner: mostly deep purple, blending discreetly into
   fuchsia toward one corner (linear-gradient with a bgcolor fallback for Outlook). The banner holds the
   store name, the report headline and the one-sentence story, all in white. Tiles start below the banner.
2. "Needs attention" and "AI coverage" become real tables: a header row whose column names carry the
   color (colored text or a colored dot beside the header label), then plain rows underneath. Needs
   attention columns: Lead · Source · Waiting · Status · Type. AI coverage columns: Agent · After-hours
   leads · Avg reply · Day texts · Active 30d. No per-cell dot labels.
3. Status colors reworked into one scheme used everywhere: waiting = amber under 24h, red at 24h or more;
   status New = blue; lead types grey. Tile dots follow the same palette.
4. Apply to all three emails (morning, noon, wrap-up). Re-render the fixture samples to
   `defects/finish-plan-evidence/N2/render-*.png`, tests green, commit `finish(N2.6): design fixes`.


## NIGHT TRANCHE 3 — real wiring (added 2026-09-26 evening CT by Major)

Context: N2 + N2.6 give us the four deliveries as CLI scripts with `--to`. Duane's decision: ONE management
audience per store — the same four people (Duane, Durran, Don, Shelby) get every report, the wrap-up text,
the intro text and the alerts. Customer texting (catch-up, 72h follow-ups, new-lead texts, replies) is
untouched. Monday 2026-09-28 08:00 CT is go-live. Same rules: no docker, no sends, no push, no crontab
EDITS (you may add a cron FILE to the repo; Major installs it). Commit `wip(N3.x)` per step.

### N3 — Recipients from store config, scheduler, alerts routing, weekend windows (opus)
Read first: `src/lib/studio-config.ts` (CommsSchema / notifications routing), the notifications routing
UI + API under `src/routes/api/customer/notifications*` and `src/routes/customer/*notifications*`,
`src/server/notifications.ts`, `src/server/sentinel.ts` (`DEFAULT_CHECKS`, alert delivery),
`src/server/lead-aging.ts`, `scripts/comms-preview.ts`, the four `scripts/send-*.ts`, and
`scripts/cron-catchup-followup.sh` (the pattern for docker-exec cron wrappers).

**N3.1 — Management audience in store config + UI.** Add to `CommsSchema` (per store):
`comms.management_audience: { emails: string[], cells: string[] (E.164) }` and
`comms.reports: { enabled: boolean, tz?: string }`, `comms.alerts: { enabled: boolean }`.
Expose both in the EXISTING customer notifications settings page (same place the routing matrix lives;
add a "Management audience" card with two textareas + the two enable toggles), saved through the existing
notifications API (tenant-scoped; validate emails + E.164). Every `scripts/send-*.ts` defaults `--to` to
the profile's `management_audience` (emails for email scripts, cells for text scripts); an explicit `--to`
still overrides. Tests: schema accepts/rejects; scripts pick up config when `--to` is absent; UI route
test that the card round-trips.

**N3.2 — Report windows.** In `scripts/comms-preview.ts`: the MORNING window = previous business-day
CLOSE (comms.business_hours end, Mon–Sat, skipping Sunday/holidays) → report-day OPEN, so Monday covers
Saturday 19:00 → Monday 08:00 and never repeats Saturday's wrap-up. WRAPUP window = report-day OPEN → now.
Lead Source windows unchanged (24h/7d/30d to report-day open). Raw-counts records both bounds. Tests
with a Monday and a Tuesday fixture.

**N3.3 — Scheduler.** Add `scripts/cron-serra-reports.sh` (docker-exec wrapper like
cron-catchup-followup.sh) taking `<job>` ∈ morning|noon|wrapup|text and iterating
`REPORT_PROFILES` (space/comma list; default EMPTY so nothing runs until Major sets it). Each job runs
comms-preview for the right window into `/tmp/reports/<profile>/<date>/`, then the matching send script
with `--send` using the config audience, and skips when `comms.reports.enabled` is false or the audience
is empty. Log one line per profile per job to stdout. Add `docs/serra-reports-cron.txt` with the exact
crontab lines (server is UTC; CT = UTC-5 in September): morning 13:00, noon 17:00, wrapup 23:30, text
00:00 next day UTC; Mon–Sat only (`1-6`). No crontab edit by the builder.

**N3.4 — Alerts routing.** Register the lead-aging checks (`lead-aging.ts` buckets: no-status,
unactioned >5 min, sitting >3 days; same-status >1 week when the snapshot has history) as sentinel checks
scoped per profile, gated by `comms.alerts.enabled`, business-hours-linear aging Mon–Sat 08:00–19:00 CT,
deduped by (profile, bucket, leadId) so a lead alerts once per bucket per day. Deliver through the
existing sentinel alert path but addressed to `management_audience.emails` (email) — subject
`Lead alert — <Store>: <n> leads need attention`, body a short table (lead, source, waiting, status).
Nightly `lead-status-snapshot` job added to the same cron wrapper (`snapshot` job, 04:00 UTC). Tests:
gating, dedup, addressing.

**N3.5 — Intro text is one-time.** `send-intro-text.ts` records each (profile, cell) it sent to in the
profile's messaging-hub (a `comms_log`/metadata marker) and refuses to resend to the same cell unless
`--force`. Test it.

**Gate + finish:** full suite green (≥ 1308 + N2.6's tests), `npx vite build` exit 0, evidence in
`defects/finish-plan-evidence/N3.md` (test names, the cron file, a screenshot or route-test output of the
settings card), commit `finish(N3): audience config + UI, scheduler, alerts routing, weekend windows`,
print `READY <sha>`.

## N4 — 72-hour follow-up cutoff (added 2026-09-27 ~21:45 CT by Major; HIGHEST PRIORITY, ~30 min)
Duane rule: the 2nd (follow-up) message goes at 72 hours, never 24. Today `FOLLOWUP_AFTER_MS` is a
hard-coded 24h constant used as the DUE cutoff in `src/server/catchup-followup.ts` (and anywhere else it
is imported). Change: the due cutoff = the ACTIVE `lead_followup` automation `wait_hours` for that
profile (hours → ms), falling back to 72h when the value is missing or 0; keep the exported constant only
as a deprecated alias set to 72h. `gatherFollowupCandidates` takes `waitHours` (script passes
`followup.wait_hours`), reports it in the dry-run header (`due cutoff: <n>h`) and in the CSV summary, and
drops younger leads with reason `not yet due (<n>h)` so they are COUNTED, not silent. `anniversaryMs`
uses the same value. Also rename the dry-run label `due(24h)` to `due`. Tests: a 30h-old lead is NOT a
candidate at 72h and IS at 24h; a 80h-old lead is a candidate at 72h; fallback to 72 when wait_hours is 0.
Same rules: no docker, no sends, no push, no crontab. Full suite green, vite build green, evidence in
`defects/finish-plan-evidence/N4.md`, commit `finish(N4): follow-up due cutoff from wait_hours (72h)`,
print `READY <sha>`.

## N5 — Catch-up pacing + honest ledger (added 2026-09-29 14:20 CT by Major; BLOCKING the live catch-up, ~30 min)
Observed live (Ford tranche 1, --limit 10): 5 sent, 4 blocked by CommGate `rate-cap-exceeded` ("sms per-minute
cap reached (5/5)"), 1 failed ("terminated"). All 10 got an `automation_runs` row (sent/skipped/failed) and
`hasAutomationRun` matches ANY row, so the 5 unsent people are now treated as "already followed up".
Fix, smallest coherent change:
1. `scripts/catchup-followup.ts` send loop: pace sends to stay under the profile per-minute SMS cap (read
   the cap the gate uses; default 5) — send at most (cap - 1) per rolling 60s, sleeping between sends; print
   `pacing: <n>/min`. Add `--per-minute <n>` to override downward only.
2. A send that ends `blocked` with gate_rule `rate-cap-exceeded`, or `failed`, must NOT leave a ledger row that
   blocks a retry: either do not write the row for those outcomes, or make the catch-up dedup
   (`hasRun` in `gatherFollowupCandidates`) count only rows whose status is `sent`. Do not change behaviour for
   other callers of `hasAutomationRun` unless they have the same bug — if they do, note it in followups, do not fix.
   Blocks for real reasons (opt-out, DNC, consent, invalid number) stay final and stay counted.
3. On `failed`, retry that recipient ONCE after 20s before giving up; report `retried`.
4. End-of-run summary prints sent / blocked-by-reason / failed / retried and the remaining candidate count.
Tests for 1-3 with injected sender + clock. Same rules: no docker, no sends, no push, no crontab, no DB writes.
Full suite + vite build green, evidence `defects/finish-plan-evidence/N5.md`, commit
`finish(N5): catch-up pacing + retryable ledger`, print `READY <sha>`.
