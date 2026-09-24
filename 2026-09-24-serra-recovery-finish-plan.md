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
Progress: S0 DONE 2026-09-24 (4097cdcc4); N1 APPROVED 2026-09-24 ~01:20 CT at d6ffc352f (flags, preview runner, emailer; 1289 green); next = D1 deploy (needs Duane) → S4 artifacts → 08:00 CT report + Ford/Nissan catch-up. Reviews in defects/finish-plan-reviews/.

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
