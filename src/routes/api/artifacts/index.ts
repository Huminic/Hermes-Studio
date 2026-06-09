import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAdmin } from '../../../server/auth-middleware'
import { requireJsonContentType } from '../../../server/rate-limit'
import {
  createArtifact,
  listArtifacts,
} from '../../../server/artifact-store'
import type { ArtifactOutput, ArtifactType } from '../../../types/artifact'

const TYPES: ArtifactType[] = ['report', 'download', 'landing_page', 'document']

export const Route = createFileRoute('/api/artifacts/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAdmin(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const url = new URL(request.url)
        const profile = url.searchParams.get('profile')
        return json({ ok: true, artifacts: listArtifacts(profile) })
      },

      POST: async ({ request }) => {
        if (!isAdmin(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        const body = (await request.json().catch(() => ({}))) as Record<
          string,
          unknown
        >
        const title = typeof body.title === 'string' ? body.title.trim() : ''
        const profile = typeof body.profile === 'string' ? body.profile.trim() : ''
        if (!title || !profile) {
          return json(
            { ok: false, error: 'title and profile are required' },
            { status: 400 },
          )
        }
        const outputs = Array.isArray(body.outputs)
          ? (body.outputs as ArtifactOutput[])
          : undefined
        const type =
          typeof body.type === 'string' && TYPES.includes(body.type as ArtifactType)
            ? (body.type as ArtifactType)
            : 'report'
        const artifact = createArtifact({
          profile,
          title,
          type,
          description:
            typeof body.description === 'string' ? body.description : undefined,
          sourceRefs: Array.isArray(body.sourceRefs)
            ? (body.sourceRefs as unknown[]).filter(
                (value): value is string => typeof value === 'string',
              )
            : undefined,
          redactionNotes: Array.isArray(body.redactionNotes)
            ? (body.redactionNotes as unknown[]).filter(
                (value): value is string => typeof value === 'string',
              )
            : undefined,
          outputs,
          createdBy: typeof body.createdBy === 'string' ? body.createdBy : 'user',
          expiresAt:
            typeof body.expiresAt === 'number' || body.expiresAt === null
              ? (body.expiresAt as number | null)
              : undefined,
        })
        return json({ ok: true, artifact }, { status: 201 })
      },
    },
  },
})
