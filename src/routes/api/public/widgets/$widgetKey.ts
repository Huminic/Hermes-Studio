import { createFileRoute } from '@tanstack/react-router'
import { getWidgetByKey, publicWidgetConfig } from '../../../../server/widget-store'

function originAllowed(request: Request, allowedDomains: string[]): boolean {
  if (!allowedDomains.length) return true
  const origin = request.headers.get('origin') || request.headers.get('referer') || ''
  if (!origin) return false
  try {
    const host = new URL(origin).hostname
    return allowedDomains.some((domain) => domain === host || host.endsWith(`.${domain}`))
  } catch {
    return false
  }
}

export const Route = createFileRoute('/api/public/widgets/$widgetKey')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const widget = getWidgetByKey(params.widgetKey)
        if (!widget || !widget.enabled || !originAllowed(request, widget.allowedDomains)) {
          return Response.json({ ok: false, error: 'Widget not found' }, { status: 404 })
        }
        return Response.json({
          ok: true,
          widget: publicWidgetConfig(widget),
        })
      },
    },
  },
})
