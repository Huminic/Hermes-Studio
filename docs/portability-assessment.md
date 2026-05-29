# Huminic Studio Portability Assessment (V1.3)

Companion to `docs/feature-map.md`. Each fork-edited surface is rated:

- **Portable today** — moving to Layer B (plugin/skill/profile/wiki) requires no platform extension.
- **Portable with small extension** — needs a small new extension point (e.g., plugin loader registers a sidebar entry), then becomes portable.
- **Platform-bound** — would require fundamental changes to Studio's routing or shell architecture; stay in fork.

| Surface | Today | Why | Suggested smallest portable path |
|---------|-------|-----|---------------------------------|
| `/console/$profile/*` route shell | platform-bound | TanStack file-based routing requires `src/routes/*.tsx` files; the plugin manifest declares routes but the loader can't dynamically register file-based routes | Keep shell in fork. Plugin contributes renderers and config schema. Already optimal. |
| `customer-console.*` renderers (chat, dashboard-grid, widget-editor, service-kanban, widget-public, assistant-pane) | portable with small extension | All 6 currently live in `src/lib/console-renderers.tsx` as stubs; plugin manifest declares them but registry is in fork | Add a `renderers/` source path to the plugin manifest. Loader imports the renderer modules from the plugin directory at bootstrap. Renderers become Layer B. Phase 5 v2 work. |
| `/w/$slug`, `/p/$slug` public widget routes | platform-bound | TanStack needs route files; can't be plugin-only | Add `src/routes/w.$slug.tsx` + `src/routes/p.$slug.tsx` shells in fork that delegate to the plugin-declared `customer-console.widget-public` renderer. Phase 5 v2. |
| Hosted bundles `/customer-console/embed.js` + `.css` | portable with small extension | Manifest declares them; no fork serving | Add a Vite multi-build config keyed off the plugin's `hosted_bundles[]`, plus a `server-entry.js` handler that maps the path to the built asset with manifest-declared CORS/Cache-Control. Phase 5 v2. |
| `/engagements` overview + `/engagements/$customer` detail | portable with small extension | Engagement state is per-customer YAML; rendering is fork-specific | Move to a `consultative-engagements` plugin. Same loader pattern as customer-console. Defer — fork is fine until other plugins want similar tracker surfaces. |
| Sidebar nav entry for `/engagements` | portable with small extension | `src/screens/chat/components/chat-sidebar.tsx` hardcodes the entry | Add a plugin manifest field `sidebar_items[]`. Loader contributes entries at render time. Defer — only 1 fork-added entry today. |
| `/api/engagements`, `/api/plugins`, `/api/studio-config`, `/api/auth-session` | platform-bound | TanStack server handlers live in `src/routes/api/` | Keep in fork. These are platform infrastructure, not customer-specific. Correct location. |
| Auth (password-hash, profile-auth, auth-middleware, scripts/create-user.ts) | platform-bound | Auth is platform identity, not customer config | Correct location. Keep in fork. |
| `/widgets` + `/artifacts` (pre-existing fork) | portable with small extension | Huminic-specific reporting surfaces | Could move to a `huminic-reporting` plugin if Huminic ever wants to publish a customer console without these. Defer. |

## Verdict

No fork-edited surface is in the WRONG place today. The fork only contains:

1. Route shells that TanStack's file-based router needs in fork (can't be plugin)
2. Platform infrastructure (auth, API surfaces, engagement tracker) that belongs in fork
3. Renderer stubs that should be moved to the plugin in Phase 5 v2 (the suggested smallest portable path)
4. Sidebar nav entries that could move to a plugin extension point if the count grows

## Action items folded into the plan

| Item | Phase | Owner |
|------|-------|-------|
| Move 6 console renderers into the plugin directory | Phase 5 v2 | plan |
| Add `/w/$slug` + `/p/$slug` route shells | Phase 5 v2 | plan |
| Hosted-bundle Vite build + server handler | Phase 5 v2 | plan |
| Plugin manifest `sidebar_items[]` field (when 2+ plugins need it) | deferred | plan |
| Consultative-engagements plugin extraction | deferred | plan |
