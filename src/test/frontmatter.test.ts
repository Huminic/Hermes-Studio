import { describe, it, expect } from 'vitest'
import { extractFrontmatter, readWikiFields } from '@/lib/frontmatter'

describe('extractFrontmatter', () => {
  it('returns no frontmatter when the document does not start with ---', () => {
    const result = extractFrontmatter('# Just a heading\n\nBody.')
    expect(result.hasFrontmatter).toBe(false)
    expect(result.frontmatter).toBeNull()
    expect(result.body).toBe('# Just a heading\n\nBody.')
  })

  it('parses a valid frontmatter block', () => {
    const md = `---
id: consultative-agent-scope-contract
type: scope-contract
title: Consultative Agent Scope Contract
status: active
review_required: true
links:
  - human-relay-specification
  - approval-matrix
---
# Body content`
    const result = extractFrontmatter(md)
    expect(result.hasFrontmatter).toBe(true)
    expect(result.frontmatter).toMatchObject({
      id: 'consultative-agent-scope-contract',
      type: 'scope-contract',
      status: 'active',
      review_required: true,
    })
    expect(result.frontmatter?.links).toEqual([
      'human-relay-specification',
      'approval-matrix',
    ])
    expect(result.body).toBe('# Body content')
  })

  it('treats a document with --- on line 1 but no closing as plain body', () => {
    const md = `---
id: x
title: orphan
# no closing delimiter
`
    const result = extractFrontmatter(md)
    expect(result.hasFrontmatter).toBe(false)
    expect(result.body).toBe(md)
  })

  it('surfaces a YAML parse error and falls back to whole-body', () => {
    const md = `---
id: oops
title: [
---
body`
    const result = extractFrontmatter(md)
    expect(result.hasFrontmatter).toBe(true)
    expect(result.parseError).toBeDefined()
    expect(result.frontmatter).toBeNull()
    expect(result.body).toBe(md)
  })

  it('rejects array or scalar frontmatter as not a mapping', () => {
    const md = `---
- item
- another
---
body`
    const result = extractFrontmatter(md)
    expect(result.hasFrontmatter).toBe(true)
    expect(result.parseError).toMatch(/mapping/)
    expect(result.frontmatter).toBeNull()
  })

  it('handles empty frontmatter (--- --- with nothing between)', () => {
    const md = `---
---
body only`
    const result = extractFrontmatter(md)
    expect(result.hasFrontmatter).toBe(true)
    expect(result.frontmatter).toEqual({})
    expect(result.body).toBe('body only')
  })

  it('handles CRLF line endings', () => {
    const md = '---\r\nid: x\r\ntitle: y\r\n---\r\nbody\r\nmore'
    const result = extractFrontmatter(md)
    expect(result.hasFrontmatter).toBe(true)
    expect(result.frontmatter).toMatchObject({ id: 'x', title: 'y' })
    expect(result.body).toBe('body\nmore')
  })
})

describe('readWikiFields', () => {
  it('returns an empty object when frontmatter is null', () => {
    expect(readWikiFields(null)).toEqual({})
  })

  it('picks out only the documented spec fields and filters non-string array entries', () => {
    const fields = readWikiFields({
      id: 'x',
      title: 'y',
      status: 'active',
      review_required: false,
      links: ['a', 42, 'b'],
      tags: ['method', 'phase'],
      extra_field: 'ignored',
    })
    expect(fields).toEqual({
      id: 'x',
      title: 'y',
      status: 'active',
      review_required: false,
      links: ['a', 'b'],
      tags: ['method', 'phase'],
    })
  })

  it('returns undefined for fields with the wrong type', () => {
    const fields = readWikiFields({
      id: 123,
      title: null,
      links: 'not-an-array',
    })
    expect(fields.id).toBeUndefined()
    expect(fields.title).toBeUndefined()
    expect(fields.links).toBeUndefined()
  })
})
