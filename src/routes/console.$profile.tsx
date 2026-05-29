import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import {
  defaultStudioConfig,
  type StudioConfig,
} from '@/lib/studio-config'
import { getRenderer } from '@/lib/console-renderers'

export const Route = createFileRoute('/console/$profile')({
  component: ConsoleLayoutRoute,
})

type StudioConfigResponse = {
  config: StudioConfig
  source: 'file' | 'default'
  parseErrors?: Array<string>
}

async function fetchStudioConfig(profile: string): Promise<StudioConfigResponse> {
  const response = await fetch(
    `/api/studio-config?profile=${encodeURIComponent(profile)}`,
  )
  if (!response.ok) {
    throw new Error(`Failed to load studio config: ${response.status}`)
  }
  return (await response.json()) as StudioConfigResponse
}

function ConsoleLayoutRoute() {
  const { profile } = Route.useParams()
  usePageTitle(`Console · ${profile}`)
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  const configQuery = useQuery({
    queryKey: ['studio-config', profile],
    queryFn: () => fetchStudioConfig(profile),
    staleTime: 60_000,
  })

  const config = configQuery.data?.config ?? defaultStudioConfig(profile)
  const accentStyle = config.branding.accent_color
    ? { borderColor: config.branding.accent_color }
    : undefined

  const tabs = [
    { id: 'chat', label: 'Chat', enabled: config.menu.chat ?? true },
    {
      id: 'dashboard',
      label: 'Dashboard',
      enabled: config.menu.dashboard ?? true,
    },
    { id: 'widget', label: 'Widget', enabled: config.menu.widget ?? true },
    { id: 'service', label: 'Service', enabled: config.menu.service ?? true },
  ]

  const AssistantRenderer = getRenderer('customer-console.assistant-pane')
  const onTabRoute = tabs.some((t) =>
    pathname.endsWith(`/console/${profile}/${t.id}`),
  )

  return (
    <div className="flex h-full flex-col">
      <header
        className="flex items-baseline justify-between gap-4 border-b border-white/10 p-4"
        style={accentStyle}
      >
        <div className="flex items-baseline gap-3">
          <Link to="/profiles" className="text-xs opacity-60 hover:opacity-100">
            ← Profiles
          </Link>
          <h1 className="text-xl font-semibold">
            {config.branding.persona_name}
          </h1>
          <span className="rounded bg-white/10 px-2 py-0.5 text-xs uppercase tracking-wide">
            {profile}
          </span>
        </div>
        {configQuery.data?.source === 'default' && (
          <div className="text-[10px] opacity-50">
            no studio.yaml — using defaults
          </div>
        )}
      </header>

      <nav className="flex gap-1 border-b border-white/10 px-4 pt-3">
        {tabs.map((tab) => {
          const target = `/console/${profile}/${tab.id}`
          const active = pathname === target
          return (
            <Link
              key={tab.id}
              to="/console/$profile/$tab"
              params={{ profile, tab: tab.id }}
              disabled={!tab.enabled}
              className={
                'rounded-t border-b-2 px-3 py-2 text-sm ' +
                (active
                  ? 'border-emerald-400 font-semibold'
                  : 'border-transparent opacity-70 hover:opacity-100') +
                (tab.enabled ? '' : ' pointer-events-none opacity-30')
              }
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>

      <div className="flex flex-1 flex-row gap-4 p-4">
        <main className="flex-1">
          <Outlet />
        </main>
        {onTabRoute && AssistantRenderer && (
          <aside className="w-64 shrink-0">
            <AssistantRenderer
              profile={profile}
              config={config}
              params={{}}
            />
          </aside>
        )}
      </div>
    </div>
  )
}
