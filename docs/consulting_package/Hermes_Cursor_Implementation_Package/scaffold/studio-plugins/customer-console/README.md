# customer-console plugin

The customer-facing operating surface for Huminic Studio profiles. One of three Phase C plugins (`customer-console`, `messaging-hub`, `data-canvas`) per the locked 2026-05-29 plan.

## What it provides

Six profile-scoped routes plus one public widget route, per the operator-locked 6-page IA:

| Path | Purpose | Auth |
|------|---------|------|
| `/console/$profile/chat` | Agent picker + chat session against selected agent's SOUL + chat persona | required |
| `/console/$profile/knowledge` | Wiki edit with KSG-gated Promote flow (inbox → drafts → published) | required |
| `/console/$profile/tools` | Tools surface with Widget sub-page (embed code + live demo + config) | required |
| `/console/$profile/data` | Metabase React SDK dashboards over per-profile DuckDB | required |
| `/console/$profile/comms` | Unified inbox with Sales / Service segment switcher | required |
| `/console/$profile/campaigns` | Service campaigns (Service-only sub-page per operator decision) | required |
| `/w/$slug` | Public widget landing page (chat / voice / video / form per frontmatter) | public |

Plus one right-pane slot:

| Slot | Where | Purpose |
|------|-------|---------|
| `console-assistant` | All six profile routes | Right-side assistant pane bound to profile's primary agent |

## Per-profile configuration

Each profile under `~/.hermes/profiles/<profile>/` provides a `studio.yaml`. The schema is defined in this plugin's `plugin.yaml` under `studio_config_schema`. Minimal example:

```yaml
branding:
  persona_name: Automa
```

Full example with menu visibility, agent picker, widgets, autonomous reply, federation:

```yaml
branding:
  logo_path: branding/huminic-logo.svg
  accent_color: "#1e40af"
  persona_name: Automa
menu:
  chat: true
  knowledge: true
  tools: true
  data: true
  comms: true
  campaigns: false       # this profile does not enable Campaigns page
agent_picker:
  visible_agents:
    - caroline
    - lead-followup-agent
  default_agent: caroline
tools_widget:
  show_embed_snippet: true
  show_live_demo: true
widgets:
  - slug: huminic-hero
    mode: chat
    agent: huminic-lead-response
autonomous_reply_defaults:        # default rules referenced when an agent
  enabled: false                  # subscribes to a thread without explicit
  business_hours_only: false      # per-thread rules. Engine ships in AC.5.8.
  max_agent_turns: 3
  channels: []
federation:
  read_scopes: []
```

## Installation

The Phase 1 bootstrap (`scripts/bootstrap_local_hermes_scaffold.sh`) copies this directory to `~/.hermes/studio-plugins/customer-console/`. The Studio plugin loader (`src/lib/plugin-loader.ts`) discovers it at boot and validates each profile's `studio.yaml` against this plugin's `studio_config_schema`.

## Renderer contract

The `renderer:` keys in `plugin.yaml` reference entries in the fork's renderer registry (`src/lib/console-renderers.tsx`). This plugin selects renderers; it does not ship them. Renderer keys are plugin-namespaced (`customer-console.*`) per the multi-plugin coexistence rules in `docs/plugin-manifest-spec.md` v0.2.0. The TSX stubs under `renderers/` document each renderer's contract for human reference and are NOT loaded at runtime.

| Renderer key | Used by | Replaced in |
|---|---|---|
| `customer-console.chat` | `/console/$profile/chat` route | C.2 |
| `customer-console.knowledge` | `/console/$profile/knowledge` route | C.3 |
| `customer-console.tools` | `/console/$profile/tools` route; hosts Widget sub-page nav | C.4 |
| `customer-console.tools-widget` | Tools page Widget sub-page (no standalone route) | C.4 |
| `customer-console.data` | `/console/$profile/data` route | C.10 |
| `customer-console.comms` | `/console/$profile/comms` route; hosts Sales/Service segments | C.7 |
| `customer-console.campaigns` | `/console/$profile/campaigns` route; Service-only sub-page | C.8 |
| `customer-console.widget-public` | `/w/$slug` public route | chat mode production; C.4 ships voice/video/form |
| `customer-console.assistant-pane` | `console-assistant` right-pane slot | C.2 |

## Dependencies

- **Skills** the plugin expects on the operating profile: `web-artifact`, `live-web-artifact`. Loader warns (does not fail) if absent on a given profile.
- **MCP servers**: none mandated by the plugin itself. Profile-specific MCP wiring (Vapi, Tavus, VinSolutions, TextMagic, Resend) is declared in the profile's `mcp.json`. The messaging-hub plugin consumes those at runtime; customer-console renders the resulting UI.

## Companion plugins

- **messaging-hub** — backs the Comms + Campaigns pages with the unified messaging engine, channel adapters, and SSE stream. Owns `messaging-hub.*` renderer keys consumed by customer-console's Comms/Campaigns renderers in C.7/C.8.
- **data-canvas** — backs the Data page with federation-MCP + per-profile DuckDB + Metabase React SDK. Owns `data-canvas.*` renderer keys consumed by customer-console's Data renderer in C.10.
