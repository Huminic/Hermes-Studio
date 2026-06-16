/**
 * GET/POST /api/customer/data-uploads
 *
 * Customer-scoped Data Store upload surface for InfoStore. Wraps the governed
 * Brain upload path so partner/customer workspace sessions can upload reports
 * and see recent uploads without using the operator-only Brain UI.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireJsonContentType } from '../../../server/rate-limit'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../server/customer-auth'
import { handleUpload, listUploads } from '../../../server/upload-surface'

export const Route = createFileRoute('/api/customer/data-uploads')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const profile = url.searchParams.get('profile') ?? ''
        if (!profile) {
          return json({ ok: false, error: 'profile required' }, { status: 400 })
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }
        return json({
          ok: true,
          uploads: listUploads(profile, { limit: 25 }),
        })
      },
      POST: async ({ request }) => {
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        const body = (await request.json().catch(() => ({}))) as Record<
          string,
          unknown
        >
        const profile = typeof body.profile === 'string' ? body.profile : ''
        const filename = typeof body.filename === 'string' ? body.filename : ''
        const contentBase64 =
          typeof body.content_base64 === 'string' ? body.content_base64 : ''
        if (!profile || !filename || !contentBase64) {
          return json(
            {
              ok: false,
              error: 'profile, filename, and content_base64 are required',
            },
            { status: 400 },
          )
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }
        const result = await handleUpload({
          profile,
          actor: `user:${session?.username ?? 'unknown'}`,
          filename,
          mime_type:
            typeof body.mime_type === 'string' ? body.mime_type : undefined,
          content: contentBase64,
          classification:
            body.classification === 'document' ||
            body.classification === 'data' ||
            body.classification === 'unknown'
              ? body.classification
              : undefined,
        })
        if (!result.ok) {
          return json(
            {
              ok: false,
              error: result.reason,
              rule: result.rule,
            },
            { status: 400 },
          )
        }
        return json({
          ok: true,
          upload: {
            id: result.id,
            filename,
            classification: result.classification,
            bytes: result.bytes,
            embedded: result.embedded,
          },
          uploads: listUploads(profile, { limit: 25 }),
        })
      },
    },
  },
})
