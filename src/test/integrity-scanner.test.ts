import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string

function writePage(profile: string, rel: string, fm: string, body: string) {
  const file = path.join(
    tmpHome,
    '.hermes',
    'profiles',
    profile,
    'knowledge',
    rel,
  )
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const front = fm ? `---\n${fm}\n---\n` : ''
  fs.writeFileSync(file, `${front}${body}\n`, 'utf8')
}

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'integ-scan-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('scanWikiIntegrity', () => {
  it('detects broken links, orphans, and missing frontmatter', async () => {
    // index links good + broken + nofm; good links back to index.
    writePage('serra-honda', 'index.md', 'type: index\nstatus: published\ntitle: Index', 'See [[good]] and [[broken]] and [[nofm]].')
    writePage('serra-honda', 'good.md', 'type: note\nstatus: draft\ntitle: Good', 'Back to [[index]].')
    writePage('serra-honda', 'broken.md', 'type: note\nstatus: draft\ntitle: Broken', 'Points at [[ghost]].')
    writePage('serra-honda', 'orphan.md', 'type: note\nstatus: draft\ntitle: Orphan', 'Nobody links here.')
    writePage('serra-honda', 'nofm.md', '', 'No frontmatter at all.')

    const { scanWikiIntegrity } = await import('@/server/knowledge-browser')
    const f = scanWikiIntegrity('serra-honda')

    expect(f.pages_scanned).toBe(5)
    expect(f.broken_links).toEqual([{ source: 'broken.md', link: 'ghost' }])
    expect(f.orphans).toEqual(['orphan.md'])
    expect(f.missing_frontmatter).toEqual([
      { path: 'nofm.md', missing: ['type', 'status'] },
    ])
  })

  it('returns clean findings for a fully-linked, well-formed wiki', async () => {
    writePage('clean-co', 'index.md', 'type: index\nstatus: published\ntitle: Index', 'See [[good]].')
    writePage('clean-co', 'good.md', 'type: note\nstatus: draft\ntitle: Good', 'Back to [[index]].')
    const { scanWikiIntegrity } = await import('@/server/knowledge-browser')
    const f = scanWikiIntegrity('clean-co')
    expect(f.broken_links).toHaveLength(0)
    expect(f.orphans).toHaveLength(0)
    expect(f.missing_frontmatter).toHaveLength(0)
  })
})

describe('runIntegrityScan', () => {
  it('classifies broken/missing findings as important', async () => {
    writePage('serra-honda', 'broken.md', 'type: note\nstatus: draft\ntitle: Broken', '[[ghost]]')
    const { runIntegrityScan } = await import('@/server/integrity-scanner')
    const report = await runIntegrityScan('serra-honda', {
      memorializeFindings: false,
      now: 1_700_000_000_000,
    })
    expect(report.severity).toBe('important')
    expect(report.counts.broken_links).toBe(1)
    expect(report.scanned_at).toBe(1_700_000_000_000)
  })

  it('classifies an orphan-only wiki as info', async () => {
    // Two unlinked, well-formed pages → orphans but no broken/missing.
    writePage('info-co', 'a.md', 'type: note\nstatus: draft\ntitle: A', 'alone')
    writePage('info-co', 'b.md', 'type: note\nstatus: draft\ntitle: B', 'alone too')
    const { runIntegrityScan } = await import('@/server/integrity-scanner')
    const report = await runIntegrityScan('info-co', {
      memorializeFindings: false,
    })
    expect(report.severity).toBe('info')
    expect(report.counts.orphans).toBe(2)
  })

  it('reports clean severity for a healthy wiki', async () => {
    writePage('clean-co', 'index.md', 'type: index\nstatus: published\ntitle: Index', 'See [[good]].')
    writePage('clean-co', 'good.md', 'type: note\nstatus: draft\ntitle: Good', 'Back to [[index]].')
    const { runIntegrityScan } = await import('@/server/integrity-scanner')
    const report = await runIntegrityScan('clean-co', {
      memorializeFindings: false,
    })
    expect(report.severity).toBe('clean')
  })
})
