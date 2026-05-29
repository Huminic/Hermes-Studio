// Renderer contract reference for customer-console.widget-editor
// NOT loaded at runtime.

import type { ConsoleRendererProps } from '@/lib/console-renderers'

type WidgetEntry = {
  slug: string
  mode: 'chat' | 'voice' | 'video' | 'form'
  agent: string
}

export default function WidgetEditorRenderer(props: ConsoleRendererProps) {
  const { profile, config } = props
  const widgets =
    (config as { widgets?: Array<WidgetEntry> })?.widgets ?? []
  // Real implementation in Phase 5: CRUD over
  // ~/.hermes/profiles/<profile>/knowledge/widgets/*.md. Each widget file's
  // frontmatter declares slug, mode, agent. The public /w/$slug route serves
  // the widget from this content.
  return (
    <div>
      customer-console.widget-editor for {profile} — {widgets.length} widgets
    </div>
  )
}
