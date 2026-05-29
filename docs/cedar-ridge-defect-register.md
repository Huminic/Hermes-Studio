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

### D-V0-003 — Studio production container runs Vite dev mode (`pnpm dev`)

- **Phase:** V0.3
- **Severity:** important (security + perf, not blocker)
- **Discovered:** 2026-05-29
- **Description:** `docker/workspace/Dockerfile` CMD is `pnpm dev --host 0.0.0.0 --port 3000`. The container has no `/app/dist`; it serves source files via Vite dev server in production. Implications: no minification, HMR exposed, full source viewable, source maps live, ~3x slower TTFB. The build pipeline (`pnpm build` → `server-entry.js`) exists locally and works but isn't what production runs.
- **Smallest portable fix:** flip `CMD` in `docker/workspace/Dockerfile` to `["node", "server-entry.js"]` and add a `RUN pnpm build` step before the final `CMD`. Verify the existing `server-entry.js` handles all routes including the fork-added ones.
- **Status:** RECORDED — not blocking V0; defer to a focused production-hardening PR. Captured here so the gap doesn't disappear into config drift.

### D-V0-004 — connection-startup-screen overlay blocks /engagements/$customer content

- **Phase:** V0.3
- **Severity:** important (renders the engagement-detail content unreachable in UI)
- **Discovered:** 2026-05-29
- **Description:** When loading `/engagements/$customer` the workspace-shell overlays a "Connecting to your backend... Welcome! Let's connect your backend" panel on top of the page content. `/api/connection-status` simultaneously returns `{ok:true, mode:"enhanced", backend:"http://hermes-agent:8642"}` — server-side check passes. The browser overlay is racing the gateway status check, OR uses a different signal than `/api/connection-status`, OR the engagement-detail route uses a route group that lacks an early-pass through the overlay. The /engagements list page does NOT show this overlay; only the $customer detail.
- **Smallest portable fix:** investigate the connection-startup-screen render condition in `src/components/workspace-shell.tsx` and `src/components/connection-startup-screen.tsx`. Likely an inverse condition or a stale `connectionState`. Fix the render guard so the overlay disappears once `/api/connection-status` returns `ok:true`.
- **Status:** RECORDED — not blocking V0 gating (the route does load; title updates; data fetch works behind the overlay). Will fix before V8 wiki-edit propagation test which needs the detail page.

### D-V0-006 — Plugin skill dependencies not validated against installed skills

- **Phase:** V9.1
- **Severity:** important
- **Discovered:** 2026-05-29
- **Description:** `customer-console` plugin manifest declares `skill_dependencies: [web-artifact, live-web-artifact]`. Neither skill is in the production Hermes install (30 skills installed, none matching). `GET /api/plugins` returns `issues: []` — the loader doesn't cross-check declared skill deps against the installed set.
- **Smallest portable fix:** in `src/server/plugin-bootstrap.ts` after `loadPlugins()`, fetch the live skill list (via `GET /api/skills`) and emit an issue for each declared `skill_dependencies[]` entry not present. Surface in `/api/plugins`. Don't fail the load — warn.
- **Status:** RECORDED — defer. Plugin loads and exposes routes; renderer stubs work without the skills. The skills become required when renderers leave stub state (Phase 5 v2).

### D-V0-007 — `/w/$slug` and `/p/$slug` route shells missing in fork

- **Phase:** V9.3
- **Severity:** blocker (for V9.3 specifically; V0 baseline unaffected)
- **Discovered:** 2026-05-29 (captured in `docs/feature-map.md` portability table)
- **Description:** The `customer-console` plugin manifest declares public widget routes at `/w/$slug` and `/p/$slug` mapped to renderer `customer-console.widget-public`. The fork has no `src/routes/w.$slug.tsx` or `src/routes/p.$slug.tsx`, so TanStack file-based routing never resolves the paths. Hitting them returns 404.
- **Smallest portable fix:** add the two route files; they consult the customer-console renderer registry and the widget frontmatter (slug, mode, agent) from `~/.hermes/profiles/<profile>/knowledge/widgets/`. Scan all profiles for a matching slug since the path doesn't carry profile context — this is per the public route semantics where customers reach a widget without knowing which profile hosts it.
- **Status:** FIXING — V9.3.

### D-V0-005 — Hermes gateway reports "portable" mode with missing APIs

- **Phase:** V0.3
- **Severity:** defer (no V-phase needs the missing surfaces yet)
- **Discovered:** 2026-05-29
- **Description:** Studio startup log: `[gateway] http://hermes-agent:8642 mode=portable core=[health, chatCompletions, models, streaming] enhanced=[jobs] missing=[sessions, enhancedChat, skills, memory, config]`. Hermes recommends `pip install -e .` to upgrade. Studio's own `/api/sessions` (local) works fine because Studio falls back to a local session store. The gateway's `enhancedChat`, `skills`, `memory`, `config` endpoints are not available — anything that consults Hermes natively for these falls back to local or fails.
- **Smallest portable fix:** in the hermes-agent container Dockerfile, ensure `hermes` is installed from the pinned upstream commit (current docker/agent/Dockerfile pulls a specific SHA). Verify the SHA includes the enhanced API surface, or bump it.
- **Status:** RECORDED — defer until a V-phase actually needs `enhancedChat` / `skills` / `memory` natively. V4 (consultative agent dispatch) uses Studio's local sessions API; not gated by this.
