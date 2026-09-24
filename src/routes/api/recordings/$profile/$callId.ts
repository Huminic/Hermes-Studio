/**
 * GET /api/recordings/$profile/$callId?t=<token>
 *
 * Authenticated serving route for stored Vapi call recordings (P3). The link in
 * the dealer email points here instead of at Vapi's expiring presigned R2 URL.
 * Access requires a valid HMAC token binding (profile, callId) — the file is
 * PHI (`hipaa-recordings`), so an unauthenticated or mismatched request is 403.
 */
import fs from 'node:fs'
import { createFileRoute } from '@tanstack/react-router'
import {
  verifyRecordingToken,
  recordingLocalPath,
} from '../../../../server/call-recording'

export const Route = createFileRoute('/api/recordings/$profile/$callId')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const token = new URL(request.url).searchParams.get('t') ?? ''
        const verified = verifyRecordingToken(token, {
          expectedProfile: params.profile,
        })
        // Token must verify AND bind to the exact profile+callId in the path.
        if (!verified || verified.callId !== params.callId) {
          return Response.json({ ok: false, error: 'Unauthorized' }, { status: 403 })
        }
        let data: Buffer
        try {
          data = fs.readFileSync(recordingLocalPath(verified.profile, verified.callId))
        } catch {
          return Response.json(
            { ok: false, error: 'Recording not found' },
            { status: 404 },
          )
        }
        return new Response(new Uint8Array(data), {
          headers: {
            'Content-Type': 'audio/wav',
            'Content-Disposition': `inline; filename="${params.callId.replace(/["\r\n]/g, '')}.wav"`,
            'Cache-Control': 'private, no-store',
          },
        })
      },
    },
  },
})
