import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import type {
  ArtifactOutput,
  ArtifactStatus,
  CreateArtifactInput,
  PublicArtifact,
} from '../types/artifact'
import { appendEvent } from './event-store'

const DATA_DIR = join(process.cwd(), '.runtime')
const ARTIFACTS_FILE = join(DATA_DIR, 'artifacts.json')

type StoreData = { artifacts: Record<string, PublicArtifact> }

let store: StoreData = { artifacts: {} }

function loadFromDisk(): void {
  try {
    if (!existsSync(ARTIFACTS_FILE)) return
    const raw = readFileSync(ARTIFACTS_FILE, 'utf-8')
    const parsed = JSON.parse(raw) as StoreData
    if (parsed?.artifacts && typeof parsed.artifacts === 'object') {
      store = parsed
    }
  } catch {
    store = { artifacts: {} }
  }
}

function saveToDisk(): void {
  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(ARTIFACTS_FILE, JSON.stringify(store, null, 2), 'utf-8')
}

function publicId(): string {
  return `art_${randomBytes(18).toString('base64url')}`
}

function defaultHtml(title: string, description: string): ArtifactOutput {
  return {
    format: 'html',
    filename: 'index.html',
    contentType: 'text/html; charset=utf-8',
    content: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:860px;margin:48px auto;padding:0 24px;line-height:1.5;color:#172033}h1{font-size:32px}main{border-top:1px solid #d7dde8;padding-top:24px}.muted{color:#667085}</style></head><body><main><h1>${escapeHtml(title)}</h1><p class="muted">${escapeHtml(description || 'Draft artifact')}</p></main></body></html>`,
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

loadFromDisk()

export function listArtifacts(profile?: string | null): PublicArtifact[] {
  let artifacts = Object.values(store.artifacts)
  if (profile) artifacts = artifacts.filter((artifact) => artifact.profile === profile)
  return artifacts.sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getArtifact(id: string): PublicArtifact | null {
  return store.artifacts[id] ?? null
}

export function getArtifactByPublicId(publicIdValue: string): PublicArtifact | null {
  return (
    Object.values(store.artifacts).find(
      (artifact) => artifact.publicId === publicIdValue,
    ) ?? null
  )
}

export function createArtifact(input: CreateArtifactInput): PublicArtifact {
  const now = Date.now()
  const id = randomUUID()
  const title = input.title.trim()
  const description = input.description?.trim() ?? ''
  const outputs =
    input.outputs && input.outputs.length > 0
      ? input.outputs
      : [defaultHtml(title, description)]
  const artifact: PublicArtifact = {
    id,
    publicId: publicId(),
    profile: input.profile || 'default',
    title,
    description,
    type: input.type ?? 'report',
    status: 'draft',
    sourceRefs: input.sourceRefs ?? [],
    redactionNotes: input.redactionNotes ?? [],
    outputs,
    createdBy: input.createdBy ?? 'user',
    approvedBy: null,
    publishedAt: null,
    expiresAt: input.expiresAt ?? null,
    createdAt: now,
    updatedAt: now,
  }
  store.artifacts[id] = artifact
  saveToDisk()
  appendEvent('artifacts', undefined, 'artifact.created', {
    artifactId: id,
    profile: artifact.profile,
    title: artifact.title,
  })
  return artifact
}

export function updateArtifactStatus(
  id: string,
  status: ArtifactStatus,
  actor = 'user',
): PublicArtifact | null {
  const artifact = store.artifacts[id]
  if (!artifact) return null
  artifact.status = status
  artifact.updatedAt = Date.now()
  if (status === 'published') {
    artifact.publishedAt = Date.now()
    artifact.approvedBy = actor
  }
  if (status === 'unpublished') {
    artifact.publishedAt = null
  }
  saveToDisk()
  appendEvent('artifacts', undefined, `artifact.${status}`, {
    artifactId: id,
    profile: artifact.profile,
    actor,
  })
  return artifact
}

export function deleteArtifact(id: string): boolean {
  if (!store.artifacts[id]) return false
  delete store.artifacts[id]
  saveToDisk()
  appendEvent('artifacts', undefined, 'artifact.deleted', { artifactId: id })
  return true
}

export function isPublicArtifactReadable(artifact: PublicArtifact): boolean {
  if (artifact.status !== 'published') return false
  if (artifact.expiresAt && Date.now() > artifact.expiresAt) return false
  return true
}
