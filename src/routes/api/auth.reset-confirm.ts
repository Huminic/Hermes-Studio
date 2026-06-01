import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { z } from 'zod'
import { redeemResetToken } from '../../server/password-reset'
import {
  getClientIp,
  rateLimit,
  rateLimitResponse,
  requireJsonContentType,
} from '../../server/rate-limit'

const ConfirmSchema = z.object({
  token: z.string().min(8).max(2048),
  new_password: z.string().min(8).max(1000),
})

/**
 * POST /api/auth/reset-confirm
 *
 * Body: { token, new_password }
 *
 * Validates the single-use reset token, updates the matching profile's
 * auth.yaml with a fresh scrypt hash of new_password, marks the token used.
 *
 * Returns 200 {ok:true} on success, 400 on invalid/expired/used token or
 * weak password.
 *
 * Closes CZ-005.
 */
export const Route = createFileRoute('/api/auth/reset-confirm')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        const ip = getClientIp(request)
        if (!rateLimit(`auth-reset-confirm:${ip}`, 10, 60_000)) {
          return rateLimitResponse()
        }

        const raw = await request.json().catch(() => ({}))
        const parsed = ConfirmSchema.safeParse(raw)
        if (!parsed.success) {
          return json(
            { ok: false, error: 'Invalid request' },
            { status: 400 },
          )
        }

        const result = await redeemResetToken(
          parsed.data.token,
          parsed.data.new_password,
        )
        if (!result.ok) {
          return json(
            { ok: false, error: result.error },
            { status: 400 },
          )
        }

        return json({
          ok: true,
          profile: result.profile,
          username: result.username,
        })
      },
    },
  },
})
