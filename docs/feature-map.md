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

These are part of the customer-console plugin's manifest at `~/.hermes/studio-plugins/customer-console/plugin.yaml` (v0.2.0 as of Phase C.0). The plugin now declares the 6-page IA per operator-locked decision 2026-05-29. Fork has the route shells for all 6 page routes + the public widget route; renderers are stubs that read from per-profile `studio.yaml` so navigation differs per profile.

| Manifest declaration | Fork status | Gap (resolved in phase) |
|---------------------|-------------|-----|
| `/console/$profile/chat` (renderer customer-console.chat) | route registered, stub renders agent_picker config | C.2 — Studio session against picked agent's SOUL + channel persona |
| `/console/$profile/knowledge` (renderer customer-console.knowledge) | route registered, stub shows profile-scoped knowledge path | C.3 — Monaco editor + frontmatter panel + KSG-gated Promote flow |
| `/console/$profile/tools` (renderer customer-console.tools) | route registered, hosts Widget sub-page nav (customer-console.tools-widget) | C.4 — widget embed code, live demo iframe, customer-admin editable widget config |
| `/console/$profile/data` (renderer customer-console.data) | route registered, stub shows federation read_scopes | C.10 — Metabase React SDK + per-profile DuckDB + signed-JWT scoping |
| `/console/$profile/comms` (renderer customer-console.comms) | route registered, stub hosts Sales/Service segment switcher | C.7 — threaded unified inbox over messaging-hub channels |
| `/console/$profile/campaigns` (renderer customer-console.campaigns) | route registered, stub shows Service-only sub-page | C.8 — Service Recall / Service Due / Follow-up Lead templates + scheduled-send |
| `/w/$slug` (renderer customer-console.widget-public, auth: public) | route exists at `src/routes/w.$slug.tsx`; chat mode production-working via `/api/public/widget-chat`; voice/video/form modes are stubs | C.4 — voice (Vapi), video (Tavus), form (inbound-to-Comms) modes |
| Right-pane slot `console-assistant` → `customer-console.assistant-pane` | mounted in console parent layout on all 6 tab routes | C.2 — wraps `/api/sessions` against profile primary agent |
| Hosted bundle `/customer-console/embed.js` (cors *, cache 5min) | **NOT served** | C.4 — needs Vite multi-build config + server handler |
| Hosted bundle `/customer-console/embed.css` | **NOT served** | same as above |

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
