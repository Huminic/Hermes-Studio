import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { z } from 'zod'
import { issueResetToken, buildResetEmail } from '../../server/password-reset'
import { sendNotification } from '../../server/notifications'
import {
  getClientIp,
  rateLimit,
  rateLimitResponse,
  requireJsonContentType,
} from '../../server/rate-limit'

const RequestSchema = z.object({
  email: z.string().email().max(320),
})

/**
 * POST /api/auth/reset-request
 *
 * Body: { email }
 *
 * Always returns 200 (anti-enumeration) on a syntactically valid email.
 * If the email matches a known profile auth username, a single-use token
 * is issued and emailed via central-mcp Resend.
 *
 * Closes CZ-004 (the "Forgot password?" link in the storefront login now
 * has a real backend).
 */
export const Route = createFileRoute('/api/auth/reset-request')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        // Rate limit aggressively: this endpoint dispatches outbound email,
        // and the body shape is unauthenticated. 3 per minute per IP.
        const ip = getClientIp(request)
        if (!rateLimit(`auth-reset:${ip}`, 3, 60_000)) {
          return rateLimitResponse()
        }

        const raw = await request.json().catch(() => ({}))
        const parsed = RequestSchema.safeParse(raw)
        if (!parsed.success) {
          return json(
            { ok: false, error: 'Invalid email' },
            { status: 400 },
          )
        }

        const result = await issueResetToken(parsed.data.email)

        if (result.emailDispatchTarget) {
          const { username, token } = result.emailDispatchTarget
          const { subject, html, text } = buildResetEmail({ username, token })
          await sendNotification({
            to: result.emailDispatchTarget.email,
            subject,
            html,
            text,
          })
        }

        // Always 200 to prevent username enumeration.
        return json({ ok: true })
      },
    },
  },
})
