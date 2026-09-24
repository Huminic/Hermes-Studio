import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Route } from '../routes/api/recordings/$profile/$callId'
import { mintRecordingToken, recordingLocalPath } from '../server/call-recording'

const SECRET = 'route-test-secret'
let root: string

const handler = Route.options.server.handlers.GET

function req(profile: string, callId: string, token: string) {
  return {
    params: { profile, callId },
    request: new Request(
      `http://studio/api/recordings/${profile}/${callId}?t=${encodeURIComponent(token)}`,
    ),
  } as unknown as Parameters<typeof handler>[0]
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'rec-route-'))
  process.env.RECORDINGS_ROOT = root
  process.env.API_SERVER_KEY = SECRET
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
  delete process.env.RECORDINGS_ROOT
  delete process.env.API_SERVER_KEY
})

function writeRecording(profile: string, callId: string, bytes: Buffer) {
  const p = recordingLocalPath(profile, callId, root)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, bytes)
}

describe('GET /api/recordings/$profile/$callId', () => {
  it('streams the audio with a valid token', async () => {
    const bytes = Buffer.from('RIFFserra')
    writeRecording('serra-nissan', 'c1', bytes)
    const token = mintRecordingToken('serra-nissan', 'c1', SECRET)!
    const res = await handler(req('serra-nissan', 'c1', token))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('audio/wav')
    expect(Buffer.from(await res.arrayBuffer())).toEqual(bytes)
  })

  it('403 on a missing token', async () => {
    writeRecording('serra-ford', 'c2', Buffer.from('x'))
    const res = await handler(req('serra-ford', 'c2', ''))
    expect(res.status).toBe(403)
  })

  it('403 on a tampered token', async () => {
    writeRecording('serra-ford', 'c3', Buffer.from('x'))
    const token = mintRecordingToken('serra-ford', 'c3', SECRET)!
    const res = await handler(req('serra-ford', 'c3', token.slice(0, -1) + '0'))
    expect(res.status).toBe(403)
  })

  it('403 when the token binds a different profile than the path', async () => {
    writeRecording('serra-ford', 'c4', Buffer.from('x'))
    const token = mintRecordingToken('serra-nissan', 'c4', SECRET)! // wrong profile
    const res = await handler(req('serra-ford', 'c4', token))
    expect(res.status).toBe(403)
  })

  it('403 when the token binds a different callId than the path', async () => {
    writeRecording('serra-ford', 'c5', Buffer.from('x'))
    const token = mintRecordingToken('serra-ford', 'other', SECRET)!
    const res = await handler(req('serra-ford', 'c5', token))
    expect(res.status).toBe(403)
  })

  it('404 when the token is valid but the file is missing/reaped', async () => {
    const token = mintRecordingToken('serra-ford', 'gone', SECRET)!
    const res = await handler(req('serra-ford', 'gone', token))
    expect(res.status).toBe(404)
  })
})
