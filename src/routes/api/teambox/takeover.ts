/**
 * GET /api/teambox/takeover?token=...
 *
 * SLICE H — the takeover button target in the active-conversation alert email.
 * Validates an HMAC token (minted by lead-notifications.mintTakeoverToken,
 * binding profile + threadId), then calls assignThreadToHuman for that
 * profile+thread. The autonomous-reply engine checks isHumanAssigned before
 * every send, so assigning here HALTS the AI's auto-replies for that thread.
 *
 * Token-gated so arbitrary callers can't pause threads. Returns a simple HTML
 * confirmation page (this URL is clicked from an email by a human). Idempotent:
 * re-clicking the link just re-asserts the (already-set) takeover.
 */
import { createFileRoute } from '@tanstack/react-router'
import { verifyTakeoverToken } from '../../../server/lead-notifications'
import { assignThreadToHuman } from '../../../server/thread-takeover'

function htmlResponse(status: number, title: string, body: string): Response {
  const page = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title></head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <div style="max-width:520px;margin:60px auto;background:#fff;border-radius:8px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,0.1);text-align:center;">
    <h1 style="margin:0 0 16px;font-size:22px;color:#333;">${title}</h1>
    <p style="margin:0;font-size:15px;color:#555;line-height:1.6;">${body}</p>
  </div>
</body></html>`
  return new Response(page, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

export const Route = createFileRoute('/api/teambox/takeover')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const token = url.searchParams.get('token') ?? ''
        const verified = verifyTakeoverToken(token)
        if (!verified) {
          return htmlResponse(
            403,
            'Invalid or expired link',
            'This takeover link could not be verified. Open the conversation in your inbox to take it over manually.',
          )
        }
        try {
          assignThreadToHuman(verified.profile, verified.threadId, 'human-takeover-link')
        } catch {
          return htmlResponse(
            500,
            'Something went wrong',
            'We could not pause the AI for this conversation. Please open it in your inbox.',
          )
        }
        return htmlResponse(
          200,
          'You have taken over this conversation',
          'The AI has stopped replying on this thread. Continue the conversation from your inbox — the customer will now hear from you.',
        )
      },
    },
  },
})
