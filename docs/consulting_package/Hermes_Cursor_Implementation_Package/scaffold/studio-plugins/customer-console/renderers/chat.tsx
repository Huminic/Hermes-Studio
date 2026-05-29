// Renderer contract reference for customer-console.chat
// NOT loaded at runtime. Documents the shape the fork registry must satisfy.

import type { ConsoleRendererProps } from '@/lib/console-renderers'

export default function ChatRenderer(props: ConsoleRendererProps) {
  const { profile } = props
  // Real implementation in Phase 5: opens a Studio session against the
  // profile's primary agent (read from ~/.hermes/profiles/<profile>/config.yaml
  // or studio.yaml) and renders the existing chat panel scoped to that session.
  return <div>customer-console.chat for {profile}</div>
}
