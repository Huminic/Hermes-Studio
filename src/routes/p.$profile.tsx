import {
  Link,
  Outlet,
  createFileRoute,
  useRouterState,
} from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { defaultStudioConfig, type StudioConfig } from '@/lib/studio-config'
import { UnifiedWidget } from '@/components/customer-console/unified-widget'

export const Route = createFileRoute('/p/$profile')({
  component: StorefrontLandingRoute,
})

type StudioConfigResponse = {
  config: StudioConfig
  source: 'file' | 'default'
}

type AuthSession = {
  authenticated: boolean
  profile_auth_mode: boolean
  profile?: string | null
  username?: string | null
  is_admin?: boolean
  is_customer_admin?: boolean
  scope_profiles?: string[]
}

async function fetchStudioConfig(
  profile: string,
): Promise<StudioConfigResponse> {
  const res = await fetch(
    `/api/studio-config?profile=${encodeURIComponent(profile)}`,
    { credentials: 'include' },
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as StudioConfigResponse
}

async function fetchAuthSession(): Promise<AuthSession> {
  const res = await fetch('/api/auth-session', { credentials: 'include' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as AuthSession
}

const TABS: Array<{
  id: string
  label: string
  menuKey: keyof StudioConfig['menu']
}> = [
  { id: 'chat', label: 'Chat', menuKey: 'chat' },
  { id: 'agents', label: 'Agents', menuKey: 'agents' },
  { id: 'infostore', label: 'InfoStore', menuKey: 'infostore' },
  { id: 'tools', label: 'StoreFront', menuKey: 'tools' },
  { id: 'dashboard', label: 'Dashboard', menuKey: 'dashboard' },
  { id: 'comms', label: 'Teambox', menuKey: 'comms' },
  { id: 'campaigns', label: 'Marketing', menuKey: 'campaigns' },
  { id: 'notifications', label: 'Notifications', menuKey: 'notifications' },
]

function StorefrontLandingRoute() {
  const { profile } = Route.useParams()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  // Only render landing chrome when on the landing path itself; child tab
  // routes render their own content (and their own auth gate).
  const isLandingPath =
    pathname === `/p/${profile}` || pathname === `/p/${profile}/`

  const configQuery = useQuery({
    queryKey: ['studio-config', profile],
    queryFn: () => fetchStudioConfig(profile),
    staleTime: 60_000,
  })
  const config = configQuery.data?.config ?? defaultStudioConfig(profile)

  const authQuery = useQuery({
    queryKey: ['auth-session'],
    queryFn: fetchAuthSession,
    staleTime: 10_000,
  })
  const session = authQuery.data
  const matchesProfile =
    !!session?.authenticated &&
    (session.is_admin ||
      session.profile === profile ||
      session.scope_profiles?.includes(profile))

  if (!isLandingPath) {
    // Render the child tab route — sub-routes handle their own auth + UI.
    // TanStack file routing: parent must render <Outlet /> for the
    // child route's component to mount. Returning `null` here meant the
    // /p/$profile/$tab page rendered as an empty Suspense slot.
    return <Outlet />
  }

  const PRIMARY = '#3b82f6'

  return (
    <div className="flex min-h-dvh flex-col bg-white font-sans text-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-6">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="truncate text-2xl font-semibold text-slate-900">
            {config.branding.persona_name}
          </h1>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 pb-28 pt-10">
        <section className="flex flex-col items-start gap-4">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
            Welcome to {config.branding.persona_name}
          </h2>
          <p className="max-w-prose text-sm leading-relaxed text-slate-600">
            We're here to help. Use the chat widget in the corner to connect with us — whether you need answers, want to schedule service, or have questions about your vehicle.
          </p>
          <p className="text-xs text-slate-400">
            Click the chat bubble in the corner to start a conversation.
          </p>
        </section>
      </main>

      <footer className="border-t border-slate-200 p-4 pr-24 text-[10px] text-slate-400">
        Powered by Huminic
      </footer>

      <UnifiedWidget
        profile={profile}
        personaName={config.branding.persona_name}
        unified={config.unified_widget}
      />
    </div>
  )
}

function tabBlurb(id: string): string {
  switch (id) {
    case 'chat':
      return 'Chat with your agents'
    case 'agents':
      return 'Manage your agents and their tasks'
    case 'infostore':
      return 'Knowledge, data, and guardian hunches in one place'
    case 'tools':
      return 'Widget embed code, live demo, and tool config'
    case 'knowledge':
      return 'Edit your knowledge base, with safe-edit checks'
    case 'data':
      return 'Dashboards over your messaging, agents, and integrations'
    case 'dashboard':
      return 'Performance metrics across channels — leads and messages'
    case 'comms':
      return 'Unified inbox — Sales and Service across all channels'
    case 'campaigns':
      return 'Schedule outbound campaigns (Service)'
    case 'notifications':
      return 'Choose who gets alerted, and when'
    default:
      return ''
  }
}
