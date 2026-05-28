import { createFileRoute } from '@tanstack/react-router'
import {
  getArtifactByPublicId,
  isPublicArtifactReadable,
} from '../../../../../../server/artifact-store'

export const Route = createFileRoute('/api/public/artifacts/$publicId/download/$filename')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const artifact = getArtifactByPublicId(params.publicId)
        if (!artifact || !isPublicArtifactReadable(artifact)) {
          return Response.json(
            { ok: false, error: 'Artifact not found' },
            { status: 404 },
          )
        }
        const output = artifact.outputs.find(
          (candidate) => candidate.filename === params.filename,
        )
        if (!output) {
          return Response.json(
            { ok: false, error: 'Download not found' },
            { status: 404 },
          )
        }
        return new Response(output.content, {
          headers: {
            'Content-Type': output.contentType,
            'Content-Disposition': `attachment; filename="${output.filename.replace(/"/g, '')}"`,
          },
        })
      },
    },
  },
})
