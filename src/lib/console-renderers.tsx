/**
 * Customer-console renderer registry.
 *
 * The plugin manifest (plugin.yaml in ~/.hermes/studio-plugins/customer-console)
 * declares `renderer` keys per route + per right-pane slot. This file maps each
 * key to a built-in React component. Adding a new renderer key here is a fork
 * change; adding a new plugin that USES an existing key is configuration only.
 *
 * Phase 7 ships stubs that render placeholder content + display the resolved
 * profile, config, and params. Phase 7 v2 will replace each stub with real
 * functionality (chat against the profile's primary agent, dashboard grid
 * driven by web-artifact skill, widget CRUD writing to knowledge/widgets/,
 * service kanban filtered to service-* lanes, etc.).
 */

import type { StudioConfig } from './studio-config'

export type ConsoleRendererProps = {
  profile: string
  config: StudioConfig
  params: Record<string, string>
}

export type ConsoleRenderer = (props: ConsoleRendererProps) => JSX.Element

function StubFrame({
  title,
  children,
}: {
  title: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/5 p-6">
      <div className="text-sm font-medium opacity-70">{title}</div>
      <div className="text-xs opacity-50">
        Renderer stub. Replaced by Phase 7 v2 implementation.
      </div>
      {children && <div className="mt-2">{children}</div>}
    </div>
  )
}

function ChatRenderer(props: ConsoleRendererProps) {
  return (
    <StubFrame title={`customer-console.chat · ${props.profile}`}>
      <div className="text-xs opacity-70">
        Will open a Studio session against the profile's primary agent.
        Persona: <span className="font-medium">{props.config.branding.persona_name}</span>
      </div>
    </StubFrame>
  )
}

function DashboardGridRenderer(props: ConsoleRendererProps) {
  const dashboards = props.config.dashboards
  return (
    <StubFrame title={`customer-console.dashboard-grid · ${props.profile}`}>
      <div className="text-xs opacity-70">
        Will render artifacts from web-artifact / live-web-artifact skills.
      </div>
      {dashboards.length === 0 ? (
        <div className="mt-2 text-xs opacity-50">
          No dashboards declared in studio.yaml for this profile.
        </div>
      ) : (
        <ul className="mt-2 flex flex-col gap-1 text-xs">
          {dashboards.map((d) => (
            <li
              key={d.slug}
              className="flex items-baseline justify-between gap-2 border-b border-white/10 pb-1"
            >
              <span className="font-medium">{d.title ?? d.slug}</span>
              <span className="opacity-60">{d.artifact_path}</span>
            </li>
          ))}
        </ul>
      )}
    </StubFrame>
  )
}

function WidgetEditorRenderer(props: ConsoleRendererProps) {
  const widgets = props.config.widgets
  return (
    <StubFrame title={`customer-console.widget-editor · ${props.profile}`}>
      <div className="text-xs opacity-70">
        CRUD over ~/.hermes/profiles/{props.profile}/knowledge/widgets/*.md.
      </div>
      {widgets.length === 0 ? (
        <div className="mt-2 text-xs opacity-50">
          No widgets declared in studio.yaml for this profile.
        </div>
      ) : (
        <ul className="mt-2 flex flex-col gap-1 text-xs">
          {widgets.map((w) => (
            <li
              key={w.slug}
              className="flex items-baseline justify-between gap-2 border-b border-white/10 pb-1"
            >
              <span className="font-medium">{w.slug}</span>
              <span className="opacity-60">
                {w.mode} · agent: {w.agent}
              </span>
            </li>
          ))}
        </ul>
      )}
    </StubFrame>
  )
}

function ServiceKanbanRenderer(props: ConsoleRendererProps) {
  return (
    <StubFrame title={`customer-console.service-kanban · ${props.profile}`}>
      <div className="text-xs opacity-70">
        Will render a Kanban filtered to service-* lanes for this profile.
      </div>
    </StubFrame>
  )
}

function WidgetPublicRenderer(props: ConsoleRendererProps) {
  return (
    <StubFrame
      title={`customer-console.widget-public · ${props.params.slug ?? '?'}`}
    >
      <div className="text-xs opacity-70">
        Public widget. Resolves slug to a frontmatter-described mode (chat /
        voice / video / form).
      </div>
    </StubFrame>
  )
}

function AssistantPaneRenderer(props: ConsoleRendererProps) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/10 p-3 text-xs">
      <div className="mb-1 font-medium">
        {props.config.branding.persona_name}
      </div>
      <div className="opacity-60">
        Right-pane assistant slot. Wires to the profile's primary agent.
      </div>
    </div>
  )
}

export const consoleRenderers: Record<string, ConsoleRenderer> = {
  'customer-console.chat': ChatRenderer,
  'customer-console.dashboard-grid': DashboardGridRenderer,
  'customer-console.widget-editor': WidgetEditorRenderer,
  'customer-console.service-kanban': ServiceKanbanRenderer,
  'customer-console.widget-public': WidgetPublicRenderer,
  'customer-console.assistant-pane': AssistantPaneRenderer,
}

export function getRenderer(key: string): ConsoleRenderer | null {
  return consoleRenderers[key] ?? null
}

export function listRendererKeys(): Array<string> {
  return Object.keys(consoleRenderers)
}
