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

### D-V0-008 — Auth-required pages are SSR-served to anonymous visitors

- **Phase:** post-V9 operator review
- **Severity:** **important — operator-visible bug**, not classified blocker only because the API data is gated, but the chrome leak is wrong and the operator surfaced it specifically
- **Discovered:** 2026-05-29 (operator: "it just took me to an internal page with all the regular back d links with no password protection")
- **Description:** `GET /engagements/$customer` (and likely all other auth-required UI routes) returns the full SSR HTML shell — sidebar, page title, layout — to any anonymous visitor. The LoginScreen is rendered ONLY client-side by workspace-shell.tsx after `useAuth` resolves. So:
  - Anonymous visitor briefly sees the sidebar + page title before the JS loads and the LoginScreen overlay mounts.
  - A visitor who disables JavaScript sees the full chrome without ever being prompted to log in.
  - The API data is correctly 401-gated (verified via curl) so no engagement state leaks, but the LAYOUT and ROUTE LIST do leak.
  - The login overlay we tested in V0.3 only appeared because the page mounted JS, called /api/auth-session, and the workspace-shell guard kicked in. The server itself was happy to serve.
- **Smallest portable fix:** Studio's TanStack Start handler should redirect to `/?next=<path>` (or return a 401 HTML page) for auth-required paths when `/api/auth-session.authenticated` is false. The cleanest place is `src/server/auth-middleware.ts` — extend the request guard to also catch UI route SSR. Alternative: add a `beforeLoad` to the relevant Routes that throws `redirect('/')` when the auth-session check fails. Apply to: `/engagements`, `/engagements/$customer`, `/console/$profile/*`, and the other admin routes (the upstream Hermes Studio routes have the same gap by design — they assume client-side auth — but the fork should improve on that for our admin surfaces).
- **Status:** FIXING — see follow-up PR.

### D-V0-009 — Public widget at /w/$slug is a non-functional static card

- **Phase:** V9.3 (operator review)
- **Severity:** **important — failed user expectation on what V9.3 actually delivers**
- **Discovered:** 2026-05-29 (operator: "should show a page with test entry for each type of widget, or a landing page that has the universal widget on it")
- **Description:** The current `/w/cedar-ridge-hero` page renders Cedar Ridge brand colors, the greeting, and a "Start chat" button. The button is `<button onclick="alert(...)">` — a stub. There is no chat input, no streaming response, no actual routing to the declared agent (`cedarridge-consultative-primary` from the frontmatter). I declared V9.3 PASSING based on the thin criterion "loads anonymously" — which is true but misses the actual operator intent: a public visitor should be able to INTERACT with the widget per its declared mode (chat / voice / video / form) and have that route to the agent named in the frontmatter. Per Nexxus precedent (operator's intake), customers expect a real conversational entry point.
- **Operator's two suggested interpretations (both legitimate):**
  - (a) `/w/` (no slug) should list all widgets across all profiles with a test entry for each declared mode. Useful for QA / operator preview.
  - (b) `/w/$slug` should be a working customer-facing landing page with the actual widget wired to the agent.
- **Smallest portable fix:**
  1. Add `/w/` index route listing every widget found across `~/.hermes/profiles/*/knowledge/widgets/*.md` — slug, profile, mode, agent. This becomes a test/preview surface.
  2. For `/w/$slug` chat mode (the only mode declared today): replace the static card with a chat shell that POSTS visitor messages to a NEW public endpoint `/api/public/widget-chat` which scopes the chat session to the widget's declared agent + profile and streams responses. No auth required (per `auth: public` in manifest); session is anonymized + rate-limited.
  3. Voice / video / form modes — stub for now, mark as future via wiki workflow page references. Declare which Nexxus equivalent each maps to.
- **Status:** FIXING — see follow-up PR.

### D-V0-005 — Hermes gateway reports "portable" mode with missing APIs

- **Phase:** V0.3
- **Severity:** defer (no V-phase needs the missing surfaces yet)
- **Discovered:** 2026-05-29
- **Description:** Studio startup log: `[gateway] http://hermes-agent:8642 mode=portable core=[health, chatCompletions, models, streaming] enhanced=[jobs] missing=[sessions, enhancedChat, skills, memory, config]`. Hermes recommends `pip install -e .` to upgrade. Studio's own `/api/sessions` (local) works fine because Studio falls back to a local session store. The gateway's `enhancedChat`, `skills`, `memory`, `config` endpoints are not available — anything that consults Hermes natively for these falls back to local or fails.
- **Smallest portable fix:** in the hermes-agent container Dockerfile, ensure `hermes` is installed from the pinned upstream commit (current docker/agent/Dockerfile pulls a specific SHA). Verify the SHA includes the enhanced API surface, or bump it.
- **Status:** RECORDED — defer until a V-phase actually needs `enhancedChat` / `skills` / `memory` natively. V4 (consultative agent dispatch) uses Studio's local sessions API; not gated by this.
