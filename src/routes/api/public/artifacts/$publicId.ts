import { createFileRoute } from '@tanstack/react-router'
import {
  getArtifactByPublicId,
  isPublicArtifactReadable,
} from '../../../../server/artifact-store'

export const Route = createFileRoute('/api/public/artifacts/$publicId')({
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
        const html = artifact.outputs.find((output) => output.format === 'html')
        if (html) {
          return new Response(html.content, {
            status: 200,
            headers: {
              'Content-Type': html.contentType,
              'Cache-Control': 'public, max-age=60',
            },
          })
        }
        return Response.json({
          ok: true,
          artifact: {
            publicId: artifact.publicId,
            title: artifact.title,
            description: artifact.description,
            type: artifact.type,
            profile: artifact.profile,
            outputs: artifact.outputs.map((output) => ({
              format: output.format,
              filename: output.filename,
              contentType: output.contentType,
            })),
          },
        })
      },
    },
  },
})
