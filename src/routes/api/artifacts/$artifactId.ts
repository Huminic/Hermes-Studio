import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAdmin } from '../../../server/auth-middleware'
import { requireJsonContentType } from '../../../server/rate-limit'
import {
  deleteArtifact,
  getArtifact,
  updateArtifactStatus,
} from '../../../server/artifact-store'
import type { ArtifactStatus } from '../../../types/artifact'

const STATUSES: ArtifactStatus[] = ['draft', 'published', 'unpublished', 'expired']

export const Route = createFileRoute('/api/artifacts/$artifactId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAdmin(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const artifact = getArtifact(params.artifactId)
        if (!artifact) {
          return json({ ok: false, error: 'Artifact not found' }, { status: 404 })
        }
        return json({ ok: true, artifact })
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
        const status = body.status
        if (typeof status !== 'string' || !STATUSES.includes(status as ArtifactStatus)) {
          return json({ ok: false, error: 'Invalid status' }, { status: 400 })
        }
        const artifact = updateArtifactStatus(
          params.artifactId,
          status as ArtifactStatus,
          typeof body.actor === 'string' ? body.actor : 'user',
        )
        if (!artifact) {
          return json({ ok: false, error: 'Artifact not found' }, { status: 404 })
        }
        return json({ ok: true, artifact })
      },

      DELETE: async ({ request, params }) => {
        if (!isAdmin(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const deleted = deleteArtifact(params.artifactId)
        if (!deleted) {
          return json({ ok: false, error: 'Artifact not found' }, { status: 404 })
        }
        return json({ ok: true })
      },
    },
  },
})
