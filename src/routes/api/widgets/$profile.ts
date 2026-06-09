import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAdmin } from '../../../server/auth-middleware'
import { requireJsonContentType } from '../../../server/rate-limit'
import {
  getWidget,
  rotateWidgetKey,
  updateWidget,
} from '../../../server/widget-store'
import type { WidgetAgentEntry } from '../../../types/widget'

export const Route = createFileRoute('/api/widgets/$profile')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAdmin(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        return json({ ok: true, widget: getWidget(params.profile) })
      },

      PATCH: async ({ request, params }) => {
        if (!isAdmin(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        const body = (await request.json().catch(() => ({}))) as Record<
          string,
          unknown
        >
        const widget = updateWidget(params.profile, {
          enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
          allowedDomains: Array.isArray(body.allowedDomains)
            ? (body.allowedDomains as unknown[]).filter(
                (value): value is string => typeof value === 'string',
              )
            : undefined,
          launcherLabel:
            typeof body.launcherLabel === 'string' ? body.launcherLabel : undefined,
          accent: typeof body.accent === 'string' ? body.accent : undefined,
          agents: Array.isArray(body.agents)
            ? (body.agents as WidgetAgentEntry[])
            : undefined,
        })
        return json({ ok: true, widget })
      },

      POST: async ({ request, params }) => {
        if (!isAdmin(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const widget = rotateWidgetKey(params.profile)
        return json({ ok: true, widget })
      },
    },
  },
})
