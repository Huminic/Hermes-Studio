// Renderer contract reference for customer-console.knowledge
// NOT loaded at runtime. Documents the shape the fork registry must satisfy.

import type { ConsoleRendererProps } from '@/lib/console-renderers'

export default function KnowledgeRenderer(props: ConsoleRendererProps) {
  const { profile } = props
  // Real implementation in Phase C.3:
  // - Monaco editor + frontmatter panel (reuses extractFrontmatter utility)
  // - Reads /api/customer/wiki/tree?profile=X (filtered to customer-visible)
  // - Save flow routes through /api/customer/wiki/save -> KSG gate
  // - Promote action (inbox/ -> drafts/ -> published/) via governance agent
  return <div>customer-console.knowledge for {profile}</div>
}
