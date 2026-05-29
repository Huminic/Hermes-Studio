/**
 * Customer-console renderer registry — Phase C 6-page IA.
 *
 * The plugin manifest (plugin.yaml in ~/.hermes/studio-plugins/customer-console)
 * declares `renderer` keys per route + per right-pane slot. This file maps each
 * key to a built-in React component. Adding a new renderer key here is a fork
 * change; adding a new plugin that USES an existing key is configuration only.
 *
 * Renderer keys are namespaced per plugin to support multi-plugin coexistence
 * per AC.0.7. customer-console.* keys live here; messaging-hub.* and
 * data-canvas.* renderers will be added in their own registry files in later
 * phases.
 *
 * C.0 ships stubs. Each renderer reads from props.config so that visiting
 * /console/<profile-A> vs /console/<profile-B> renders distinguishable
 * content driven by per-profile studio.yaml.
 */

import { useState } from 'react'
import type { StudioConfig } from './studio-config'
import { CustomerChatRenderer } from '../components/customer-console/chat-renderer'
import { CustomerKnowledgeRenderer } from '../components/customer-console/knowledge-renderer'

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
        Renderer stub — Phase C.0. Real implementation lands in the named
        phase below.
      </div>
      {children && <div className="mt-2">{children}</div>}
    </div>
  )
}

function ChatRenderer(props: ConsoleRendererProps) {
  return <CustomerChatRenderer profile={props.profile} config={props.config} />
}

function KnowledgeRenderer(props: ConsoleRendererProps) {
  return (
    <CustomerKnowledgeRenderer
      profile={props.profile}
      config={props.config}
    />
  )
}

function ToolsRenderer(props: ConsoleRendererProps) {
  // Tools page hosts a sub-nav. C.4 ships the real sub-pages; for C.0 the
  // Widget sub-page is the only one declared. Future sub-pages (e.g. MCP
  // wiring panel, integration toggles) land here too.
  const [sub, setSub] = useState<'widget'>('widget')
  return (
    <div className="flex flex-col gap-3">
      <nav className="flex gap-2 text-xs">
        <button
          type="button"
          className={
            'rounded px-2 py-1 ' +
            (sub === 'widget'
              ? 'bg-emerald-500/20 font-semibold'
              : 'opacity-60 hover:opacity-100')
          }
          onClick={() => setSub('widget')}
        >
          Widget
        </button>
      </nav>
      {sub === 'widget' && (
        <ToolsWidgetRenderer
          profile={props.profile}
          config={props.config}
          params={props.params}
        />
      )}
    </div>
  )
}

function ToolsWidgetRenderer(props: ConsoleRendererProps) {
  const widgets = props.config.widgets
  const settings = props.config.tools_widget
  return (
    <StubFrame title={`customer-console.tools-widget · ${props.profile}`}>
      <div className="text-xs opacity-70">
        Phase C.4 — widget embed code, live demo (iframe of /w/$slug), and
        customer-admin editable widget config.
      </div>
      <div className="mt-2 text-xs opacity-60">
        Embed snippet: {settings.show_embed_snippet ? 'on' : 'off'} · Live demo:{' '}
        {settings.show_live_demo ? 'on' : 'off'}
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

function DataRenderer(props: ConsoleRendererProps) {
  const scopes = props.config.federation.read_scopes
  return (
    <StubFrame title={`customer-console.data · ${props.profile}`}>
      <div className="text-xs opacity-70">
        Phase C.10 — Metabase React SDK dashboards reading from a per-profile
        analytics.duckdb. Federation MCP (C.9) backs ad-hoc queries.
      </div>
      <div className="mt-2 text-xs opacity-60">
        Federation read scopes:{' '}
        {scopes.length === 0 ? '(none configured)' : scopes.join(', ')}
      </div>
    </StubFrame>
  )
}

function CommsRenderer(props: ConsoleRendererProps) {
  // Comms page hosts Sales/Service segment switcher. C.7 ships the real
  // threaded inbox; C.0 shows the structure.
  const [segment, setSegment] = useState<'sales' | 'service'>('sales')
  return (
    <div className="flex flex-col gap-3">
      <nav className="flex gap-2 text-xs">
        {(['sales', 'service'] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={
              'rounded px-2 py-1 ' +
              (segment === s
                ? 'bg-emerald-500/20 font-semibold'
                : 'opacity-60 hover:opacity-100')
            }
            onClick={() => setSegment(s)}
          >
            {s === 'sales' ? 'Sales' : 'Service'}
          </button>
        ))}
      </nav>
      <StubFrame
        title={`customer-console.comms · ${props.profile} · ${segment}`}
      >
        <div className="text-xs opacity-70">
          Phase C.5–C.7 — unified inbox over chat/email/SMS/phone/video, domain
          filter = {segment}. Threaded merge across channels per contact.
          Agent-autonomous reply (AC.5.8) gated by autonomous_reply_defaults +
          per-thread rules.
        </div>
      </StubFrame>
    </div>
  )
}

function CampaignsRenderer(props: ConsoleRendererProps) {
  return (
    <StubFrame title={`customer-console.campaigns · ${props.profile}`}>
      <div className="text-xs opacity-70">
        Phase C.8 — Service campaigns: Service Recall / Service Due /
        Follow-up Lead templates seeded under
        <code className="px-1 opacity-90">
          ~/.hermes/profiles/{props.profile}/campaigns/templates/
        </code>
        . Audiences + scheduled-send worker. Replies route back into Comms.
      </div>
      <div className="mt-2 text-xs opacity-60">
        Per operator decision 2026-05-29: Service-only sub-page (no Sales
        campaigns symmetry).
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
        voice / video / form). C.4 ships voice/video/form modes; chat works
        end-to-end today via /api/public/widget-chat.
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
        Right-pane assistant slot. Wires to the profile's primary agent in
        Phase C.2.
      </div>
    </div>
  )
}

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

export function getRenderer(key: string): ConsoleRenderer | null {
  return consoleRenderers[key] ?? null
}

export function listRendererKeys(): Array<string> {
  return Object.keys(consoleRenderers)
}
