import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  mintRecordingToken,
  verifyRecordingToken,
  recordingLocalPath,
  downloadRecording,
  reapOldRecordings,
  RECORDING_MAX_AGE_MS,
} from '../server/call-recording'

const SECRET = 'test-secret-abc'

describe('recording token (HMAC, binds profile|callId)', () => {
  it('round-trips a valid token', () => {
    const tok = mintRecordingToken('serra-nissan', 'call_123', SECRET)!
    expect(tok).toBeTruthy()
    expect(verifyRecordingToken(tok, { secret: SECRET })).toEqual({
      profile: 'serra-nissan',
      callId: 'call_123',
    })
  })

  it('rejects a tampered signature', () => {
    const tok = mintRecordingToken('serra-ford', 'call_9', SECRET)!
    const bad = tok.slice(0, -2) + (tok.endsWith('aa') ? 'bb' : 'aa')
    expect(verifyRecordingToken(bad, { secret: SECRET })).toBeNull()
  })

  it('rejects a profile mismatch', () => {
    const tok = mintRecordingToken('serra-ford', 'call_9', SECRET)!
    expect(
      verifyRecordingToken(tok, { secret: SECRET, expectedProfile: 'serra-nissan' }),
    ).toBeNull()
  })

  it('rejects a token signed with a different secret', () => {
    const tok = mintRecordingToken('serra-ford', 'call_9', SECRET)!
    expect(verifyRecordingToken(tok, { secret: 'other-secret' })).toBeNull()
  })

  it('returns null when no secret is configured', () => {
    expect(mintRecordingToken('serra-ford', 'call_9', null)).toBeNull()
  })
})

describe('recordingLocalPath (traversal-safe)', () => {
  it('joins root + sanitized profile + callId.wav', () => {
    const p = recordingLocalPath('serra-ford', 'call_abc', '/tmp/recs')
    expect(p).toBe(path.join('/tmp/recs', 'serra-ford', 'call_abc.wav'))
  })

  it('strips path-traversal characters from profile and callId', () => {
    const p = recordingLocalPath('../etc', '../../secret/id', '/tmp/recs')
    expect(p.startsWith(path.join('/tmp/recs') + path.sep)).toBe(true)
    expect(p).not.toContain('..')
  })
})

describe('downloadRecording', () => {
  let root: string
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'rec-dl-'))
  })
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('writes the file (non-world-readable) and returns its path on success', async () => {
    const bytes = Buffer.from('RIFFfakewav')
    const res = await downloadRecording({
      profile: 'serra-nissan',
      callId: 'c1',
      url: 'https://vapi/rec.wav',
      root,
      fetchImpl: async () =>
        new Response(bytes, { status: 200, headers: { 'content-type': 'audio/wav' } }),
    })
    expect(res).not.toBeNull()
    const expected = recordingLocalPath('serra-nissan', 'c1', root)
    expect(res!.path).toBe(expected)
    expect(fs.readFileSync(expected)).toEqual(bytes)
    // PHI: not world-readable
    expect(fs.statSync(expected).mode & 0o077).toBe(0)
  })

  it('returns null and writes nothing on a non-ok response', async () => {
    const res = await downloadRecording({
      profile: 'serra-nissan',
      callId: 'c2',
      url: 'https://vapi/expired',
      root,
      fetchImpl: async () => new Response('InvalidArgument', { status: 400 }),
    })
    expect(res).toBeNull()
    expect(fs.existsSync(recordingLocalPath('serra-nissan', 'c2', root))).toBe(false)
  })

  it('returns null when fetch throws (never propagates)', async () => {
    const res = await downloadRecording({
      profile: 'serra-nissan',
      callId: 'c3',
      url: 'https://vapi/boom',
      root,
      fetchImpl: async () => {
        throw new Error('network down')
      },
    })
    expect(res).toBeNull()
  })
})

describe('reapOldRecordings (age-based)', () => {
  let root: string
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'rec-reap-'))
  })
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('deletes files older than max age, keeps newer, returns the deleted paths', () => {
    const now = 1_000_000_000_000
    const dir = path.join(root, 'serra-ford')
    fs.mkdirSync(dir, { recursive: true })
    const oldFile = path.join(dir, 'old.wav')
    const newFile = path.join(dir, 'new.wav')
    fs.writeFileSync(oldFile, 'x')
    fs.writeFileSync(newFile, 'y')
    const oldTime = (now - RECORDING_MAX_AGE_MS - 60_000) / 1000
    const newTime = (now - 60_000) / 1000
    fs.utimesSync(oldFile, oldTime, oldTime)
    fs.utimesSync(newFile, newTime, newTime)

    const deleted = reapOldRecordings({ root, now, maxAgeMs: RECORDING_MAX_AGE_MS })
    expect(deleted).toEqual([oldFile])
    expect(fs.existsSync(oldFile)).toBe(false)
    expect(fs.existsSync(newFile)).toBe(true)
  })

  it('is a no-op when the root does not exist', () => {
    const deleted = reapOldRecordings({ root: path.join(root, 'nope'), now: Date.now() })
    expect(deleted).toEqual([])
  })
})
