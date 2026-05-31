/**
 * POST /api/brain/uploads  — upload a file (multipart form or base64 JSON)
 * GET  /api/brain/uploads?profile=X — list uploads for a profile
 *
 * SRS Tranche D.6 operator-facing upload surface.
 */
import { createFileRoute } from '@tanstack/react-router'
import { handleUpload, listUploads } from '../../../server/upload-surface'
import {
  getSessionMetadata,
  getSessionTokenFromCookie,
  isPasswordProtectionEnabled,
} from '../../../server/auth-middleware'

function readSession(request: Request) {
  if (!isPasswordProtectionEnabled()) {
    return { ok: true as const, is_admin: true, username: 'local', profile: null as string | null }
  }
  const token = getSessionTokenFromCookie(request.headers.get('cookie'))
  if (!token) return { ok: false as const, reason: 'no session' }
  const meta = getSessionMetadata(token)
  if (!meta) return { ok: false as const, reason: 'invalid session' }
  return {
    ok: true as const,
    is_admin: meta.is_admin,
    is_customer_admin: meta.is_customer_admin,
    profile: meta.profile,
    username: meta.username,
  }
}

export const Route = createFileRoute('/api/brain/uploads')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = readSession(request)
        if (!session.ok)
          return new Response(JSON.stringify({ error: session.reason }), {
            status: 401,
          })
        const url = new URL(request.url)
        const profile = url.searchParams.get('profile') ?? ''
        if (!profile)
          return new Response(JSON.stringify({ error: 'profile required' }), {
            status: 400,
          })
        const allowed =
          session.is_admin ||
          (session.is_customer_admin && session.profile === profile)
        if (!allowed)
          return new Response(
            JSON.stringify({ error: 'profile out of scope' }),
            { status: 403 },
          )
        const uploads = listUploads(profile)
        return new Response(JSON.stringify({ uploads }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
      POST: async ({ request }) => {
        const session = readSession(request)
        if (!session.ok)
          return new Response(JSON.stringify({ error: session.reason }), {
            status: 401,
          })
        let body: {
          profile?: string
          filename?: string
          mime_type?: string
          content_base64?: string
          classification?:
            | 'document'
            | 'image'
            | 'audio'
            | 'video'
            | 'data'
            | 'unknown'
        }
        try {
          body = await request.json()
        } catch {
          return new Response(JSON.stringify({ error: 'invalid json' }), {
            status: 400,
          })
        }
        const profile = body.profile ?? ''
        if (
          !profile ||
          !body.filename ||
          typeof body.content_base64 !== 'string'
        ) {
          return new Response(
            JSON.stringify({ error: 'profile, filename, content_base64 required' }),
            { status: 400 },
          )
        }
        const allowed =
          session.is_admin ||
          (session.is_customer_admin && session.profile === profile)
        if (!allowed)
          return new Response(
            JSON.stringify({ error: 'profile out of scope' }),
            { status: 403 },
          )
        const result = await handleUpload({
          profile,
          actor: `user:${session.username ?? 'unknown'}`,
          filename: body.filename,
          mime_type: body.mime_type,
          content: body.content_base64,
          classification: body.classification,
        })
        return new Response(JSON.stringify(result), {
          status: result.ok ? 201 : 400,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
