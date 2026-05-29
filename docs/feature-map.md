# Huminic Studio Feature Map

Inventory of every user-facing surface in the Huminic Studio fork as of 2026-05-29, classified by source layer. Outputs of V1.1 audit (two parallel Explore subagents on UI routes + plugin layer).

**Layers:**
- **native** — inherited from upstream JPeetz/Hermes-Studio, untouched
- **fork** — added by this Huminic fork on top of upstream
- **plugin** — declared by a plugin manifest under `~/.hermes/studio-plugins/`
- **skill** — driven by a skill in `~/.hermes/skills/`

## UI routes

| Route | Layer | Purpose | Notes |
|-------|-------|---------|-------|
| `/` | native | Landing/splash, redirects to dashboard or chat | |
| `/chat` | native | Multi-turn conversation interface | Live SSE streaming |
| `/chat/$sessionKey` | native | Individual session | Redis-backed persistence |
| `/dashboard` | native | Orchestration hub | Real-time activity feeds |
| `/agents` | native | Agent library + custom agent editor | System-prompt editor, emoji, role labels |
| `/crews` | native | Multi-agent crew management | Builder, templates, cloning |
| `/crews/$crewId` | native | Crew detail (usage, workflow, audit) | |
| `/profiles` | native | Profile selector + manager | Per-profile file system roots |
| `/files` | native | File browser + editor | Profile-scoped |
| `/memory` | native | Knowledge graph + wiki-link browser | Force-directed graph |
| `/skills` | native | Skill marketplace | skillsmp.com integration |
| `/jobs` | native | Cron job scheduler | |
| `/tasks` | native | Kanban board | Five-column drag-and-drop |
| `/conductor` | native | Multi-agent mission orchestrator | Phase-based UI |
| `/operations` | native | All running agents across crews | Grid + outputs toggle |
| `/patterns` | native | Patterns + user corrections | MEMORY.md viewer |
| `/audit` | native | Tool-call + approval timeline | |
| `/analytics` | native | Event-store analytics | Volume + tool frequency |
| `/session-history` | native | Two-pane session archive | |
| `/logs` | native | Live `~/.hermes/logs/` viewer | |
| `/help`, `/docs` | native | In-app help + docs | |
| `/widgets` | fork | Widget library + editor | Pre-existing in fork (commit 6987fe8b9) |
| `/artifacts` | fork | Artifact gallery + reports | Pre-existing in fork (commit 6987fe8b9) |
| `/engagements` | fork | Customer engagement overview | New in 97546d6e5 (Phase 7) |
| `/engagements/$customer` | fork | Engagement detail (stages, gates, crew, notes) | New in 97546d6e5 (Phase 7) |
| `/console/$profile` | fork | Customer console shell (4-tab layout, right-pane slot) | New in 97546d6e5 (Phase 5 partial) — **plugin-driven candidate** |
| `/console/$profile/$tab` | fork | Tab dispatcher → renderer registry | New in 97546d6e5 — **plugin-driven candidate** |
| `/settings`, `/settings/identity`, `/settings/providers`, `/settings/mcp` | native + fork | Identity editor (fork) + provider/MCP config (native) | |
| `/terminal` | native | Web-based shell | |

**Total: 34 UI routes — 24 native, 10 fork.**

### Plugin-declared but not yet wired in fork

These are part of the customer-console plugin's manifest at `~/.hermes/studio-plugins/customer-console/plugin.yaml`. Fork has the route shells for 4 of 6 but does NOT yet have route handlers for the public widget routes nor hosted-bundle serving.

| Manifest declaration | Fork status | Gap |
|---------------------|-------------|-----|
| `/console/$profile/chat` (renderer customer-console.chat) | route registered, renderer is STUB | renderer needs to open Studio session against profile's primary agent |
| `/console/$profile/dashboard` (renderer customer-console.dashboard-grid) | route registered, renderer is STUB | renderer needs to embed `web-artifact`/`live-web-artifact` outputs from `knowledge/dashboards/` |
| `/console/$profile/widget` (renderer customer-console.widget-editor) | route registered, renderer is STUB | renderer needs CRUD over `knowledge/widgets/*.md` |
| `/console/$profile/service` (renderer customer-console.service-kanban) | route registered, renderer is STUB | renderer needs to reuse `/tasks` board with `service-*` lane filter |
| `/w/$slug` (renderer customer-console.widget-public, auth: public) | **route NOT registered** | needs `src/routes/w.$slug.tsx` route handler |
| `/p/$slug` (renderer customer-console.widget-public, auth: public) | **route NOT registered** | needs `src/routes/p.$slug.tsx` route handler |
| Right-pane slot `console-assistant` → `customer-console.assistant-pane` | mounted in console parent layout | renderer is STUB — needs to wrap `/api/sessions` against profile primary agent |
| Hosted bundle `/customer-console/embed.js` (cors *, cache 5min) | **NOT served** | needs Vite multi-build config + server handler |
| Hosted bundle `/customer-console/embed.css` | **NOT served** | needs same as above |

## API routes

| Group | Layer | Surface |
|-------|-------|---------|
| Auth + Session | native + fork | `POST /api/auth`, `GET /api/auth-check`, **`GET /api/auth-session` (fork, new)**, OAuth device-code flow |
| Agents | native + fork | CRUD `/api/agents`, **`POST /api/agent-migrations` (fork)** |
| Chat / Messaging | native + fork | `POST /api/send` (fork-modified for artifact routing), `POST /api/send-stream`, `GET /api/chat-events` |
| Sessions | native | CRUD `/api/sessions`, status / active-run / send |
| Crews | native | CRUD + dispatch + clone + usage + workflow + templates |
| Tasks | native | CRUD + move |
| Conductor / Operations | native | spawn, stop, list |
| Artifacts | **fork** | CRUD + send + public artifact share + download |
| Widgets | **fork** | CRUD + per-profile list + public embed-js + public widget-key + widget sessions |
| **Engagements** | **fork (new)** | `GET /api/engagements` |
| Memory + Knowledge | native + fork | Native `/api/memory/*`; fork `/api/knowledge/*` (federation-ready, profile-aware) |
| Skills | native | list, install, uninstall, hub-search, settings |
| Profiles | native | list, create, read, **activate (fork-hardened for admin-gate)**, rename, delete |
| **Studio Config + Plugins** | **fork (new)** | `GET /api/studio-config?profile=`, `GET /api/plugins` |
| Hermes Integration | native | config, jobs, runs, proxy |
| System + Health | native | ping, gateway/connection/system health, systemd control |
| Events + Audit | native | history, events, replay, audit |
| Terminal | native | stream, input, resize, close |
| MCP | native | servers, reload |
| Approvals | native | approve, deny |
| Workspace | native | metadata |

**Total: ~110 API routes — ~25 fork-touched.**

## Skills (Layer B)

Installed under `~/.hermes/skills/` per profile distribution.

| Skill | Source | Status |
|-------|--------|--------|
| `web-artifact` | upstream Hermes | required by customer-console plugin |
| `live-web-artifact` | upstream Hermes | required by customer-console plugin |
| `kanban-worker` | implementation package | wired into org profiles |
| `kanban-orchestrator-style` | implementation package | wired into consultative-agent |
| `mcp-federation` (stub) | this fork | design only — to be implemented Phase 6 |

## Profiles (Layer B)

`~/.hermes/profiles/` on production volume — 7 active:

| Profile | Role | Notes |
|---------|------|-------|
| `consultative-agent` | Method engine | SOUL enriched, wiki unpacked (70-entry artifact), HAND_OFF_OPERATOR_GUIDE present |
| `huminic` | Customer + self-test | live, engagement-state at `draft`, has auth.yaml for operator |
| `serra-automotive` | Customer (live CRM) | live, engagement-state at `draft`, gateway active |
| `strukture` | Customer (ClickUp pending) | live, engagement-state at `draft`, operator-owned first consultative run |
| `huminic-data-governor` | Unified KSG+DSG | watches huminic |
| `serra-automotive-data-governor` | Unified KSG+DSG | watches serra-automotive |
| `strukture-data-governor` | Unified KSG+DSG | watches strukture |

Cedar Ridge fixture (V5): `cedar-ridge-automotive` + `cedar-ridge-automotive-data-governor` — to be added.

## Plugins (Layer B)

`~/.hermes/studio-plugins/`:

| Plugin | Version | Routes | Slots | Bundles | Real renderers |
|--------|---------|--------|-------|---------|----------------|
| `customer-console` | 0.1.0 | 6 declared, 4 wired | 1 (console-assistant) | 2 declared, 0 served | 0 of 6 (all stubs) |

Hash-verified against scaffold source. No drift.

## Layer placement: where things live

- **Per-customer differences** → Layer B (profile config, wiki, MCP).
- **Customer-facing screen layout** → Layer C shell in fork + Layer B content. Shell is `/console/$profile/*`, content reads from `~/.hermes/profiles/<profile>/studio.yaml` + `knowledge/`.
- **Agent behavior / business workflow** → wiki page or skill in Layer B.
- **Requires Hermes core change** → STOP. Record as debt. Do not edit Layer A.
