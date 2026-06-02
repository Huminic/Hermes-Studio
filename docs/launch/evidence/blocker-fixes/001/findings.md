# GAP-VER-001 — no admin UI for /plugins and /mcp-tokens — fix

## Verifier finding
Sidebar had no "Plugins" / "MCP Tokens" entries; direct nav to `/plugins` and
`/mcp-tokens` returned 404 — even though `GET /api/plugins` worked (3 plugins).

## Scope check
The backing APIs already exist: `GET /api/plugins` (plugin-bootstrap) and
`GET /api/mcp-tokens` (admin-gated, `src/server/mcp-tokens.ts`). Only the route
files + screens + sidebar entries were missing — not substantial. Built minimal
**read-only** views (issue/revoke stay API/CLI operations).

## Fix
- `src/routes/plugins.tsx` + `src/screens/plugins/plugins-screen.tsx` — lists
  loaded plugins from `GET /api/plugins` (id, version, route/slot/bundle counts,
  skill/mcp deps) + surfaces manifest issues.
- `src/routes/mcp-tokens.tsx` + `src/screens/mcp-tokens/mcp-tokens-screen.tsx` —
  table of the token registry from `GET /api/mcp-tokens` (label, fingerprint,
  profiles, tools, admin, created, expires, active/revoked). No secrets shown.
- `chat-sidebar.tsx` — "Plugins" (PuzzleIcon) + "MCP Tokens" (Settings01Icon)
  nav entries with active-state.
- `workspace-shell.tsx` — added `/plugins` + `/mcp-tokens` to
  PROTECTED_PATH_PREFIXES (admin-gated; benefits from the GAP-VER-002 fix so
  direct nav resolves) and to the page-title map.

## Verification (live headed pass, local build)
- Direct nav `/mcp-tokens` → `{is404:false, isLogin:false, hasMcpHeading:true,
  hasToken:true, title:"MCP Tokens — Hermes"}` — renders the registry table with
  a seeded `serra-honda-runtime` token. Screenshot: `blocker-fix-001-mcp-tokens.png`.
- Direct nav `/plugins` → `{is404:false, isLogin:false, hasPluginsHeading:true,
  title:"Plugins — Hermes"}`; sidebar now contains both `/plugins` and
  `/mcp-tokens` links. Screenshot: `blocker-fix-001-plugins.png`.
- routeTree.gen.ts registers `/plugins` + `/mcp-tokens`; vitest 530 pass;
  Playwright workflows 16/49/0.

## Production note
Reflects only after a Coolify redeploy (operator-only). Locally `/api/plugins`
is empty (no `~/.hermes/studio-plugins/`); in production it returns the 3
plugins the verifier saw. PROC-001 / PROC-013 are PENDING-COOLIFY-REDEPLOY.
