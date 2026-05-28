import { createFileRoute } from '@tanstack/react-router'
import { getWidgetByKey } from '../../../../../server/widget-store'
import type { WidgetChannel } from '../../../../../types/widget'

export const Route = createFileRoute('/api/public/widgets/$widgetKey/sessions')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const widget = getWidgetByKey(params.widgetKey)
        if (!widget || !widget.enabled) {
          return Response.json({ ok: false, error: 'Widget not found' }, { status: 404 })
        }
        const body = (await request.json().catch(() => ({}))) as Record<
          string,
          unknown
        >
        const agentId = typeof body.agentId === 'string' ? body.agentId : ''
        const channel = typeof body.channel === 'string' ? body.channel : 'chat'
        const agent = widget.agents.find(
          (candidate) =>
            candidate.agentId === agentId &&
            candidate.customerFacing &&
            candidate.channels.includes(channel as WidgetChannel),
        )
        if (!agent) {
          return Response.json({ ok: false, error: 'Agent/channel not enabled' }, { status: 400 })
        }
        return Response.json(
          {
            ok: false,
            error:
              'Session minting is not connected yet. Map this agent to Vapi/Tavus during migration and add server credentials before enabling live sessions.',
            profile: widget.profile,
            agentId,
            channel,
          },
          { status: 501 },
        )
      },
    },
  },
})
