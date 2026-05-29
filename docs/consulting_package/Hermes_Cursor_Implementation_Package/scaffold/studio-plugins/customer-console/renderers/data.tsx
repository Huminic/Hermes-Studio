// Renderer contract reference for customer-console.data
// NOT loaded at runtime. Documents the shape the fork registry must satisfy.

import type { ConsoleRendererProps } from '@/lib/console-renderers'

export default function DataRenderer(props: ConsoleRendererProps) {
  const { profile, config } = props
  // Real implementation in Phase C.10:
  // - Mounts Metabase Embedding SDK (React) with customer-admin signed JWT
  // - JWT carries profile claim that Metabase enforces as required filter
  // - Default dashboard pre-seeded per profile (leads, comms volume, agents)
  // - Customer-admin can pin questions to dashboard via Metabase native authoring
  // - Federation MCP backs ad-hoc queries from the chat agent
  return (
    <div>
      customer-console.data for {profile} (federation scopes:{' '}
      {config.federation.read_scopes.length})
    </div>
  )
}
