/**
 * POST /api/public/video-session   (public — storefront unified widget)
 *
 * Mints a Two-Way Video session for a profile and returns the join URL. The
 * video persona is resolved SERVER-SIDE from the profile's studio.yaml
 * (`unified_widget.video_persona_id`) and the session is created through the
 * central-mcp broker — no vendor identifiers or credentials ever reach the
 * browser. When the profile has no persona configured (or the broker is
 * unreachable), responds `{ ok: false }` so the widget degrades to
 * "temporarily unavailable" rather than erroring.
 *
 * Body: { profile }
 * Returns: { ok: true, conversationUrl } | { ok: false, error }
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { readStudioConfig } from '../../../server/studio-config'
import { callCentralMcpTool } from '../../../server/central-mcp'

export const Route = createFileRoute('/api/public/video-session')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as Record<
          string,
          unknown
        >
        const profile = typeof body.profile === 'string' ? body.profile : ''
        if (!profile) {
          return json({ ok: false, error: 'profile required' }, { status: 400 })
        }

        let config
        try {
          config = readStudioConfig(profile).config
        } catch {
          return json({ ok: false, error: 'unknown profile' }, { status: 404 })
        }

        const uw = config.unified_widget
        if (uw.enabled === false || uw.channels?.video === false) {
          return json({ ok: false, error: 'video disabled' })
        }
        const personaId = uw.video_persona_id
        if (!personaId) {
          // Honest degrade — no persona configured for this store yet.
          return json({ ok: false, error: 'video not configured' })
        }

        const r = await callCentralMcpTool('tavus_create_conversation', {
          persona_id: personaId,
          conversation_name: `${config.branding.persona_name} storefront`,
          custom_greeting: `Hi! Thanks for visiting ${config.branding.persona_name}. How can I help you today?`,
        })
        if (!r.ok) {
          // Detail to the server log; generic to the visitor (no vendor names).
          console.warn(`[video-session] ${profile} mint failed: ${r.error}`)
          return json({ ok: false, error: 'video temporarily unavailable' })
        }
        const data = (r.data ?? {}) as {
          conversation_url?: string
          conversationUrl?: string
        }
        const conversationUrl = data.conversation_url ?? data.conversationUrl
        if (!conversationUrl) {
          console.warn(`[video-session] ${profile} mint returned no URL`)
          return json({ ok: false, error: 'video temporarily unavailable' })
        }
        return json({ ok: true, conversationUrl })
      },
    },
  },
})
