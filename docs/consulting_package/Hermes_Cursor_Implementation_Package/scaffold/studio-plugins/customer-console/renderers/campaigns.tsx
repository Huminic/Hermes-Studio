// Renderer contract reference for customer-console.campaigns
// NOT loaded at runtime. Documents the shape the fork registry must satisfy.

import type { ConsoleRendererProps } from '@/lib/console-renderers'

export default function CampaignsRenderer(props: ConsoleRendererProps) {
  const { profile } = props
  // Real implementation in Phase C.8:
  // - Campaign list + builder
  // - Audience builder reads contacts table; simple query DSL
  // - Templates: Service Recall, Service Due, Follow-up Lead seeded under
  //   ~/.hermes/profiles/<profile>/campaigns/templates/
  // - Scheduled-send Hermes job dispatches via channel adapter
  // - Replies route back into Comms via inbox_routing rows
  // - Service sub-page is a filtered campaign list with service flows
  // - Per operator decision 2026-05-29: Service sub-page only, no Sales symmetry
  return <div>customer-console.campaigns for {profile} (Service-only)</div>
}
