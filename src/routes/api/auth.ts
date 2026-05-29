import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { z } from 'zod'
import {
  createSessionCookie,
  generateSessionToken,
  isPasswordProtectionEnabled,
  storeSessionToken,
  verifyPassword,
} from '../../server/auth-middleware'
import {
  hasAnyProfileAuth,
  loginWithProfileCredentials,
} from '../../server/profile-auth'
import {
  getClientIp,
  rateLimit,
  rateLimitResponse,
  requireJsonContentType,
} from '../../server/rate-limit'

const AuthSchema = z.object({
  username: z.string().max(200).optional(),
  password: z.string().max(1000),
})

export const Route = createFileRoute('/api/auth')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        // If neither password protection nor profile auth is configured, reject
        if (!isPasswordProtectionEnabled() && !hasAnyProfileAuth()) {
          return json(
            { ok: false, error: 'Authentication not required' },
            { status: 400 },
          )
        }

        // Rate limit: max 5 auth attempts per minute per IP
        const ip = getClientIp(request)
        if (!rateLimit(`auth:${ip}`, 5, 60_000)) {
          return rateLimitResponse()
        }

        try {
          const raw = await request.json().catch(() => ({}))
          const parsed = AuthSchema.safeParse(raw)

          if (!parsed.success) {
            return json(
              { ok: false, error: 'Invalid request' },
              { status: 400 },
            )
          }

          const { username, password } = parsed.data

          // Profile-auth mode: a username was supplied. Scan all profile
          // auth.yaml files. This takes precedence over the legacy
          // HERMES_PASSWORD path so that once profile auth is configured,
          // username+password is the canonical flow.
          if (username && username.length > 0) {
            const result = await loginWithProfileCredentials(username, password)
            if (!result.ok) {
              await new Promise((resolve) => setTimeout(resolve, 1000))
              const errorMsg =
                result.reason === 'no_users'
                  ? 'No profile users configured'
                  : 'Invalid credentials'
              return json(
                { ok: false, error: errorMsg },
                { status: 401 },
              )
            }

            const token = generateSessionToken()
            storeSessionToken(token, {
              profile: result.profile,
              username: result.username,
              is_admin: result.is_admin,
            })

            return json(
              {
                ok: true,
                profile: result.profile,
                username: result.username,
                is_admin: result.is_admin,
              },
              {
                status: 200,
                headers: {
                  'Set-Cookie': createSessionCookie(token),
                },
              },
            )
          }

          // Legacy mode — single shared HERMES_PASSWORD, implicit admin.
          if (!isPasswordProtectionEnabled()) {
            return json(
              { ok: false, error: 'Username required' },
              { status: 400 },
            )
          }

          const valid = verifyPassword(password)
          if (!valid) {
            await new Promise((resolve) => setTimeout(resolve, 1000))
            return json(
              { ok: false, error: 'Invalid password' },
              { status: 401 },
            )
          }

          const token = generateSessionToken()
          storeSessionToken(token, { is_admin: true })

          return json(
            { ok: true, is_admin: true },
            {
              status: 200,
              headers: {
                'Set-Cookie': createSessionCookie(token),
              },
            },
          )
        } catch (err) {
          if (import.meta.env.DEV) console.error('[/api/auth] Error:', err)
          return json(
            { ok: false, error: 'Authentication failed' },
            { status: 500 },
          )
        }
      },
    },
  },
})
