# Huminic Studio Plugin Manifest Spec

**Version:** 0.2.0
**Status:** Phase-C active. Multi-plugin coexistence added.
**Owner:** platform-architect

**Changelog:**
- 0.2.0 (2026-05-29) — Phase C.0 AC.0.7: multi-plugin coexistence rules; renderer-key namespacing convention; route disjointness validation. Customer-console plugin manifest moves to v0.2.0 with the 6-page IA (Chat/Knowledge/Tools/Data/Comms/Campaigns).
- 0.1.0 (2026-05-28) — Phase 0 initial draft. Single customer-console plugin with 4-page IA.

This document defines `plugin.yaml`, the portable manifest for adding customer-facing surfaces to Huminic Studio without forking the repo. Plugins live under `~/.hermes/studio-plugins/<plugin-id>/` and are loaded at Studio boot by `src/lib/plugin-loader.ts`.

## Goals and non-goals

**Goals:**
- Customer-facing UI extensions land via this manifest, not by editing `src/routes/` directly.
- Plugins are portable: copying a plugin directory to a fresh Huminic Studio + Hermes install yields the same surfaces.
- Per-customer behavior (branding, dashboard set, widget set, menu visibility) is declared in per-profile `studio.yaml`, validated against the schema each plugin contributes.
- **Plugins MAY publish hosted JavaScript bundles** that run on third-party customer websites (e.g. an embeddable widget loaded via `<script src="…">`). These bundles are served from `/<plugin-id>/embed.js` (and similar paths) and built into the fork at compile time — they are not loaded INTO the fork at runtime.

**Non-goals:**
- Loading arbitrary JS code INTO the Studio runtime. Plugins do not ship JavaScript that the Studio process imports. In-app rendering is via the **renderer registry** (named keys → built-in fork components).
- Replacing the admin Studio UI. The admin layout (`/chat`, `/files`, `/tasks`, `/agents`, etc.) is not pluggable.
- Replacing Hermes skills. Skills extend agent capabilities; plugins extend the customer-facing UI. A plugin may declare skills it depends on.

## In-app rendering vs hosted bundles

Two distinct mechanisms — keep them straight:

| Concern | In-app rendering | Hosted bundle |
|---------|------------------|---------------|
| Where it runs | Inside the Studio SPA | On a customer's third-party website |
| How it's loaded | Renderer registry key resolved by plugin manifest | `<script src="https://studio.huminic.app/<plugin-id>/embed.js">` tag |
| Who calls it | Studio's TanStack Router | Customer's webpage at load time |
| Bundle source | The fork's `src/screens/console/*` components | The fork's `src/embed/<plugin-id>/*` bundled separately by Vite |
| Authentication | Required (Studio session) unless `auth: public` | Public; widget posts cross-origin to a session-scoped endpoint |
| Plugin ships JS? | No — selects renderer key | No — manifest declares which fork-built bundle to serve |

## Directory layout

```
~/.hermes/studio-plugins/
└── <plugin-id>/
    ├── plugin.yaml            # this manifest
    ├── README.md              # optional human description
    └── renderers/             # optional TSX stubs documenting the renderer contracts
        └── *.tsx              # reference-only; not loaded at runtime
```

The implementation package ships canonical plugins under `docs/consulting_package/Hermes_Cursor_Implementation_Package/scaffold/studio-plugins/`. Phase 1's bootstrap copies these to `~/.hermes/studio-plugins/` on the production volume.

## plugin.yaml schema

```yaml
# Identity
id: customer-console              # kebab-case, unique across plugins
version: 0.2.0                    # semver, plugin's own version
display_name: Customer Console    # human-readable
requires_studio_version: ">=1.20.0"   # semver range; loader rejects if mismatched

# Optional capabilities the plugin contributes

routes:
  - path: /console/$profile/chat
    renderer: customer-console.chat       # registry key; resolved by fork
    profile_scoped: true                  # path contains $profile param
    auth: required                        # required | public
  - path: /console/$profile/knowledge
    renderer: customer-console.knowledge
    profile_scoped: true
    auth: required
  - path: /console/$profile/tools
    renderer: customer-console.tools      # tools renderer hosts Widget sub-page
    profile_scoped: true
    auth: required
  - path: /console/$profile/data
    renderer: customer-console.data
    profile_scoped: true
    auth: required
  - path: /console/$profile/comms
    renderer: customer-console.comms      # comms renderer hosts Sales/Service segments
    profile_scoped: true
    auth: required
  - path: /console/$profile/campaigns
    renderer: customer-console.campaigns  # Service-only sub-page per operator decision
    profile_scoped: true
    auth: required
  - path: /w/$slug
    renderer: customer-console.widget-public
    profile_scoped: false                 # widget resolves profile from frontmatter
    auth: public                          # unauthenticated entrypoint

right_pane_slots:
  - slot_id: console-assistant
    renderer: customer-console.assistant-pane
    applies_to_routes:
      - /console/$profile/chat
      - /console/$profile/knowledge
      - /console/$profile/tools
      - /console/$profile/data
      - /console/$profile/comms
      - /console/$profile/campaigns

# Hosted JavaScript bundles served from this Studio for third-party embedding
# (e.g. a customer's website pastes <script src="https://studio.huminic.app/customer-console/embed.js"></script>).
# Each entry maps a public URL path to a Vite-built bundle. The bundle itself
# lives in the fork at src/embed/<plugin-id>/<entry>.ts and is built by a
# separate Vite config so it can run in a third-party origin.
hosted_bundles:
  - path: /customer-console/embed.js
    entry: src/embed/customer-console/widget-loader.ts
    cors: "*"                           # public widget embedding
    cache_control: "public, max-age=300"
  - path: /customer-console/embed.css
    entry: src/embed/customer-console/widget-loader.css
    cors: "*"
    cache_control: "public, max-age=300"

# Per-profile config schema (JSON Schema Draft 2020-12 subset)
studio_config_schema:
  $schema: "https://json-schema.org/draft/2020-12/schema"
  type: object
  properties:
    branding:
      type: object
      properties:
        logo_path: { type: string }
        accent_color: { type: string, pattern: "^#[0-9a-fA-F]{6}$" }
        persona_name: { type: string }
      required: [persona_name]
    menu:
      type: object
      properties:
        chat: { type: boolean, default: true }
        knowledge: { type: boolean, default: true }
        tools: { type: boolean, default: true }
        data: { type: boolean, default: true }
        comms: { type: boolean, default: true }
        campaigns: { type: boolean, default: true }
    agent_picker:
      type: object
      properties:
        visible_agents:
          type: array
          items: { type: string }
        default_agent: { type: string }
    tools_widget:
      type: object
      properties:
        show_embed_snippet: { type: boolean, default: true }
        show_live_demo: { type: boolean, default: true }
    widgets:
      type: array
      items:
        type: object
        properties:
          slug: { type: string }
          mode: { type: string, enum: [chat, voice, video, form] }
          agent: { type: string }
        required: [slug, mode, agent]
    autonomous_reply_defaults:
      type: object
      properties:
        enabled: { type: boolean, default: false }
        business_hours_only: { type: boolean, default: false }
        max_agent_turns: { type: integer, minimum: 0, default: 3 }
        channels:
          type: array
          items: { type: string, enum: [chat, email, sms, phone, video] }
    federation:
      type: object
      properties:
        read_scopes:
          type: array
          items: { type: string }   # e.g. ["serra:knowledge/reports/published"]
  required: [branding]

# Dependencies the plugin needs to function. Loader warns (does not fail) if absent.
skill_dependencies:
  - web-artifact
  - live-web-artifact

mcp_dependencies: []
```

## Field reference

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Unique plugin identifier. Must match the directory name. Kebab-case. |
| `version` | yes | Plugin version (semver). |
| `display_name` | yes | Human-readable name for Studio admin listings. |
| `requires_studio_version` | yes | Semver range. Loader rejects plugin if Studio version is out of range. |
| `routes[]` | no | Array of route entries. See below. |
| `right_pane_slots[]` | no | Array of right-pane slot contributions. See below. |
| `studio_config_schema` | no | JSON Schema for the per-profile `studio.yaml` keys this plugin owns. Each profile's `studio.yaml` is validated against the union of all enabled plugins' schemas. |
| `skill_dependencies[]` | no | Hermes skill IDs this plugin expects to be installed on the relevant profile. Loader warns if missing. |
| `mcp_dependencies[]` | no | MCP server names this plugin expects in the profile's `mcp.json`. Loader warns if missing. |

### Route entry

| Field | Required | Description |
|-------|----------|-------------|
| `path` | yes | URL pattern. `$profile`, `$slug`, `$sessionKey` are recognized TanStack params. |
| `renderer` | yes | Registry key. Resolved against the fork's renderer registry. Unknown keys cause the plugin to be rejected. |
| `profile_scoped` | yes | If true, the path must contain `$profile`. The loader extracts the profile and passes it to the renderer. |
| `auth` | yes | `required` (default Studio auth applies) or `public` (no auth — used for unauthenticated widget pages). |

### Right-pane slot entry

| Field | Required | Description |
|-------|----------|-------------|
| `slot_id` | yes | Unique within the plugin. Used by the layout shell to mount the slot. |
| `renderer` | yes | Registry key. Same resolution as route renderers. |
| `applies_to_routes[]` | yes | Routes where this slot mounts. Must reference routes declared by this plugin or another loaded plugin (or a built-in route). |

### Hosted bundle entry

| Field | Required | Description |
|-------|----------|-------------|
| `path` | yes | Public URL path. Must start with `/<plugin-id>/` so multiple plugins do not collide. Typically `embed.js` / `embed.css`. |
| `entry` | yes | Fork-relative source path to the entry file. Vite builds this as a standalone bundle for third-party embedding. |
| `cors` | yes | CORS `Access-Control-Allow-Origin` value. Use `"*"` for fully public widgets, or an allowlist for restricted embed. |
| `cache_control` | yes | HTTP `Cache-Control` header. Tune per bundle. |

The loader validates that the `entry` file exists in the fork. It does NOT execute the bundle; the bundle ships pre-built and is served as a static asset by the fork's server with the declared headers.

## Renderer registry contract

The fork holds a registry mapping renderer keys (strings) to React components. The registry is the authoritative list of what renderers exist; plugins **select** from it, they do not contribute to it.

```ts
// src/lib/console-renderers.tsx (customer-console-owned keys; Phase C.0)
export type ConsoleRendererProps = {
  profile: string             // resolved from path
  config: StudioConfig        // validated subset of studio.yaml
  params: Record<string, string>
}

export type ConsoleRenderer = (props: ConsoleRendererProps) => JSX.Element

export const consoleRenderers: Record<string, ConsoleRenderer> = {
  'customer-console.chat': ChatRenderer,
  'customer-console.knowledge': KnowledgeRenderer,
  'customer-console.tools': ToolsRenderer,
  'customer-console.tools-widget': ToolsWidgetRenderer,
  'customer-console.data': DataRenderer,
  'customer-console.comms': CommsRenderer,
  'customer-console.campaigns': CampaignsRenderer,
  'customer-console.widget-public': WidgetPublicRenderer,
  'customer-console.assistant-pane': AssistantPaneRenderer,
}
```

Adding a new renderer key is a fork change. Adding a new plugin is not. Each plugin owns its own registry file under `src/lib/` (customer-console, messaging-hub, data-canvas), and the loader is given the union of all registered keys.

## Per-profile `studio.yaml`

Each profile under `~/.hermes/profiles/<profile>/` may include a `studio.yaml`. The loader merges schemas from all loaded plugins and validates the file against the union. Example:

```yaml
# ~/.hermes/profiles/huminic/studio.yaml
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
  campaigns: false
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
autonomous_reply_defaults:
  enabled: false
  business_hours_only: false
  max_agent_turns: 3
  channels: []
federation:
  read_scopes: []
```

Profiles without a `studio.yaml` get the schema defaults. Required fields without defaults cause that plugin's routes to be unavailable for that profile (the route renders an "unconfigured" placeholder, not an error page).

## Loader lifecycle

1. **Discover.** `fs.readdir('~/.hermes/studio-plugins/')`. Each subdir with a `plugin.yaml` is a plugin candidate.
2. **Parse.** Load YAML, validate against the manifest schema (`zod`-based, defined in `src/lib/plugin-loader.ts`).
3. **Compatibility check.** Compare `requires_studio_version` to the fork's `package.json` version. Reject incompatible plugins.
4. **Renderer resolution.** For each `routes[].renderer` and `right_pane_slots[].renderer`, check the renderer key exists in `consoleRenderers`. Unknown keys = reject the plugin.
5. **Schema merge.** Combine each plugin's `studio_config_schema` into a single validation schema, keyed by plugin id.
6. **Register.** Hand the validated plugin set to the route-shell components (in `src/routes/console/`) and the right-pane mounter, both added in Phase 5.

Loader errors are logged to stderr with the plugin id and field path. They never crash Studio.

## Multi-plugin coexistence

Phase C introduces three plugins:

| Plugin | Owns |
|---|---|
| `customer-console` | Storefront SPA shell, 6-page IA renderers, `/p/$profile` (Phase C.1), `/w/$slug`, customer-admin login |
| `messaging-hub` | Backend messaging engine, channel adapters, Studio-side admin views, renderer keys consumed by customer-console's Comms + Campaigns pages |
| `data-canvas` | Federation-MCP query layer, per-profile DuckDB writer, Metabase React SDK embedding, renderer keys consumed by customer-console's Data page |

All three plugins live side-by-side under `~/.hermes/studio-plugins/`. The loader merges their manifests and validates the combined set.

### Renderer-key namespacing

Renderer keys are namespaced by plugin id. Convention: `<plugin-id>.<renderer-name>`. Examples:

- `customer-console.chat` — customer-console plugin owns this renderer
- `messaging-hub.thread-detail` — owned by messaging-hub
- `data-canvas.dashboard-frame` — owned by data-canvas

A plugin's manifest MAY reference renderer keys owned by another plugin (cross-plugin composition — e.g., customer-console's Comms page may mount a `messaging-hub.thread-detail` renderer). The loader does not enforce same-plugin ownership of renderer keys, but every referenced key must exist in the registry; unknown keys are rejected.

The loader emits a warning (not a rejection) if a renderer key does not contain `.` — keys are expected to be plugin-namespaced strings.

### Route disjointness

No two plugins may declare the same URL path in their `routes[]`. The loader collects all routes across plugins; duplicates cause both plugins to be rejected with a `route_collision` issue.

If a plugin needs to extend another plugin's route (add a right-pane slot to an existing page, for example), it does so via `right_pane_slots[].applies_to_routes[]` referencing the existing route path. The slot mounts alongside the existing renderer; no route is replaced.

### Hosted-bundle path namespacing

`hosted_bundles[].path` must start with `/<plugin-id>/` so two plugins cannot collide on `/embed.js`. This is enforced by the loader already (Phase 0).

### Studio config schema merge

Each plugin's `studio_config_schema` is keyed by its plugin id in the merged validation set. A per-profile `studio.yaml` is validated against the union — required fields from any plugin contribute to the union's required set, and that plugin's routes are unavailable for a profile that fails its piece of the schema (other plugins' routes are not affected).

### Loader pass ordering

1. **Parse + per-plugin validation** (existing — Phase 0).
2. **Renderer-key registry check** (existing — Phase 0).
3. **Cross-plugin pass** (new — AC.0.7): collect routes across plugins, detect collisions. Reject colliding plugins.
4. **Schema merge** (existing — Phase 0).
5. **Register** with the route-shell components.

## Versioning policy

- Manifest spec uses its own version (this document's frontmatter when added in 0.1.0).
- Breaking schema changes bump the spec major version. The loader supports the last two major versions.
- Plugin authors set `requires_studio_version` to a range they have tested against.

## Open questions (deferred)

- **Hot-reload during dev:** out of scope for Phase 0. Plugins are read once at Studio boot.
- **Plugin signing / trust:** out of scope. All plugins are operator-controlled in `~/.hermes/studio-plugins/`.
- **Renderer extension by plugin:** explicitly disallowed in 0.1.0. If a plugin needs a new renderer, the work is a fork PR that adds the renderer key, and the plugin then selects it.
