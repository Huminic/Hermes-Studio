# Cedar Ridge Validation — Defect Register

Running list of issues discovered during V0–V10. Each entry records phase, severity, smallest portable fix, and status.

**Severity scale:**
- **blocker** — blocks a V-phase from passing
- **important** — degrades the workflow but a workaround exists
- **defer** — known gap, scheduled for later

## V0 — Pre-flight

### D-V0-001 — Login UI doesn't honor profile_auth_mode

- **Phase:** V0.3 (Playwright login verification)
- **Severity:** blocker — operator cannot exercise profile-synced auth via the UI
- **Discovered:** 2026-05-29
- **Description:** `src/components/auth/login-screen.tsx` renders a legacy single-password form ("Enter Password") with no username field. It never calls `/api/auth-session` to check `profile_auth_mode`. When profile auth is active (any profile has `auth.yaml`), the UI silently falls back to legacy-password shape. API-level login works (`POST /api/auth` with `{username, password}` returns 200), but the operator-facing surface is wrong.
- **Smallest portable fix:** extend `login-screen.tsx` to fetch `/api/auth-session` on mount; conditionally render the username field when `profile_auth_mode === true`; submit `{username, password}` in profile mode and `{password}` in legacy mode. No backend changes; no schema changes; one component file.
- **Status:** FIX-LANDING 2026-05-29

## V0.1 — Coolify env-var path

### D-V0-002 — central-mcp allowlist missing /envs paths for dockercompose apps

- **Phase:** V0.1
- **Severity:** important — workaround exists (direct curl with bearer token)
- **Discovered:** 2026-05-29
- **Description:** Coolify's dockercompose env-var endpoint is `PATCH /applications/{uuid}/envs/bulk`, not `/environment-variables/bulk`. `central-mcp/config/local.yaml` allowlist references the `/environment-variables` path. For dockercompose apps the canonical path returns 404. Required falling back to direct curl with the bearer token.
- **Smallest portable fix:** add `/applications/*/envs`, `/applications/*/envs/bulk`, `/applications/*/envs/*` (GET / POST / PATCH / DELETE) entries to the coolify allowlist in `~/Claude-store/central-mcp/config/local.yaml`. Restart central-mcp.
- **Status:** RECORDED — not blocking V-phases; will land when operator approves a central-mcp restart.
