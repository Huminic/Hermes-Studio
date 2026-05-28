export type ArtifactType = 'report' | 'download' | 'landing_page' | 'document'
export type ArtifactStatus = 'draft' | 'published' | 'unpublished' | 'expired'
export type ArtifactFormat = 'html' | 'markdown' | 'csv' | 'json' | 'pdf'

export interface ArtifactOutput {
  format: ArtifactFormat
  filename: string
  contentType: string
  content: string
}

export interface PublicArtifact {
  id: string
  publicId: string
  profile: string
  title: string
  description: string
  type: ArtifactType
  status: ArtifactStatus
  sourceRefs: string[]
  redactionNotes: string[]
  outputs: ArtifactOutput[]
  createdBy: string
  approvedBy: string | null
  publishedAt: number | null
  expiresAt: number | null
  createdAt: number
  updatedAt: number
}

export interface CreateArtifactInput {
  profile: string
  title: string
  description?: string
  type?: ArtifactType
  sourceRefs?: string[]
  redactionNotes?: string[]
  outputs?: ArtifactOutput[]
  createdBy?: string
  expiresAt?: number | null
}

export interface SendArtifactInput {
  to: string[]
  subject: string
  message: string
  includeDownloads?: boolean
}
