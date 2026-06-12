import {
  Link,
  Outlet,
  createFileRoute,
  useRouterState,
} from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  defaultStudioConfig,
  type StudioConfig,
} from '@/lib/studio-config'
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

const TABS: Array<{ id: string; label: string; menuKey: keyof StudioConfig['menu'] }> = [
  { id: 'chat', label: 'Agents', menuKey: 'chat' },
  { id: 'knowledge', label: 'Knowledge', menuKey: 'knowledge' },
  { id: 'tools', label: 'Widgets', menuKey: 'tools' },
  { id: 'data', label: 'Data', menuKey: 'data' },
  { id: 'dashboard', label: 'Dashboard', menuKey: 'dashboard' },
  { id: 'comms', label: 'Teambox', menuKey: 'comms' },
  { id: 'campaigns', label: 'Campaigns', menuKey: 'campaigns' },
  { id: 'notifications', label: 'Notifications', menuKey: 'notifications' },
]

function StorefrontLandingRoute() {
  const { profile } = Route.useParams()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  // Only render landing chrome when on the landing path itself; child tab
  // routes render their own content (and their own auth gate).
  const isLandingPath = pathname === `/p/${profile}` || pathname === `/p/${profile}/`

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
          <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-500">
            {profile}
          </span>
        </div>
        <Link
          to="/p/$profile/$tab"
          params={{ profile, tab: 'chat' }}
          className="shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ background: PRIMARY }}
        >
          {matchesProfile ? 'Enter →' : 'Log in'}
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 pb-28 pt-10">
        <section className="flex flex-col items-start gap-4">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
            Welcome to {config.branding.persona_name}
          </h2>
          <p className="max-w-prose text-sm leading-relaxed text-slate-600">
            This is your store Workspace — the staff side of Huminic. Sign in to
            manage your agents, conversations, widgets, dashboards, and
            campaigns.
          </p>
          <Link
            to="/p/$profile/$tab"
            params={{ profile, tab: 'chat' }}
            className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.02]"
            style={{ background: PRIMARY }}
          >
            {matchesProfile
              ? 'Enter your Workspace →'
              : 'Log in to your Workspace'}
          </Link>
          <p className="text-xs text-slate-400">
            See the chat bubble in the corner? That's your live Storefront — the
            same widget your customers use to reach you.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
            What's inside your Workspace
          </div>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TABS.map((tab) => {
              const enabled = config.menu[tab.menuKey] ?? true
              return (
                <li
                  key={tab.id}
                  className={
                    'rounded-lg border p-4 transition-colors ' +
                    (enabled
                      ? 'border-slate-200 bg-slate-50 hover:border-slate-300'
                      : 'border-slate-100 bg-slate-50 opacity-50')
                  }
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-900">
                      {tab.label}
                    </div>
                    {!enabled && (
                      <div className="text-[10px] uppercase text-slate-400">
                        disabled
                      </div>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {tabBlurb(tab.id)}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        {configQuery.data?.source === 'default' && (
          <div className="text-[10px] text-slate-400">
            Showing default branding for this store.
          </div>
        )}
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
      return 'Talk to your agents'
    case 'knowledge':
      return 'Edit your knowledge base, with safe-edit checks'
    case 'tools':
      return 'Widget embed code, live demo, and tool config'
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
