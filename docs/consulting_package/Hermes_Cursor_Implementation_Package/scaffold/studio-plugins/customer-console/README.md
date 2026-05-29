# customer-console plugin

The customer-facing operating surface for Huminic Studio profiles.

## What it provides

Four profile-scoped routes plus two public widget routes:

| Path | Purpose | Auth |
|------|---------|------|
| `/console/$profile/chat` | Profile chat against the org's primary agent | required |
| `/console/$profile/dashboard` | Grid of user-built artifacts from `web-artifact` / `live-web-artifact` skills | required |
| `/console/$profile/widget` | CRUD over the profile's customer-facing widgets | required |
| `/console/$profile/service` | Kanban filtered to `service-*` lanes | required |
| `/w/$slug` | Public widget landing page | public |
| `/p/$slug` | Public widget landing page (alias) | public |

Plus one right-pane slot:

| Slot | Where | Purpose |
|------|-------|---------|
| `console-assistant` | All four profile routes | Right-side assistant pane bound to the profile's primary agent |

## Per-profile configuration

Each profile under `~/.hermes/profiles/<profile>/` provides a `studio.yaml`. The schema is defined in this plugin's `plugin.yaml` under `studio_config_schema`. Minimal example:

```yaml
branding:
  persona_name: Automa
```

Full example with dashboards and widgets:

```yaml
branding:
  logo_path: branding/huminic-logo.svg
  accent_color: "#1e40af"
  persona_name: Automa
menu:
  service: false
dashboards:
  - slug: sales-overview
    title: Sales Overview
    artifact_path: knowledge/dashboards/sales-overview.md
widgets:
  - slug: huminic-hero
    mode: chat
    agent: huminic-lead-response
federation:
  read_scopes: []
```

## Installation

The Phase 1 bootstrap (`scripts/bootstrap_local_hermes_scaffold.sh`) copies this directory to `~/.hermes/studio-plugins/customer-console/`. The Studio plugin loader (`src/lib/plugin-loader.ts`) discovers it at boot and validates each profile's `studio.yaml` against this plugin's `studio_config_schema`.

## Renderer contract

The `renderer:` keys in `plugin.yaml` reference entries in the fork's renderer registry (`src/lib/console-renderers.ts`, added in Phase 5). This plugin selects renderers; it does not ship them. The TSX stubs under `renderers/` document each renderer's contract for human reference and are NOT loaded at runtime.

## Dependencies

- **Skills** the plugin expects on the operating profile: `web-artifact`, `live-web-artifact`. Loader warns (does not fail) if absent on a given profile.
- **MCP servers**: none mandated by the plugin itself. Profile-specific MCP wiring (Vapi, Tavus, VinSolutions) is declared in the profile's `mcp.json`.
