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

import { useCallback, useEffect, useMemo, useState } from 'react'
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

const CUSTOMER_ACCENT = '#2f3b4d'

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
        Renderer stub — Phase C.0. Real implementation lands in the named phase
        below.
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
    <CustomerKnowledgeRenderer profile={props.profile} config={props.config} />
  )
}

type InfoStoreSubPage = 'knowledge' | 'data' | 'hunches'

function initialInfoStoreSubPage(tab?: string): InfoStoreSubPage {
  if (tab === 'data') return 'data'
  if (tab === 'hunches') return 'hunches'
  return 'knowledge'
}

function InfoStoreRenderer(props: ConsoleRendererProps) {
  const [sub, setSub] = useState<InfoStoreSubPage>(() =>
    initialInfoStoreSubPage(props.params.tab),
  )

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <section className="flex flex-col gap-3 border-b border-slate-200 pb-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-slate-900">InfoStore</h2>
          <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
            Your company wiki, database snapshots, and Semantic Guardian
            observations in one governed place. The Semantic Guardian protects
            knowledge and data boundaries and is available from Agents for
            internal questions about canon, lineage, and data confidence.
          </p>
        </div>

        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <InfoStoreSummaryItem
            title="Knowledge Store"
            detail="Your company wiki — policies, procedures, hours, services, and team knowledge. Edit pages directly or create new ones."
          />
          <InfoStoreSummaryItem
            title="Data Store"
            detail="Database snapshots and major data categories — contacts, threads, campaigns, and follow-ups."
          />
          <InfoStoreSummaryItem
            title="Hunches"
            detail="Semantic Guardian observations about stale knowledge, duplicate facts, or cross-scope concerns. Review and accept or deny suggestions."
          />
        </div>
      </section>

      <nav
        className="flex flex-wrap gap-2 text-xs"
        aria-label="InfoStore sections"
      >
        <SubButton
          active={sub === 'knowledge'}
          onClick={() => setSub('knowledge')}
        >
          Knowledge Store
        </SubButton>
        <SubButton active={sub === 'data'} onClick={() => setSub('data')}>
          Data Store
        </SubButton>
        <SubButton active={sub === 'hunches'} onClick={() => setSub('hunches')}>
          Hunches
        </SubButton>
      </nav>

      {sub === 'knowledge' && (
        <CustomerKnowledgeRenderer
          profile={props.profile}
          config={props.config}
        />
      )}
      {sub === 'data' && (
        <CustomerDataRenderer profile={props.profile} config={props.config} />
      )}
      {sub === 'hunches' && <InfoStoreHunches profile={props.profile} />}
    </div>
  )
}

function InfoStoreSummaryItem({
  title,
  detail,
}: {
  title: string
  detail: string
}) {
  return (
    <div className="border-l-2 border-slate-200 pl-3">
      <div className="text-base font-semibold text-slate-900">{title}</div>
      <div className="mt-1 text-sm leading-relaxed text-slate-600">{detail}</div>
    </div>
  )
}

type HunchRecord = {
  id: string
  ts: number
  guardian: string
  subject_type: string | null
  statement: string
  confidence: string | null
  status: string
  proposed_action: string | null
}

type HunchesResponse = {
  ok: boolean
  hunches?: Array<HunchRecord>
  error?: string
}

function InfoStoreHunches({ profile }: { profile: string }) {
  const [hunches, setHunches] = useState<Array<HunchRecord>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [deferred, setDeferred] = useState<Record<string, true>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/customer/hunches?profile=${encodeURIComponent(profile)}&status=open`,
        { credentials: 'include' },
      )
      const j = (await res.json().catch(() => ({}))) as HunchesResponse
      if (!res.ok || !j.ok) {
        setError('Hunches could not be loaded right now.')
        return
      }
      setHunches(j.hunches ?? [])
    } catch {
      setError('Hunches could not be loaded right now.')
    } finally {
      setLoading(false)
    }
  }, [profile])

  useEffect(() => {
    void load()
  }, [load])

  const visibleHunches = useMemo(
    () => hunches.filter((h) => !deferred[h.id]),
    [hunches, deferred],
  )

  async function recordDecision(id: string, decision: 'accept' | 'deny') {
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch('/api/customer/hunches', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, id, decision }),
      })
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
      }
      if (!res.ok || !j.ok) {
        setError('That review decision could not be saved.')
        return
      }
      setHunches((prev) => prev.filter((h) => h.id !== id))
    } catch {
      setError('That review decision could not be saved.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-semibold text-slate-900">
            Semantic Guardian hunches
          </h3>
          <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
            Suggestions about stale knowledge, duplicate facts, orphaned
            records, missing source links, or cross-scope concerns appear here
            for review before anything changes.
          </p>
        </div>
        {error && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            {error}
          </div>
        )}

        {loading ? (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            Loading hunches…
          </div>
        ) : visibleHunches.length > 0 ? (
          <div className="mt-4 flex flex-col gap-3">
            {visibleHunches.map((hunch) => (
              <div
                key={hunch.id}
                className="rounded-lg border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  <span>{hunch.guardian}</span>
                  {hunch.subject_type && <span>{hunch.subject_type}</span>}
                  {hunch.confidence && <span>{hunch.confidence}</span>}
                  <span>{new Date(hunch.ts).toLocaleString()}</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-800">
                  {hunch.statement}
                </p>
                {hunch.proposed_action && (
                  <p className="mt-2 text-xs text-slate-500">
                    Suggested review path: {hunch.proposed_action}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === hunch.id}
                    onClick={() => void recordDecision(hunch.id, 'accept')}
                    className="rounded-md bg-blue-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    disabled={busyId === hunch.id}
                    onClick={() => void recordDecision(hunch.id, 'deny')}
                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 disabled:opacity-50"
                  >
                    Deny
                  </button>
                  <button
                    type="button"
                    disabled={busyId === hunch.id}
                    onClick={() =>
                      setDeferred((prev) => ({ ...prev, [hunch.id]: true }))
                    }
                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 disabled:opacity-50"
                  >
                    Defer
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-900">
              No hunches yet
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
              Review items will be scoped to{' '}
              <span className="font-medium">{profile}</span>. Accepting a hunch
              records a decision path; it does not automatically rewrite
              knowledge, customer records, campaigns, reports, or source data.
            </p>
          </div>
        )}
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <HunchCategory
          title="Integrity"
          detail="Orphaned leads, missing source links, stale records, and duplicate data."
        />
        <HunchCategory
          title="Knowledge"
          detail="Outdated wiki pages, weak internal links, duplicate guidance, and policy conflicts."
        />
        <HunchCategory
          title="Scope"
          detail="Cross-profile boundaries, permission concerns, and review ownership."
        />
      </section>
    </div>
  )
}

function HunchCategory({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{detail}</p>
    </div>
  )
}

function ToolsRenderer(props: ConsoleRendererProps) {
  const consultEnabled = props.config.tools_widget.consult === true
  type SubPage = 'widget' | 'consult'
  const [sub, setSub] = useState<SubPage>('widget')
  return (
    <div className="flex flex-col gap-3">
      <nav className="flex gap-2">
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
        'rounded-md px-3 py-1.5 text-sm transition ' +
        (active
          ? 'font-semibold'
          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900')
      }
      style={
        active
          ? { background: `${CUSTOMER_ACCENT}14`, color: CUSTOMER_ACCENT }
          : undefined
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
    <CustomerCampaignsRenderer profile={props.profile} config={props.config} />
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
  'customer-console.infostore': InfoStoreRenderer,
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
