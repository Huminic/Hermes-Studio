import { describe, it, expect, vi } from 'vitest'
import { renderLeadSourceEmail } from '../server/lead-notifications'
import { buildLeadSourceReport } from '../server/lead-source-report'
import { sendLeadSourceReport } from '../../scripts/send-lead-source-report'
import type { SendFn } from '../../scripts/send-daily-report'

// 12 sources so the top-10 rows + overflow table both render.
const rows = buildLeadSourceReport({
  window24h: Array.from({ length: 12 }, (_, i) => ({
    lead_source: i === 11 ? 'Source 3742136' : `Src${i}`,
    opportunities: 12 - i,
    sold: i === 0 ? 2 : 0,
  })),
  window7d: Array.from({ length: 12 }, (_, i) => ({ lead_source: i === 11 ? 'Source 3742136' : `Src${i}`, opportunities: (12 - i) * 4, sold: 0 })),
  window30d: Array.from({ length: 12 }, (_, i) => ({ lead_source: i === 11 ? 'Source 3742136' : `Src${i}`, opportunities: (12 - i) * 10, sold: i === 0 ? 5 : 0 })),
  prev24h: [],
})

describe('renderLeadSourceEmail', () => {
  it('renders tiles, a top-source section, an overflow table and the legacy-id footnote', () => {
    const { subject, html } = renderLeadSourceEmail({
      storeName: 'Serra Nissan',
      agentName: 'Caroline',
      date: '2026-09-25',
      generatedAt: '2026-09-25T17:30:00.000Z',
      rows,
      totals: { leads24h: 78, leads7d: 300, leads30d: 780, sold24h: 2 },
    })
    expect(subject).toBe('Lead Source Report — Serra Nissan — 2026-09-25')
    expect(html).toContain('Leads 24h')
    expect(html).toContain('Sold 24h')
    expect(html).toContain('Top sources')
    expect(html).toContain('Src0')
    // 12 sources → an overflow table with the 11th/12th
    expect(html).toContain('Other sources')
    // unnamed legacy id renders as "Source <id>" + footnote
    expect(html).toContain('Source 3742136')
    expect(html).toContain('Unnamed sources are legacy VinSolutions source ids')
  })
})

describe('sendLeadSourceReport', () => {
  const raw = {
    date: '2026-09-25',
    generatedAt: '2026-09-25T17:30:00.000Z',
    leadSource: {
      window24h: { opportunities: 40, sold: 3 },
      window7d: { opportunities: 150 },
      window30d: { opportunities: 500 },
    },
  }
  const artifacts: Record<string, string> = {
    'out/serra-nissan-lead-source.json': JSON.stringify(rows),
    'out/serra-nissan-raw-counts.json': JSON.stringify(raw),
  }
  const readFile = (p: string) => {
    const key = Object.keys(artifacts).find((k) => p.endsWith(k))
    if (!key) throw new Error(`unexpected read ${p}`)
    return artifacts[key]
  }

  it('DRY-RUN: writes the html preview, uses raw-counts totals, calls NO sender', async () => {
    const written = new Map<string, string>()
    const sender = vi.fn<SendFn>()
    const out = await sendLeadSourceReport({
      profile: 'serra-nissan',
      fromDir: 'out',
      to: ['gm@store.com'],
      storeName: 'Serra Nissan',
      send: false,
      deps: { readFile, writeFile: (p, c) => written.set(p, c), sender },
    })
    expect(sender).not.toHaveBeenCalled()
    expect(out.sent).toBe(false)
    expect(out.htmlPath.endsWith('serra-nissan-lead-source-email.html')).toBe(true)
    // tile total came from raw-counts window24h (40), not a row sum
    expect(out.html).toContain('40')
    expect(out.subject).toBe('Lead Source Report — Serra Nissan — 2026-09-25')
  })

  it('--send: calls the injected sender once', async () => {
    const sender = vi.fn<SendFn>().mockResolvedValue({ ok: true, email_id: 'em_2' })
    const out = await sendLeadSourceReport({
      profile: 'serra-nissan',
      fromDir: 'out',
      to: ['gm@store.com'],
      storeName: 'Serra Nissan',
      send: true,
      deps: { readFile, writeFile: () => {}, sender },
    })
    expect(sender).toHaveBeenCalledTimes(1)
    expect(out.result).toEqual({ ok: true, email_id: 'em_2' })
  })
})
