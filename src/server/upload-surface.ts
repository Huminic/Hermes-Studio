/**
 * Upload surface (SRS Tranche D.6).
 *
 * Stores files under ~/.hermes/profiles/<profile>/brain/uploads/.
 * Each upload writes:
 *   1. The bytes to disk (sha-256-of-content used as the filename to
 *      collapse duplicates and prevent path injection)
 *   2. A row in the `uploads` table (Brain) via DSG, with classification
 *   3. A `source_references` entry so uploaded files are first-class
 *      sources
 *   4. Optionally embeddings (when the upload is text)
 *
 * Accessible from:
 *   - POST /api/brain/uploads (operator UI)
 *   - MCP tool brain_upload (agent path) — added to brain-mcp-handlers
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { openBrain, now, uuid } from './brain-store'
import { dsgGate } from './dsg-gate'
import { recordAudit } from './metadata-substrate'
import { embedAndStore } from './embeddings'

export type UploadInput = {
  profile: string
  actor: string
  filename: string
  mime_type?: string
  /** Raw bytes (Buffer or base64-encoded string). */
  content: Buffer | string
  /** Classification proposal; DSG may override or block. */
  classification?: 'document' | 'image' | 'audio' | 'video' | 'data' | 'unknown'
  source_refs?: Array<{ kind: string; value: string }>
}

export type UploadResult =
  | {
      ok: true
      id: string
      stored_path: string
      checksum: string
      bytes: number
      classification: string
      embedded: boolean
      gate_event_id: string
    }
  | {
      ok: false
      reason: string
      rule?: string
      gate_event_id?: string
    }

const TEXT_MIMES = [
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/xml',
  'application/x-yaml',
  'application/yaml',
]

export async function handleUpload(
  input: UploadInput,
  options: { profileRoot?: string } = {},
): Promise<UploadResult> {
  const id = uuid()
  const profileRoot =
    options.profileRoot ??
    path.join(
      process.env.BRAIN_PROFILES_ROOT ??
        path.join(os.homedir(), '.hermes', 'profiles'),
      input.profile.replace(/[^a-zA-Z0-9_-]/g, '_'),
    )
  const uploadsDir = path.join(profileRoot, 'brain', 'uploads')
  fs.mkdirSync(uploadsDir, { recursive: true })

  const bytes =
    typeof input.content === 'string'
      ? Buffer.from(input.content, 'base64')
      : input.content
  const checksum = createHash('sha256').update(bytes).digest('hex')
  const safeFilename = sanitizeFilename(input.filename)
  const storedFilename = `${checksum.slice(0, 12)}-${safeFilename}`
  const storedPath = path.join(uploadsDir, storedFilename)
  fs.writeFileSync(storedPath, bytes)

  const classification = classifyUpload(input)
  const sourceRefs = [
    { kind: 'upload', value: id },
    ...(input.source_refs ?? []),
  ]

  const gate = dsgGate({
    profile: input.profile,
    table: 'uploads',
    action: 'create',
    payload: {
      id,
      tenant: input.profile,
      source_refs: sourceRefs,
    },
    actor: input.actor,
  })
  if (!gate.ok) {
    fs.rmSync(storedPath, { force: true })
    return {
      ok: false,
      reason: gate.reason,
      rule: gate.rule,
      gate_event_id: gate.gate_event_id,
    }
  }

  const handle = openBrain(input.profile, {
    profileRoot: options.profileRoot,
  })
  try {
    handle.run(
      `INSERT INTO uploads (
        id, ts, uploader, filename, mime_type, size_bytes,
        storage_path, checksum, classification, source_refs, tenant, embedded
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      now(),
      input.actor,
      input.filename,
      input.mime_type ?? null,
      bytes.byteLength,
      storedPath,
      checksum,
      classification,
      JSON.stringify(sourceRefs),
      input.profile,
      0,
    )
  } finally {
    handle.close()
  }

  // Auto-embed text uploads.
  let embedded = false
  if (classification === 'document' && isTextual(input.mime_type, bytes)) {
    try {
      const text = bytes.toString('utf8').slice(0, 100_000)
      const er = await embedAndStore({
        profile: input.profile,
        actor: 'system:upload-embedder',
        source_table: 'uploads',
        source_id: id,
        chunk_text: text,
      })
      embedded = er.ok
      if (er.ok) {
        const h2 = openBrain(input.profile, { profileRoot: options.profileRoot })
        try {
          h2.run(`UPDATE uploads SET embedded = 1 WHERE id = ?`, id)
        } finally {
          h2.close()
        }
      }
    } catch {
      /* embedding is best-effort */
    }
  }

  recordAudit(input.profile, {
    ts: now(),
    surface: 'brain',
    actor: input.actor,
    action: 'create',
    target_type: 'uploads',
    target_id: id,
    version_after: checksum.slice(0, 16),
    reason: `upload: ${input.filename} (${classification})`,
    outcome: 'ok',
    gate_event_id: gate.gate_event_id,
    source_refs: sourceRefs,
  })
  return {
    ok: true,
    id,
    stored_path: storedPath,
    checksum,
    bytes: bytes.byteLength,
    classification,
    embedded,
    gate_event_id: gate.gate_event_id,
  }
}

function classifyUpload(input: UploadInput): string {
  if (input.classification) return input.classification
  const mt = (input.mime_type ?? '').toLowerCase()
  if (mt.startsWith('image/')) return 'image'
  if (mt.startsWith('audio/')) return 'audio'
  if (mt.startsWith('video/')) return 'video'
  if (mt.startsWith('text/') || TEXT_MIMES.includes(mt)) return 'document'
  if (mt.includes('json') || mt.includes('xml') || mt.includes('csv')) return 'data'
  // Fall back to filename heuristic.
  const ext = path.extname(input.filename).toLowerCase()
  if (['.md', '.txt', '.html', '.htm'].includes(ext)) return 'document'
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) return 'image'
  if (['.csv', '.json', '.xml', '.yaml', '.yml'].includes(ext)) return 'data'
  return 'unknown'
}

function isTextual(mime: string | undefined, bytes: Buffer): boolean {
  if (mime && TEXT_MIMES.includes(mime.toLowerCase())) return true
  // Sniff for binary bytes in first 1024.
  const sample = bytes.subarray(0, 1024)
  for (const b of sample) {
    if (b === 0) return false
  }
  return true
}

function sanitizeFilename(name: string): string {
  // Strip dot-runs first so '../foo' doesn't survive as '..foo'.
  return name
    .replace(/\.{2,}/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 96)
}

export function listUploads(
  profile: string,
  options: { profileRoot?: string; limit?: number } = {},
): Array<{
  id: string
  ts: number
  filename: string
  classification: string
  size_bytes: number
  checksum: string
  embedded: number
}> {
  const handle = openBrain(profile, { profileRoot: options.profileRoot })
  try {
    return handle.all(
      `SELECT id, ts, filename, classification, size_bytes, checksum, embedded
       FROM uploads ORDER BY ts DESC LIMIT ?`,
      options.limit ?? 200,
    )
  } finally {
    handle.close()
  }
}

export function readUpload(
  profile: string,
  id: string,
  options: { profileRoot?: string } = {},
): { ok: boolean; bytes?: Buffer; row?: Record<string, unknown>; reason?: string } {
  const handle = openBrain(profile, { profileRoot: options.profileRoot })
  try {
    const row = handle.get<{
      storage_path: string
      filename: string
      mime_type: string | null
    }>(
      `SELECT storage_path, filename, mime_type FROM uploads WHERE id = ?`,
      id,
    )
    if (!row) return { ok: false, reason: 'upload not found' }
    if (!fs.existsSync(row.storage_path))
      return { ok: false, reason: 'storage missing' }
    return {
      ok: true,
      bytes: fs.readFileSync(row.storage_path),
      row,
    }
  } finally {
    handle.close()
  }
}
