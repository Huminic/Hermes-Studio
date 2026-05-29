// Renderer contract reference for customer-console.service-kanban
// NOT loaded at runtime.

import type { ConsoleRendererProps } from '@/lib/console-renderers'

export default function ServiceKanbanRenderer(props: ConsoleRendererProps) {
  const { profile } = props
  // Real implementation in Phase 5: reuses the /tasks Kanban board logic
  // filtered to lanes prefixed `service-` for this profile.
  return <div>customer-console.service-kanban for {profile}</div>
}
