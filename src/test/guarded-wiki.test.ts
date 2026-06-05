import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string
const PROFILE = 'huminic'

beforeEach(async () => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'guarded-wiki-test-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  fs.mkdirSync(path.join(tmpHome, '.hermes', 'profiles', PROFILE, 'company-wiki'), {
    recursive: true,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

const PAGE = 'company-wiki/policies/time-off.md'
const BODY = `---
title: Time Off Policy
type: policy
status: published
---
# Time Off Policy

- Paid time off must be requested at least 1 day in advance.`

describe('guardedWikiWrite', () => {
  it('gates, writes, AND memorializes to the Brain under a recognized actor', async () => {
    const { guardedWikiWrite } = await import('@/server/guarded-wiki')
    const r = guardedWikiWrite({
      profile: PROFILE,
      relPath: PAGE,
      content: BODY,
      actor: 'user:duane',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.action).toBe('create')
    // The page was actually written.
    const onDisk = fs.readFileSync(
      path.join(tmpHome, '.hermes', 'profiles', PROFILE, PAGE),
      'utf8',
    )
    expect(onDisk).toContain('Time Off Policy')
    // The change was captured to the Brain (the spike's failure — now passes).
    expect(r.memorialized).toBe(true)
    expect(r.memo_note).toBeUndefined()

    const { openBrain } = await import('@/server/brain-store')
    const h = openBrain(PROFILE, {})
    const rows = h.all(
      `SELECT type, subject_id FROM events WHERE type='knowledge_change'`,
    ) as Array<{ type: string; subject_id: string }>
    expect(rows.some((e) => e.subject_id === PAGE)).toBe(true)
  })

  it('rejects an unrecognized actor form before any write', async () => {
    const { guardedWikiWrite } = await import('@/server/guarded-wiki')
    const r = guardedWikiWrite({
      profile: PROFILE,
      relPath: PAGE,
      content: BODY,
      actor: 'spike:whatever',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.rule).toBe('unknown-actor')
    expect(
      fs.existsSync(path.join(tmpHome, '.hermes', 'profiles', PROFILE, PAGE)),
    ).toBe(false)
  })

  it('blocks a write into a protected tree (governance/)', async () => {
    const { guardedWikiWrite } = await import('@/server/guarded-wiki')
    const r = guardedWikiWrite({
      profile: PROFILE,
      relPath: 'governance/policy.md',
      content: BODY,
      actor: 'user:duane',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.rule).toBe('protected-tree')
  })

  it('blocks a save with no frontmatter', async () => {
    const { guardedWikiWrite } = await import('@/server/guarded-wiki')
    const r = guardedWikiWrite({
      profile: PROFILE,
      relPath: 'company-wiki/loose.md',
      content: 'just a body, no frontmatter',
      actor: 'user:duane',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.rule).toBe('missing-frontmatter')
  })
})
