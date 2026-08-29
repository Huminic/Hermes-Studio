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

## Per-store acceptance

| Store | Landing | AI Activity | Pipeline | Leads | Sales | Marketing | Issues | Notifications | Responsive | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| Serra Honda | blocked by Phase 0 | — | — | — | — | — | — | — | — | pending |
| Serra Nissan | blocked by Phase 0 | — | — | — | — | — | — | — | — | pending |
| Tony Serra Ford | blocked by Phase 0 | — | — | — | — | — | — | — | — | pending |

