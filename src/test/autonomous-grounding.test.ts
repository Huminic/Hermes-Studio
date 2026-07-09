import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string
const PROFILE = 'sh-test'

function writeWiki(
  rel: string,
  frontmatter: Record<string, string>,
  body: string,
): void {
  const fm = [
    '---',
    ...Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`),
    '---',
  ].join('\n')
  const full = path.join(
    tmpHome,
    '.hermes',
    'profiles',
    PROFILE,
    'company-wiki',
    rel,
  )
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, `${fm}\n\n${body}\n`)
}

const CANON = {
  node_type: 'knowledge',
  status: 'canonical',
  source_of_truth: 'ops',
  owner: 'ops',
}

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'grounding-test-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
})
afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('recallForAgent — domain-scoped, canonical-only grounding', () => {
  it('grounds on a canonical, domain-matched node above the score threshold, with source provenance', async () => {
    writeWiki(
      'sales/test-drive.md',
      { id: 'sales.test-drive', canonical_name: 'Test Drive Scheduling', domain: 'sales', ...CANON },
      '# Test Drive Scheduling\nHow to book a test drive appointment for a customer.',
    )
    const { recallForAgent } = await import('@/server/autonomous-grounding')
    const g = recallForAgent(PROFILE, 'can I book a test drive Saturday?', 'sales')
    expect(g.grounded).toBe(true)
    expect(g.sources.some((s) => s.includes('test-drive'))).toBe(true)
    expect(g.blocks.join('\n')).toContain('## source:')
    expect(g.blocks.join('\n')).toContain('Test Drive Scheduling')
  })

  it('NEVER grounds on a draft node — the anti-fabrication invariant', async () => {
    writeWiki(
      'sales/inventory-and-pricing.md',
      { id: 'sales.inv', canonical_name: 'Inventory and Pricing', domain: 'sales', node_type: 'knowledge', status: 'draft', source_of_truth: 'pending', owner: 'ops' },
      '# Inventory and pricing\nThe 2026 Prologue in mercury silver is in stock for a great price.',
    )
    const { recallForAgent } = await import('@/server/autonomous-grounding')
    const g = recallForAgent(PROFILE, 'do you have a 2026 Prologue in stock inventory pricing', 'sales')
    expect(g.grounded).toBe(false)
    expect(g.blocks).toHaveLength(0)
  })

  it('excludes a canonical node from a different domain', async () => {
    writeWiki(
      'service/recalls.md',
      { id: 'service.recalls', canonical_name: 'Recalls', domain: 'service', ...CANON },
      '# Service recall process\nHandle a recall service appointment.',
    )
    const { recallForAgent } = await import('@/server/autonomous-grounding')
    const g = recallForAgent(PROFILE, 'recall service appointment process', 'sales')
    expect(g.grounded).toBe(false)
  })

  it('caps a long node body and marks it truncated', async () => {
    writeWiki(
      'sales/big.md',
      { id: 'sales.big', canonical_name: 'Scheduling Big', domain: 'sales', ...CANON },
      '# Scheduling appointment test drive\n' + 'x'.repeat(4000),
    )
    const { recallForAgent, AUTO_WIKI_PAGE_CHAR_CAP } = await import('@/server/autonomous-grounding')
    const g = recallForAgent(PROFILE, 'scheduling appointment test drive', 'sales')
    expect(g.grounded).toBe(true)
    const joined = g.blocks.join('\n')
    expect(joined).toContain('…(truncated)')
    expect(joined.length).toBeLessThan(AUTO_WIKI_PAGE_CHAR_CAP + 500)
  })

  it('is empty when nothing clears the score threshold', async () => {
    writeWiki(
      'sales/unrelated.md',
      { id: 'sales.unrelated', canonical_name: 'Benefits', domain: 'sales', ...CANON },
      '# Employee benefits\nVacation and health coverage.',
    )
    const { recallForAgent } = await import('@/server/autonomous-grounding')
    const g = recallForAgent(PROFILE, 'what colour are the seats', 'sales')
    expect(g.grounded).toBe(false)
  })
})
