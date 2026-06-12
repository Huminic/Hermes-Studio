import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  defaultStudioConfig,
  type StudioConfig,
} from '@/lib/studio-config'
import { getRenderer } from '@/lib/console-renderers'

export const Route = createFileRoute('/console/$profile/$tab')({
  component: ConsoleTabRoute,
})

// Phase C 6-page IA. Each tab maps to the customer-console plugin's
// top-level page renderer. Sub-pages (Tools → Widget, Campaigns → Service)
// are internal to their parent renderer per AC.0.4.
const TAB_TO_RENDERER: Record<string, string> = {
  chat: 'customer-console.chat',
  knowledge: 'customer-console.knowledge',
  tools: 'customer-console.tools',
  data: 'customer-console.data',
  dashboard: 'customer-console.performance',
  comms: 'customer-console.comms',
  campaigns: 'customer-console.campaigns',
  notifications: 'customer-console.notifications',
}

type StudioConfigResponse = {
  config: StudioConfig
  source: 'file' | 'default'
}

async function fetchStudioConfig(
  profile: string,
): Promise<StudioConfigResponse> {
  const response = await fetch(
    `/api/studio-config?profile=${encodeURIComponent(profile)}`,
  )
  if (!response.ok) {
    throw new Error(`Failed to load studio config: ${response.status}`)
  }
  return (await response.json()) as StudioConfigResponse
}

function ConsoleTabRoute() {
  const { profile, tab } = Route.useParams()

  const configQuery = useQuery({
    queryKey: ['studio-config', profile],
    queryFn: () => fetchStudioConfig(profile),
    staleTime: 60_000,
  })

  const config = configQuery.data?.config ?? defaultStudioConfig(profile)
  const rendererKey = TAB_TO_RENDERER[tab]

  if (!rendererKey) {
    return (
      <div className="rounded border border-amber-300/30 bg-amber-400/5 p-4 text-sm">
        Unknown tab: <code>{tab}</code>. Expected one of:{' '}
        {Object.keys(TAB_TO_RENDERER).join(', ')}.
      </div>
    )
  }

  const Renderer = getRenderer(rendererKey)
  if (!Renderer) {
    return (
      <div className="rounded border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-300">
        Renderer not found in registry: <code>{rendererKey}</code>. This is a
        fork-side bug — the plugin manifest references a renderer that isn't
        registered in src/lib/console-renderers.tsx.
      </div>
    )
  }

  return <Renderer profile={profile} config={config} params={{ tab }} />
}
