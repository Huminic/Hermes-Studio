import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { readStudioConfig } from '../../server/studio-config'
import { publicUnifiedWidget } from '../../lib/studio-config'

/**
 * GET /api/studio-config?profile=X
 *
 * Returns the per-profile studio.yaml. Unauthenticated visitors get the
 * PUBLIC subset (branding + menu visibility) so the storefront landing
 * page can render brand chrome before login. Authenticated callers get
 * the full config including agent_picker, federation scopes, etc.
 */
export const Route = createFileRoute('/api/studio-config')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url)
          const profile = url.searchParams.get('profile')
          if (!profile) {
            return json({ error: 'profile query param required' }, { status: 400 })
          }
          const full = readStudioConfig(profile)
          if (isAuthenticated(request)) {
            return json(full)
          }
          // Public subset: branding + menu + the unified-widget DISPLAY config
          // (the floating storefront launcher must render for anonymous visitors).
          // `video_persona_id` is stripped — the Two-Way Video session is minted
          // server-side. Anything that reveals agent rosters, federation scopes,
          // autonomous-reply defaults or per-mode widget configuration stays behind auth.
          return json({
            config: {
              branding: full.config.branding,
              menu: full.config.menu,
              agent_picker: { visible_agents: [], default_agent: undefined },
              tools_widget: full.config.tools_widget,
              widgets: [],
              autonomous_reply_defaults: { enabled: false, business_hours_only: false, max_agent_turns: 0, channels: [] },
              federation: { read_scopes: [] },
              lead_notifications: {},
              unified_widget: publicUnifiedWidget(full.config),
            },
            source: full.source,
          })
        } catch (error) {
          return json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to read studio config',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
