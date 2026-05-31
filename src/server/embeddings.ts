/**
 * Embeddings pipeline (SRS Tranche B.6).
 *
 * Per-profile vector storage at ~/.hermes/profiles/<profile>/brain/vectors/.
 * The DSG governs reads and writes via the embeddings table.
 *
 * Model layering:
 *   - Default: deterministic local hash-based pseudo-embedding (no network).
 *     Used when no other model is configured. Treats the chunk text as a
 *     bag of 3-grams and hashes them into a fixed-dim vector. Adequate for
 *     evals and offline retrieval; NOT a quality model.
 *   - Configurable: env-driven swap to a remote model (OpenAI, Voyage, etc.)
 *     or a local sentence-transformers process. Per-profile via
 *     `EMBED_MODEL_PROVIDER` (`local-hash | openai | huggingface | minilm`).
 *
 * Per SRS B.6 each row records the model identity used to embed it, so
 * a model swap creates a re-embed pass without losing the prior rows.
 */

import { createHash } from 'node:crypto'
import { openBrain, now, uuid } from './brain-store'
import { dsgGate } from './dsg-gate'

export type EmbeddingModel = {
  id: string
  dim: number
  embed: (text: string) => Promise<Float32Array> | Float32Array
}

export type EmbeddingProvider =
  | 'local-hash'
  | 'openai'
  | 'huggingface'
  | 'minilm'

const LOCAL_HASH_DIM = 384

function localHashEmbed(text: string): Float32Array {
  const vec = new Float32Array(LOCAL_HASH_DIM)
  if (!text) return vec
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  // Bag of 1-grams and 3-grams hashed into LOCAL_HASH_DIM dimensions.
  for (const tok of tokens) {
    const h = sha(tok)
    for (let i = 0; i < h.length && i < 4; i++) {
      const idx = h[i] % LOCAL_HASH_DIM
      vec[idx] += 1
    }
  }
  for (let i = 0; i < tokens.length - 2; i++) {
    const tri = tokens.slice(i, i + 3).join(' ')
    const h = sha(tri)
    for (let j = 0; j < h.length && j < 4; j++) {
      const idx = h[j] % LOCAL_HASH_DIM
      vec[idx] += 0.5
    }
  }
  // L2 normalize
  let norm = 0
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i]
  norm = Math.sqrt(norm) || 1
  for (let i = 0; i < vec.length; i++) vec[i] /= norm
  return vec
}

function sha(s: string): Uint8Array {
  return new Uint8Array(createHash('sha1').update(s).digest())
}

const DEFAULT_MODEL: EmbeddingModel = {
  id: 'local-hash-v1',
  dim: LOCAL_HASH_DIM,
  embed: (t) => localHashEmbed(t),
}

const REGISTERED_MODELS: Map<EmbeddingProvider, EmbeddingModel> = new Map([
  ['local-hash', DEFAULT_MODEL],
])

export function registerModel(
  provider: EmbeddingProvider,
  model: EmbeddingModel,
): void {
  REGISTERED_MODELS.set(provider, model)
}

export function getModelForProfile(profile: string): EmbeddingModel {
  const provider = (process.env[`EMBED_MODEL_${profile.toUpperCase().replace(/-/g, '_')}`] ??
    process.env.EMBED_MODEL_PROVIDER ??
    'local-hash') as EmbeddingProvider
  return REGISTERED_MODELS.get(provider) ?? DEFAULT_MODEL
}

export type EmbedInput = {
  profile: string
  actor: string
  source_table: string
  source_id: string
  chunk_text: string
}

export type EmbedResult =
  | { ok: true; id: string; model: string; dim: number; gate_event_id: string }
  | { ok: false; reason: string; rule?: string; gate_event_id?: string }

export async function embedAndStore(
  input: EmbedInput,
  options: { profileRoot?: string } = {},
): Promise<EmbedResult> {
  const id = uuid()
  const model = getModelForProfile(input.profile)
  const vector = await Promise.resolve(model.embed(input.chunk_text))

  const tenanted = {
    id,
    tenant: input.profile,
    source_refs: [
      { kind: 'embed', value: `${input.source_table}:${input.source_id}` },
    ],
  }
  const gate = dsgGate({
    profile: input.profile,
    table: 'embeddings',
    action: 'create',
    payload: tenanted,
    actor: input.actor,
  })
  if (!gate.ok) {
    return {
      ok: false,
      reason: gate.reason,
      rule: gate.rule,
      gate_event_id: gate.gate_event_id,
    }
  }
  const handle = openBrain(input.profile, { profileRoot: options.profileRoot })
  try {
    const buf = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength)
    handle.run(
      `INSERT INTO embeddings (id, ts, source_table, source_id, model, dim, vector, chunk_text, tenant)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      now(),
      input.source_table,
      input.source_id,
      model.id,
      model.dim,
      buf,
      input.chunk_text.slice(0, 4000),
      input.profile,
    )
    return { ok: true, id, model: model.id, dim: model.dim, gate_event_id: gate.gate_event_id }
  } finally {
    handle.close()
  }
}

export type SimilarityHit = {
  id: string
  source_table: string
  source_id: string
  model: string
  similarity: number
  chunk_text: string | null
}

/**
 * Naive vector search: full scan + cosine similarity. Acceptable for
 * the demo-scale corpora the test fixtures produce; production-scale
 * would swap to an indexed vector store via the registerModel hook.
 */
export async function searchSimilar(
  profile: string,
  query: string,
  options: {
    profileRoot?: string
    topK?: number
    sourceTable?: string
  } = {},
): Promise<Array<SimilarityHit>> {
  const model = getModelForProfile(profile)
  const qVec = await Promise.resolve(model.embed(query))
  const handle = openBrain(profile, { profileRoot: options.profileRoot })
  try {
    const rows = handle.all<{
      id: string
      source_table: string
      source_id: string
      model: string
      vector: Buffer
      chunk_text: string | null
    }>(
      options.sourceTable
        ? `SELECT id, source_table, source_id, model, vector, chunk_text
           FROM embeddings WHERE source_table = ? AND model = ?`
        : `SELECT id, source_table, source_id, model, vector, chunk_text
           FROM embeddings WHERE model = ?`,
      ...(options.sourceTable
        ? [options.sourceTable, model.id]
        : [model.id]),
    )
    const hits: Array<SimilarityHit> = rows
      .map((r) => {
        const v = new Float32Array(
          r.vector.buffer,
          r.vector.byteOffset,
          r.vector.byteLength / 4,
        )
        return {
          id: r.id,
          source_table: r.source_table,
          source_id: r.source_id,
          model: r.model,
          similarity: cosine(qVec, v),
          chunk_text: r.chunk_text,
        }
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, options.topK ?? 10)
    return hits
  } finally {
    handle.close()
  }
}

function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return dot
}

export type ReembedReport = {
  profile: string
  source_table: string
  embedded: number
  skipped: number
  errors: Array<string>
}

/**
 * Re-embed every row in `source_table` whose embedding either does not
 * exist or used a different model than the current profile model.
 * Used by SRS B.6 acceptance ("A model swap produces a clean re-embed
 * pass with no data loss").
 */
export async function reembed(
  profile: string,
  source_table: string,
  rowsAndText: Array<{ source_id: string; chunk_text: string }>,
  options: { profileRoot?: string } = {},
): Promise<ReembedReport> {
  const report: ReembedReport = {
    profile,
    source_table,
    embedded: 0,
    skipped: 0,
    errors: [],
  }
  const model = getModelForProfile(profile)
  const handle = openBrain(profile, { profileRoot: options.profileRoot })
  for (const row of rowsAndText) {
    try {
      const existing = handle.get<{ model: string }>(
        `SELECT model FROM embeddings WHERE source_table = ? AND source_id = ? ORDER BY ts DESC LIMIT 1`,
        source_table,
        row.source_id,
      )
      if (existing?.model === model.id) {
        report.skipped++
        continue
      }
      const res = await embedAndStore(
        {
          profile,
          actor: 'system:embeddings-reembed',
          source_table,
          source_id: row.source_id,
          chunk_text: row.chunk_text,
        },
        options,
      )
      if (res.ok) report.embedded++
      else report.errors.push(`${row.source_id}: ${res.reason}`)
    } catch (err) {
      report.errors.push(`${row.source_id}: ${(err as Error).message}`)
    }
  }
  handle.close()
  return report
}
