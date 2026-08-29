# Codex cockpit verification

## Scope and boundaries

- Role: independent verifier; Claude owns implementation.
- Target: isolated instance `127.0.0.1:3730` using `/srv/ingest-dev/analytics`.
- Governed Sales profiles: `serra-honda`, `serra-nissan`, `tony-serra-ford`.
- No deployment, merge, production mutation, live email/text, or live notification send.
- Notification dispatch must remain disabled during verification.

## Phase 0 — initial render gate

- Checked: 2026-08-29 EDT.
- HTTP: `/stores` returned 200.
- Visible result: `/stores` and `/p/serra-honda/dashboard` remained on `Loading…`.
- Browser error: `Failed to fetch dynamically imported module: http://localhost:3730/assets/main-BrdGDzTO.js`.
- Read-only cause check: served HTML referenced `main-BrdGDzTO.js`; current build contained `dist/client/assets/main-B3vRBS55.js`.
- Verdict: **FAIL — stale server asset reference; full tab acceptance cannot begin until the isolated instance is restarted/repaired.**
- Owner: Claude in `huminic-studio` tmux.
- Next action: repair/restart only the isolated `:3730` instance, then Codex repeats Phase 0.
- Screenshot: `phase0-honda-loading-dynamic-import-failure.png`.

### Phase 0 re-test

- Claude rebuilt and restarted only the loopback `:3730` listener.
- Re-test: the current JavaScript bundle loaded and all required direct routes rendered for all three governed stores.
- Automated verifier suites: 83/83 cockpit/watchdog tests and 68/68 Halo grounding/report-card tests passed.
- Phase 0 render gate: **PASS after isolated restart**.

## Route-level results

- All eight required surfaces rendered by direct route for Honda, Nissan, and Tony Serra Ford: Landing, AI Activity, Pipeline, Leads, Sales, Marketing, Issues, Notifications.
- Marketing is functional by direct `/campaigns` route but is disabled in each store's sidebar. This is an accessibility/navigation defect, not a missing renderer.
- Pipeline and Leads use explicit unavailable/supplemental-data messages where KPI/lead-source deliveries do not exist; they do not fabricate report-derived zero.
- Ford Sales correctly withholds dealership performance and appointments because no accepted delivery exists.

## Aggregate data reconciliation

- Honda Sales matches accepted `dealership_performance` TOTAL row: 96 leads, 18 appointments set, 12 shown, 31 visits, 3 visits sold, 5 sold, $3,184.50 front gross, $9,056.28 back gross, $12,240.78 total gross, $2,448.16 average total gross.
- Honda Appointments matches its 18 accepted rows: 12 completed, 6 confirmed, 12 shown, 4 no-show, 2 cancelled, 4 rescheduled.
- Nissan Sales matches accepted `dealership_performance` TOTAL row: 55 leads, 10 appointments set, 4 shown, 13 visits, 5 visits sold, 9 sold, -$1,300.85 front gross, $6,564.45 back gross, $5,263.60 total gross, $584.84 average total gross.
- Response Times match each store's accepted readback exactly. Provenance states `minutes (excel-day * 1440)`, target categories are categorical, and coverage reconciles.

## No-send watchdog evidence

- 83/83 focused cockpit/watchdog tests passed, including alert generation, notification persistence, dispatch guards, self-test cleanup, and missing-data semantics.
- Existing isolated Honda artifact `notifications/inert/1b458e4a019b30a2.json` records `dispatch: disabled` and says no send path was invoked.
- The isolated `:3730` process has no outbound, scheduler-tick, watcher, or notification-dispatch enable flag set.
- No notification, email, text, routing rule, alert, or other external action was created or sent by Codex.

## Browser defects and corrections

1. Marketing was disabled in the sidebar for all three stores although the direct route worked. **Fixed and independently verified** in `6f50c6688d18bc1e08c579f149803fbf88f046ca`.
2. The mobile Landing Power Pack status text/grid overflowed at 390px (`honda-landing-mobile.png`). The first correction contained it but caused text/status overlap (`ford-mobile-power-packs-first-corrective-overlap.png`). The final correction stacks status on its own line. **Fixed and independently verified** (`ford-mobile-power-packs-accepted.png`).

The apparent desktop clipping in the first full-page capture and the blank full-page mobile Sales capture were screenshot artifacts from the fixed shell, not reproducible product defects. A normal 1280px viewport capture (`ford-landing-desktop-viewport.png`) is fully contained, and the Sales DOM/render is present at 390px. They are not acceptance blockers.

Claude owned the corrections; Codex independently re-tested the rebuilt isolated instance.

### First corrective re-test

- Marketing navigation: **PASS** — enabled links with the correct per-store `/campaigns` route for Honda, Nissan, and Ford.
- 390px Power Pack geometry: contained within the viewport.
- 390px Power Pack readability after first correction: **FAIL** — long status labels overlapped names/descriptions (`ford-mobile-power-packs-first-corrective-overlap.png`).

### Final corrective re-test

- Fixed commit: `6f50c6688d18bc1e08c579f149803fbf88f046ca`.
- Independent tests: 14/14 Marketing-nav/Power-Pack regressions passed; earlier 83/83 cockpit/watchdog and 68/68 Halo grounding suites also passed.
- Live Ford 390px check: 15 rows; document width 379 within viewport 390; zero rendered text/status intersections.
- Visual: status is readable on its own line beneath each name/description (`ford-mobile-power-packs-accepted.png`).
- Shared navigation: Marketing enabled with the correct profile-scoped route for all three governed stores.
- Final responsive/navigation gate: **PASS**.

## Per-store acceptance

| Store | Landing | AI Activity | Pipeline | Leads | Sales | Marketing | Issues | Notifications | Responsive | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| Serra Honda | pass | pass | pass/unavailable | pass/unavailable | data pass | pass | pass | pass/no-send evidence | pass/shared fix | **ACCEPT** |
| Serra Nissan | pass | pass | pass/unavailable | pass/unavailable | data pass | pass | pass | pass/no-send guard | pass/shared fix | **ACCEPT** |
| Tony Serra Ford | pass | pass | pass/unavailable | pass/unavailable | correct withheld state | pass | pass | pass/no-send guard | pass/live 390px | **ACCEPT** |
