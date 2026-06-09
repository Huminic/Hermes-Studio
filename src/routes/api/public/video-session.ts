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
 * LC-BLOCKER-001: the returned `conversationUrl` is a SAME-ORIGIN wrapper
 * (`/widget/video-room?c=<id>`), NOT the provider room URL — so no banned vendor
 * host ever appears in this JSON response or in the public iframe `src`. The
 * wrapper embeds the real room one frame down on our origin.
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

        const r = await callCentralMcpTool('tavus_create_conversation', {
          persona_id: personaId,
          conversation_name: `${config.branding.persona_name} storefront`,
          custom_greeting: `Hi! Thanks for visiting ${config.branding.persona_name}. How can I help you today?`,
        })
        if (!r.ok) {
          // Detail to the server log; generic to the visitor (no vendor names).
          console.warn(`[video-session] ${profile} mint failed: ${r.error}`)
          return reply({ ok: false, error: 'video temporarily unavailable' })
        }
        const data = (r.data ?? {}) as {
          conversation_id?: string
          conversation_url?: string
          conversationUrl?: string
        }
        const rawUrl = data.conversation_url ?? data.conversationUrl
        // Resolve an OPAQUE conversation id (no vendor host). Prefer the explicit
        // id; else take the last path segment of the provider room URL.
        const lastSeg = rawUrl
          ? rawUrl.split('?')[0].split('/').filter(Boolean).pop()
          : undefined
        const conversationId = data.conversation_id ?? lastSeg
        if (!conversationId || !/^[A-Za-z0-9_-]{6,64}$/.test(conversationId)) {
          console.warn(`[video-session] ${profile} mint returned no usable id`)
          return reply({ ok: false, error: 'video temporarily unavailable' })
        }
        // Return a SAME-ORIGIN wrapper URL — the provider host never leaves the
        // server. https-forced because the proxy forwards http internally and the
        // bundle runs on HTTPS dealer.com pages (mixed-content otherwise).
        const url = new URL(request.url)
        const host = request.headers.get('host') ?? url.host
        const proto =
          request.headers.get('x-forwarded-proto') ??
          (/^(localhost|127\.|0\.0\.0\.0)/.test(host) ? 'http' : 'https')
        const conversationUrl = `${proto}://${host}/widget/video-room?c=${conversationId}`
        return reply({ ok: true, conversationUrl })
      },
    },
  },
})
