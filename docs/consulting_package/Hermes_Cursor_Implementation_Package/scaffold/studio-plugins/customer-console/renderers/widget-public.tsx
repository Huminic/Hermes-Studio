// Renderer contract reference for customer-console.widget-public
// NOT loaded at runtime. This renderer is auth: public.

import type { ConsoleRendererProps } from '@/lib/console-renderers'

export default function WidgetPublicRenderer(props: ConsoleRendererProps) {
  const slug = props.params.slug
  // Real implementation in Phase 5: resolves the slug by scanning
  // ~/.hermes/profiles/*/knowledge/widgets/*.md frontmatter for a matching
  // slug. Renders the widget in the mode declared by the frontmatter
  // (chat / voice / video / form). The profile is derived from the widget
  // file's location.
  return <div>public widget {slug}</div>
}
