// Renderer contract reference for customer-console.assistant-pane
// NOT loaded at runtime. Renders in the right-pane slot `console-assistant`.

import type { ConsoleRendererProps } from '@/lib/console-renderers'

export default function AssistantPaneRenderer(props: ConsoleRendererProps) {
  const { profile, config } = props
  const personaName =
    (config as { branding?: { persona_name?: string } })?.branding
      ?.persona_name ?? 'Assistant'
  // Real implementation in Phase C.2: thin wrapper over the existing /chat
  // session API, pinned to the profile's primary agent. Mounted in the
  // right-pane slot on all six customer console routes (Chat, Knowledge,
  // Tools, Data, Comms, Campaigns).
  return (
    <div>
      {personaName} for {profile}
    </div>
  )
}
