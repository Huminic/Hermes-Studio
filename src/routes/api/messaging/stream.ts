/**
 * GET /api/messaging/stream?profile=X
 *
 * AC.5.5 — SSE stream of messaging events for a profile (thread_created,
 * message_appended, thread_status_changed, agent_replying, ...).
 */
import { createFileRoute } from '@tanstack/react-router'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../server/customer-auth'
import { subscribeMessaging } from '../../../server/messaging-hub-bus'

export const Route = createFileRoute('/api/messaging/stream')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const profile = url.searchParams.get('profile') ?? ''
        if (!profile) {
          return new Response('profile required', { status: 400 })
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return new Response('Forbidden', { status: 403 })
        }
        const encoder = new TextEncoder()
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const send = (event: { type: string; [k: string]: unknown }) => {
              const chunk =
                `event: ${event.type}\n` +
                `data: ${JSON.stringify(event)}\n\n`
              controller.enqueue(encoder.encode(chunk))
            }
            const unsubscribe = subscribeMessaging(profile, send)
            // Heartbeat every 25s to keep proxies from closing the connection.
            const heartbeat = setInterval(() => {
              try {
                controller.enqueue(encoder.encode(`: heartbeat\n\n`))
              } catch {
                clearInterval(heartbeat)
                unsubscribe()
              }
            }, 25_000)
            send({
              type: 'connected',
              profile,
              at: Date.now(),
            })
            // Wire up cancel via request signal
            request.signal.addEventListener('abort', () => {
              clearInterval(heartbeat)
              unsubscribe()
              try {
                controller.close()
              } catch {
                // already closed
              }
            })
          },
        })
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          },
        })
      },
    },
  },
})
