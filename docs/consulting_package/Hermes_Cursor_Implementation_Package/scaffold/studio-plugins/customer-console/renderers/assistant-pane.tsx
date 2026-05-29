// Renderer contract reference for customer-console.assistant-pane
// NOT loaded at runtime. Renders in the right-pane slot `console-assistant`.

import type { ConsoleRendererProps } from '@/lib/console-renderers'

export default function AssistantPaneRenderer(props: ConsoleRendererProps) {
  const { profile, config } = props
  const personaName =
    (config as { branding?: { persona_name?: string } })?.branding
      ?.persona_name ?? 'Assistant'
  // Real implementation in Phase 5: thin wrapper over the existing /chat
  // session API, pinned to the profile's primary agent. Mounted in the
  // right-pane slot on all four customer console routes.
  return (
    <div>
      {personaName} for {profile}
    </div>
  )
}
