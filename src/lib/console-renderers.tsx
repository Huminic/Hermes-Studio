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
import { CustomerToolsWidgetRenderer } from '../components/customer-console/tools-widget-renderer'
import { CustomerCommsRenderer } from '../components/customer-console/comms-renderer'
import { CustomerCampaignsRenderer } from '../components/customer-console/campaigns-renderer'
import { CustomerDataRenderer } from '../components/customer-console/data-renderer'
import { CustomerPerformanceRenderer } from '../components/customer-console/performance-renderer'
import { CustomerNotificationsRenderer } from '../components/customer-console/notifications-renderer'
import { ConsultPanel } from '../components/customer-console/consult-panel'

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
  const consultEnabled = props.config.tools_widget.consult === true
  type SubPage = 'widget' | 'consult'
  const [sub, setSub] = useState<SubPage>('widget')
  return (
    <div className="flex flex-col gap-3">
      <nav className="flex gap-2 text-xs">
        <SubButton active={sub === 'widget'} onClick={() => setSub('widget')}>
          Widget
        </SubButton>
        {consultEnabled && (
          <SubButton
            active={sub === 'consult'}
            onClick={() => setSub('consult')}
          >
            Consult
          </SubButton>
        )}
      </nav>
      {sub === 'widget' && (
        <ToolsWidgetRenderer
          profile={props.profile}
          config={props.config}
          params={props.params}
        />
      )}
      {sub === 'consult' && consultEnabled && (
        <ConsultPanel profile={props.profile} config={props.config} />
      )}
    </div>
  )
}

function SubButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={
        'rounded px-2 py-1 ' +
        (active
          ? 'bg-emerald-500/20 font-semibold'
          : 'opacity-60 hover:opacity-100')
      }
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function ToolsWidgetRenderer(props: ConsoleRendererProps) {
  return (
    <CustomerToolsWidgetRenderer
      profile={props.profile}
      config={props.config}
    />
  )
}

function DataRenderer(props: ConsoleRendererProps) {
  return <CustomerDataRenderer profile={props.profile} config={props.config} />
}

function PerformanceRenderer(props: ConsoleRendererProps) {
  return (
    <CustomerPerformanceRenderer
      profile={props.profile}
      config={props.config}
    />
  )
}

function CommsRenderer(props: ConsoleRendererProps) {
  return <CustomerCommsRenderer profile={props.profile} config={props.config} />
}

function CampaignsRenderer(props: ConsoleRendererProps) {
  return (
    <CustomerCampaignsRenderer
      profile={props.profile}
      config={props.config}
    />
  )
}

function NotificationsRenderer(props: ConsoleRendererProps) {
  return (
    <CustomerNotificationsRenderer
      profile={props.profile}
      config={props.config}
    />
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
        Your store assistant. It greets shoppers, answers questions, and helps
        start a conversation for this Workspace.
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
  'customer-console.performance': PerformanceRenderer,
  'customer-console.comms': CommsRenderer,
  'customer-console.campaigns': CampaignsRenderer,
  'customer-console.notifications': NotificationsRenderer,
  'customer-console.widget-public': WidgetPublicRenderer,
  'customer-console.assistant-pane': AssistantPaneRenderer,
}

export function getRenderer(key: string): ConsoleRenderer | null {
  return consoleRenderers[key] ?? null
}

export function listRendererKeys(): Array<string> {
  return Object.keys(consoleRenderers)
}
