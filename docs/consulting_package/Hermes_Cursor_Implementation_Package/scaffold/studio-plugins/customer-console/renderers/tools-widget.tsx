// Renderer contract reference for customer-console.tools-widget
// NOT loaded at runtime. Documents the shape the fork registry must satisfy.

import type { ConsoleRendererProps } from '@/lib/console-renderers'

export default function ToolsWidgetRenderer(props: ConsoleRendererProps) {
  const { profile, config } = props
  // Real implementation in Phase C.4:
  // - Lists profile widgets from ~/.hermes/profiles/<profile>/knowledge/widgets/*.md
  // - Per widget: live preview (iframe /w/<slug>), embed snippet copy block,
  //   customer-admin editable form (greeting, accent, agent assignment)
  // - CRUD writes go through KSG validation
  // - config.tools_widget.show_embed_snippet + show_live_demo gate the UI bits
  return (
    <div>
      customer-console.tools-widget for {profile} ({config.widgets.length} widgets)
    </div>
  )
}
