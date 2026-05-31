/**
 * GET /api/brain/assumptions?profile=X[&include_resolved=true]
 * POST /api/brain/assumptions/resolve
 *
 * Operator-facing surface for SRS A.7 assumption surfacing. The Studio
 * UI hangs off this endpoint to show open assumptions and let the
 * operator accept / reject / clarify them.
 */
import { createFileRoute } from '@tanstack/react-router'
import {
  listOperatorVisibleAssumptions,
  resolveAssumption,
  type AssumptionResolution,
} from '../../../server/lookup-miss'
import {
  getSessionMetadata,
  getSessionTokenFromCookie,
  isPasswordProtectionEnabled,
} from '../../../server/auth-middleware'

function readSession(request: Request): {
  ok: boolean
  is_admin?: boolean
  is_customer_admin?: boolean
  profile?: string | null
  username?: string | null
  reason?: string
} {
  if (!isPasswordProtectionEnabled()) {
    return { ok: true, is_admin: true, username: 'local' }
  }
  const token = getSessionTokenFromCookie(request.headers.get('cookie'))
  if (!token) return { ok: false, reason: 'no session' }
  const meta = getSessionMetadata(token)
  if (!meta) return { ok: false, reason: 'invalid session' }
  return {
    ok: true,
    is_admin: meta.is_admin,
    is_customer_admin: meta.is_customer_admin,
    profile: meta.profile,
    username: meta.username,
  }
}

export const Route = createFileRoute('/api/brain/assumptions')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = readSession(request)
        if (!session.ok) {
          return new Response(JSON.stringify({ error: session.reason }), {
            status: 401,
          })
        }
        const url = new URL(request.url)
        const profile = url.searchParams.get('profile') ?? ''
        const includeResolved =
          url.searchParams.get('include_resolved') === 'true'
        if (!profile) {
          return new Response(JSON.stringify({ error: 'profile required' }), {
            status: 400,
          })
        }
        const allowed =
          session.is_admin ||
          (session.is_customer_admin && session.profile === profile)
        if (!allowed) {
          return new Response(
            JSON.stringify({ error: 'profile out of scope' }),
            { status: 403 },
          )
        }
        const items = listOperatorVisibleAssumptions(profile, {
          includeResolved,
        })
        return new Response(JSON.stringify({ assumptions: items }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
      POST: async ({ request }) => {
        const session = readSession(request)
        if (!session.ok) {
          return new Response(JSON.stringify({ error: session.reason }), {
            status: 401,
          })
        }
        let body: {
          profile?: string
          assumption_id?: string
          resolution?: AssumptionResolution
          resolution_notes?: string
          suggested_change?: {
            target_wiki_path: string
            change_type: 'add' | 'modify' | 'deprecate'
            diff: string
            rationale: string
          }
        }
        try {
          body = await request.json()
        } catch {
          return new Response(JSON.stringify({ error: 'invalid json' }), {
            status: 400,
          })
        }
        const { profile, assumption_id, resolution } = body
        if (!profile || !assumption_id || !resolution) {
          return new Response(
            JSON.stringify({
              error: 'profile, assumption_id, resolution required',
            }),
            { status: 400 },
          )
        }
        const allowed =
          session.is_admin ||
          (session.is_customer_admin && session.profile === profile)
        if (!allowed) {
          return new Response(
            JSON.stringify({ error: 'profile out of scope' }),
            { status: 403 },
          )
        }
        const res = resolveAssumption({
          profile,
          assumption_id,
          resolution,
          resolved_by: `user:${session.username ?? 'unknown'}`,
          resolution_notes: body.resolution_notes,
          suggested_change: body.suggested_change,
        })
        return new Response(JSON.stringify(res), {
          status: res.ok ? 200 : 400,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
