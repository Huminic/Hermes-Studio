import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAdmin } from '../../../../server/auth-middleware'
import { requireJsonContentType } from '../../../../server/rate-limit'
import { getArtifact } from '../../../../server/artifact-store'
import { appendEvent } from '../../../../server/event-store'
import type { SendArtifactInput } from '../../../../types/artifact'

function artifactUrl(request: Request, publicId: string): string {
  const url = new URL(request.url)
  return `${url.origin}/api/public/artifacts/${publicId}`
}

export const Route = createFileRoute('/api/artifacts/$artifactId/send')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!isAdmin(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        const artifact = getArtifact(params.artifactId)
        if (!artifact) {
          return json({ ok: false, error: 'Artifact not found' }, { status: 404 })
        }
        if (artifact.status !== 'published') {
          return json(
            { ok: false, error: 'Artifact must be published before sending' },
            { status: 400 },
          )
        }

        const input = (await request.json().catch(() => ({}))) as SendArtifactInput
        const to = Array.isArray(input.to)
          ? input.to.filter((value) => typeof value === 'string' && value.includes('@'))
          : []
        if (!to.length) {
          return json({ ok: false, error: 'At least one recipient is required' }, { status: 400 })
        }

        const apiKey = process.env.RESEND_API_KEY
        const from = process.env.RESEND_FROM_EMAIL
        if (!apiKey || !from) {
          return json(
            {
              ok: false,
              error:
                'Resend is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL on the Studio server.',
            },
            { status: 400 },
          )
        }

        const link = artifactUrl(request, artifact.publicId)
        const subject = input.subject || artifact.title
        const message = input.message || `A Huminic Studio artifact is ready: ${link}`
        const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;color:#111827"><p>${message
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')}</p><p><a href="${link}">Open ${artifact.title}</a></p></div>`

        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to,
            subject,
            html,
          }),
        })
        const result = (await response.json().catch(() => ({}))) as Record<string, unknown>
        if (!response.ok) {
          return json({ ok: false, error: 'Resend send failed', detail: result }, { status: 502 })
        }

        appendEvent('artifacts', undefined, 'artifact.sent', {
          artifactId: artifact.id,
          profile: artifact.profile,
          recipients: to,
          resendId: result.id,
        })

        return json({ ok: true, link, resend: result })
      },
    },
  },
})
