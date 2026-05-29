// Renderer contract reference for customer-console.dashboard-grid
// NOT loaded at runtime.

import type { ConsoleRendererProps } from '@/lib/console-renderers'

type DashboardEntry = {
  slug: string
  title?: string
  artifact_path: string
}

export default function DashboardGridRenderer(props: ConsoleRendererProps) {
  const { profile, config } = props
  const dashboards =
    (config as { dashboards?: Array<DashboardEntry> })?.dashboards ?? []
  // Real implementation in Phase 5: each entry renders an artifact built by
  // the web-artifact / live-web-artifact skills. The artifact source lives at
  // ~/.hermes/profiles/<profile>/<artifact_path> and is embedded as an iframe.
  return (
    <div>
      customer-console.dashboard-grid for {profile} — {dashboards.length}{' '}
      dashboards
    </div>
  )
}
