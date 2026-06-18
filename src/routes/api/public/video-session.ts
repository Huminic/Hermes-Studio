/**
 * POST /api/public/video-session   (public, CORS-open — storefront + dealer embed)
 *
 * Mints a Two-Way Video session for a profile and returns the join URL. The
 * video persona is resolved SERVER-SIDE from the profile's studio.yaml
 * (`unified_widget.video_persona_id`) and the session is created through the
 * central-mcp broker — no vendor identifiers or credentials ever reach the
 * browser. When the profile has no persona configured (or the broker is
 * unreachable), responds `{ ok: false }` so the widget degrades to
 * "temporarily unavailable" rather than erroring.
 *
 * CORS-open (OPTIONS preflight + ACAO:*) so the self-hosted dealer.com embed can
 * call it cross-origin.
 *
 * Returns the live video room URL directly (the simple handoff: the widget opens
 * it fullscreen with camera/mic). The room is grey-label — its URL may show. The
 * "no vendor names" rule applies to dealer/customer-facing TEXT (notifications,
 * messages, lead emails, widget copy), NOT the video room URL (per operator
 * clarification 2026-06-09). An earlier same-origin wrapper that masked the room
 * host was an over-interpretation and has been backed out.
 *
 * Body: { profile }
 * Returns: { ok: true, conversationUrl } | { ok: false, error }
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { readStudioConfig } from '../../../server/studio-config'
import { callCentralMcpTool } from '../../../server/central-mcp'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cross-Origin-Resource-Policy': 'cross-origin',
}

function reply(data: unknown, status = 200): Response {
  return json(data as never, { status, headers: CORS })
}

export const Route = createFileRoute('/api/public/video-session')({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as Record<
          string,
          unknown
        >
        const profile = typeof body.profile === 'string' ? body.profile : ''
        if (!profile) {
          return reply({ ok: false, error: 'profile required' }, 400)
        }

        let config
        try {
          config = readStudioConfig(profile).config
        } catch {
          return reply({ ok: false, error: 'unknown profile' }, 404)
        }

        const uw = config.unified_widget
        if (uw.enabled === false || uw.channels?.video === false) {
          return reply({ ok: false, error: 'video disabled' })
        }
        const personaId = uw.video_persona_id
        if (!personaId) {
          // Honest degrade — no persona configured for this store yet.
          return reply({ ok: false, error: 'video not configured' })
        }

        const origin = new URL(request.url).origin
        const callback_url = `${origin}/api/webhooks/tavus/${profile}`
        const r = await callCentralMcpTool('tavus_create_conversation', {
          persona_id: personaId,
          conversation_name: `${config.branding.persona_name} storefront`,
          custom_greeting: `Hi! Thanks for visiting ${config.branding.persona_name}. How can I help you today?`,
          callback_url,
        })
        if (!r.ok) {
          // Detail to the server log; generic to the visitor (no vendor names).
          console.warn(`[video-session] ${profile} mint failed: ${r.error}`)
          return reply({ ok: false, error: 'video temporarily unavailable' })
        }
        const data = (r.data ?? {}) as {
          conversation_url?: string
          conversationUrl?: string
        }
        const conversationUrl = data.conversation_url ?? data.conversationUrl
        if (!conversationUrl) {
          console.warn(`[video-session] ${profile} mint returned no URL`)
          return reply({ ok: false, error: 'video temporarily unavailable' })
        }
        return reply({ ok: true, conversationUrl })
      },
    },
  },
})
