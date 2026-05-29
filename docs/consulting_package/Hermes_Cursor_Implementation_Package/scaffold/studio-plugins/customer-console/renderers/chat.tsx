// Renderer contract reference for customer-console.chat
// NOT loaded at runtime. Documents the shape the fork registry must satisfy.

import type { ConsoleRendererProps } from '@/lib/console-renderers'

export default function ChatRenderer(props: ConsoleRendererProps) {
  const { profile, config } = props
  // Real implementation in Phase C.2:
  // - Reads config.agent_picker.visible_agents (or all profile agents if empty)
  // - Renders picker; on selection opens a Studio session against agent's SOUL
  // - Loads governance/agents/<agent>/personas/chat.md if present
  // - Conversation persists in Hermes SessionDB with channel=chat metadata
  //   so it surfaces in the Comms inbox later
  return (
    <div>
      customer-console.chat for {profile} ({config.branding.persona_name})
    </div>
  )
}
