import { describe, it, expect } from 'vitest'
import { evaluatePromote, evaluateWikiSave } from '@/server/ksg-gate'

describe('evaluateWikiSave', () => {
  it('blocks writes into canon/', () => {
    const r = evaluateWikiSave({
      relativePath: 'canon/runtime-reference.md',
      previousContent: null,
      newContent: '---\ntitle: x\ntype: y\nstatus: draft\n---\n',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.rule).toBe('protected-tree')
    }
  })

  it('blocks writes into governance/', () => {
    const r = evaluateWikiSave({
      relativePath: 'governance/scope-contract.md',
      previousContent: null,
      newContent: '---\ntitle: x\ntype: y\nstatus: draft\n---\n',
    })
    expect(r.ok).toBe(false)
  })

  it('blocks rewriting a status: canonical page', () => {
    const r = evaluateWikiSave({
      relativePath: 'knowledge/published/foo.md',
      previousContent:
        '---\ntitle: foo\ntype: report\nstatus: canonical\n---\nbody',
      newContent:
        '---\ntitle: foo\ntype: report\nstatus: canonical\n---\nedited',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.rule).toBe('canonical-frozen')
    }
  })

  it('requires frontmatter on a save', () => {
    const r = evaluateWikiSave({
      relativePath: 'knowledge/drafts/foo.md',
      previousContent: null,
      newContent: 'just a body',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.rule).toBe('missing-frontmatter')
    }
  })

  it('allows valid draft saves with warnings for incomplete frontmatter', () => {
    const r = evaluateWikiSave({
      relativePath: 'knowledge/drafts/foo.md',
      previousContent: null,
      newContent: '---\ntitle: foo\n---\nbody',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.warnings.length).toBeGreaterThan(0)
    }
  })

  it('allows valid draft saves with full frontmatter and no warnings', () => {
    const r = evaluateWikiSave({
      relativePath: 'knowledge/drafts/foo.md',
      previousContent: null,
      newContent:
        '---\ntitle: foo\ntype: note\nstatus: draft\n---\nbody',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.warnings).toHaveLength(0)
    }
  })
})

describe('evaluatePromote', () => {
  it('promotes inbox to drafts', () => {
    const r = evaluatePromote({ relativePath: 'inbox/foo.md' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.to).toBe('drafts/foo.md')
    }
  })

  it('promotes drafts to published', () => {
    const r = evaluatePromote({ relativePath: 'drafts/foo.md' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.to).toBe('published/foo.md')
    }
  })

  it('rejects promoting a published page further', () => {
    const r = evaluatePromote({ relativePath: 'published/foo.md' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.rule).toBe('invalid-promote-source')
    }
  })

  it('rejects promoting from non-bucket source', () => {
    const r = evaluatePromote({ relativePath: 'data/foo.md' })
    expect(r.ok).toBe(false)
  })
})
