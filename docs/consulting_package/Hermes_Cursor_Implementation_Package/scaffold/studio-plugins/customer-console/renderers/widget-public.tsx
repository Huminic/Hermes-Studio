// Renderer contract reference for customer-console.widget-public
// NOT loaded at runtime. This renderer is auth: public.

import type { ConsoleRendererProps } from '@/lib/console-renderers'

export default function WidgetPublicRenderer(props: ConsoleRendererProps) {
  const slug = props.params.slug
  // Chat mode production-ready today via /api/public/widget-chat (Hermes
  // -> openai-direct fallback). Voice (Vapi), video (Tavus), form (inbound
  // to Comms) modes ship in Phase C.4. Slug resolution scans
  // ~/.hermes/profiles/*/knowledge/widgets/*.md frontmatter for a match;
  // profile is derived from the widget file's location.
  return <div>public widget {slug}</div>
}
