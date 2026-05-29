// Renderer contract reference for customer-console.comms
// NOT loaded at runtime. Documents the shape the fork registry must satisfy.

import type { ConsoleRendererProps } from '@/lib/console-renderers'

export default function CommsRenderer(props: ConsoleRendererProps) {
  const { profile } = props
  // Real implementation in Phase C.7:
  // - Three-column inbox UI: segment switcher (Sales | Service), thread
  //   list, thread detail + composer
  // - Pulls /api/messaging/threads?profile=X&domain=Y
  // - Subscribes to SSE /api/messaging/stream
  // - Composer routes through the right channel adapter
  // - Agent participation shown via typing indicator; agent-autonomous
  //   reply (AC.5.8) honors per-thread or studio.yaml.autonomous_reply_defaults
  // - Threaded conversation merge (same contact across channels = one thread)
  return <div>customer-console.comms for {profile}</div>
}
