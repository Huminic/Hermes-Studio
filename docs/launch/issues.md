# issues.md — Huminic Studio launch debt register

Append-only record of technical/process debt and known-minor items. Created
2026-06-02 during the live launch deploy. Launch-blocking defects found this
session were FIXED (see DECISIONS.log + VERIFICATION_REPORT.md); the items below
are non-blocking debt carried past launch.

## Console / cosmetic (non-blocking, post-launch)

- **GAP-CONSOLE-004** — `GET /api/terminal-resize` returns 404 (×2 on chat load).
  Impact: console noise; terminal resize signalling no-ops. Terminal otherwise
  loads. Severity: low. Follow-up: add the route or stop the client calling it.
- **GAP-CONSOLE-005** — Minified React error #418 (hydration text mismatch) on
  some pages. React recovers client-side; UI fully functional (login, chat,
  storefront verified working). Severity: low/cosmetic. Follow-up: reproduce with
  a dev build to find the mismatched node (likely a timestamp/auth-state render).
- **GAP-CONSOLE-006** — `GET /api/hermes-proxy/api/available-models` 404. The
  production gateway is a "portable" build that lacks `/api/available-models`. The
  chat model-picker now falls back to the same-origin `/api/models` (fixed
  GAP-LIVE-002), so the picker works; the 404 is caught but still logs. Severity:
  low. Follow-up: probe gateway capability before calling, or upgrade Hermes.

## Hermes gateway (operator action)

- **OP-GATEWAY-001** — The production hermes-agent gateway runs in `portable`
  mode and reports `missing=[sessions, enhancedChat, skills, memory, config]`
  ("Missing Hermes APIs detected. Update Hermes."). Core chat works (verified).
  Some Studio features that depend on the enhanced APIs are limited. Severity:
  medium. Follow-up: operator updates the Hermes agent image if those features
  are needed.

## Documented launch gaps (carried, per manuals)

- **GAP-LOGOUT-001** — No sign-out button anywhere; logout = clear cookies. Both
  admin and customer-admin. Follow-up: add a logout action.
- **GAP-CUSTOMER-INVITE-001** — One `auth.yaml` = one user per profile; no
  self-service invite. Operator provisions additional users via CLI.
- **GAP-FLOW-concurrent-edit-001** — KSG wiki save has no concurrent-edit
  detection (last-write-wins, silent). Launch convention: one writer per page.
  Follow-up: ETag/optimistic concurrency on the wiki save endpoint.
- **GAP-WIKI-AUDIT-001** — Customer wiki Save writes neither a `metadata_audit`
  row nor a git commit (the manuals were corrected to stop claiming both).
  Follow-up: add per-save audit + commit so the §9 recovery story is real.
- **OP-002** — Per-customer channel adapter credentials (TextMagic / Vapi / Tavus
  / Resend) are not provisioned, so outbound on those channels returns
  `unconfigured`. Chat + email-in work; SMS/voice/video/outbound need creds.
- **SRS-D3 / data-canvas** — The customer Data tab is dimmed (huminic ships
  `studio.yaml menu.data: false`); Metabase + per-profile DuckDB dashboards are
  the operator-owned post-launch data-engine runway, not built at launch.

## Process note

- The provisioning script `provision-launch-profiles.ts` does not recognise
  `--help` and proceeds with a real (idempotent, `force=false`) run. During
  verification an inadvertent `--help` invocation triggered a real run; confirmed
  via `--dry-run` it was a complete no-op (all 7 launch profiles already existed,
  every line "[skip]"). Follow-up (low): add `--help` handling that prints usage
  and exits without running.
