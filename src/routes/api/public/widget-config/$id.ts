import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { publicWidgetConfigById } from '../../../../server/public-widgets'

/**
 * GET /api/public/widget-config/$id
 *
 * Single-ID public widget config (WS-7). Unauthed read, consistent with the
 * existing /w/$slug + /api/public/widgets/$widgetKey public surface. The
 * single id IS the widget slug — the cross-profile identifier already used by
 * /w/$slug — so the operator's single-ID embed needs no domain key or per-
 * dealer baked-in script: one snippet, one id, all config resolved here.
 *
 * Returns { ok, config } where config carries mode, agent, branding, greeting,
 * title and the live widget url the embed opens.
 */
export const Route = createFileRoute('/api/public/widget-config/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const config = publicWidgetConfigById(params.id)
        if (!config) {
          return json(
            { ok: false, error: 'Widget not found' },
            {
              status: 404,
              headers: { 'Access-Control-Allow-Origin': '*' },
            },
          )
        }
        return json(
          { ok: true, config },
          {
            headers: {
              'Cache-Control': 'public, max-age=60',
              // Embedded on third-party (dealer.com) origins — must be CORS-readable.
              'Access-Control-Allow-Origin': '*',
            },
          },
        )
      },
    },
  },
})
