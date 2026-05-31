import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openBrain } from '@/server/brain-store'
import {
  embedAndStore,
  searchSimilar,
  getModelForProfile,
  reembed,
} from '@/server/embeddings'

let tmpRoot: string

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'embeddings-test-'))
  process.env.BRAIN_PROFILES_ROOT = path.join(tmpRoot, '.hermes', 'profiles')
  delete process.env.EMBED_MODEL_PROVIDER
  const profileRoot = path.join(tmpRoot, '.hermes', 'profiles', 'fixture')
  fs.mkdirSync(profileRoot, { recursive: true })
  const handle = openBrain('fixture', { profileRoot })
  handle.close()
})

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})

describe('embeddings pipeline (SRS B.6)', () => {
  it('uses local-hash model by default', () => {
    const m = getModelForProfile('fixture')
    expect(m.id).toBe('local-hash-v1')
    expect(m.dim).toBe(384)
  })

  it('embedAndStore writes a row with model identity', async () => {
    const r = await embedAndStore({
      profile: 'fixture',
      actor: 'system:embeddings-test',
      source_table: 'wiki',
      source_id: 'knowledge/published/foo.md',
      chunk_text: 'Cedar Ridge owns three rooftops in the metro area.',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.model).toBe('local-hash-v1')
      expect(r.dim).toBe(384)
    }
    const handle = openBrain('fixture')
    try {
      const rows = handle.all<{ model: string }>(
        `SELECT model FROM embeddings`,
      )
      expect(rows.length).toBe(1)
      expect(rows[0].model).toBe('local-hash-v1')
    } finally {
      handle.close()
    }
  })

  it('searchSimilar returns ranked hits and the most similar comes first', async () => {
    await embedAndStore({
      profile: 'fixture',
      actor: 'system:test',
      source_table: 'wiki',
      source_id: 'a',
      chunk_text: 'service hours seven thirty to six',
    })
    await embedAndStore({
      profile: 'fixture',
      actor: 'system:test',
      source_table: 'wiki',
      source_id: 'b',
      chunk_text: 'parts department phone number',
    })
    await embedAndStore({
      profile: 'fixture',
      actor: 'system:test',
      source_table: 'wiki',
      source_id: 'c',
      chunk_text: 'service department open seven thirty to six',
    })
    const hits = await searchSimilar('fixture', 'service hours from 730 to 6', {
      topK: 3,
    })
    expect(hits.length).toBeGreaterThan(0)
    // a and c should both rank above b for a service-hours query.
    const top2 = hits.slice(0, 2).map((h) => h.source_id)
    expect(top2).toContain('a')
    expect(top2).toContain('c')
    expect(hits[hits.length - 1].source_id).toBe('b')
  })

  it('reembed skips rows already on the current model', async () => {
    await embedAndStore({
      profile: 'fixture',
      actor: 'system:test',
      source_table: 'wiki',
      source_id: 'a',
      chunk_text: 'first chunk',
    })
    const report = await reembed('fixture', 'wiki', [
      { source_id: 'a', chunk_text: 'first chunk' },
    ])
    expect(report.skipped).toBe(1)
    expect(report.embedded).toBe(0)
  })
})
