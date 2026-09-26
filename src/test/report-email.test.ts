import { describe, it, expect } from 'vitest'
import { renderReportEmail, type ReportEmailInput } from '../server/report-email'

const base: ReportEmailInput = {
  storeName: 'Tony Serra Ford',
  agentName: 'Georgia',
  headline: 'See what your team has been up to',
  greeting: 'Hi team,',
  context: 'Overnight at Tony Serra Ford: 5 new leads came in, 0 were texted.',
  tiles: [
    { value: 5, label: 'New leads', dotColor: '#2f6df6', delta: { text: '2 vs prior 24h', direction: 'up' } },
    { value: 0, label: 'AI texts sent', dotColor: '#12a150' },
    { value: 1, label: 'After-hours calls', dotColor: '#7c3aed' },
    { value: 3, label: 'Needs attention', dotColor: '#d0342c', delta: { text: '1 vs yesterday', direction: 'down' } },
  ],
  sections: [
    {
      title: 'Needs attention',
      rows: [
        {
          primary: 'Jane',
          secondary: 'Cars.com',
          stats: [
            { value: '4h', label: 'waiting', dotColor: '#d0342c' },
            { value: 'New', label: 'status', dotColor: '#f59e0b' },
            { value: 'INTERNET', label: 'type', dotColor: '#2f6df6' },
          ],
        },
      ],
    },
    {
      kind: 'table',
      title: 'Other sources',
      columns: ['Source', '24h', '7d'],
      rows: [
        ['Cars.com', 5, 20],
        ['Source 3742136', 1, 2],
      ],
    },
  ],
  cta: { label: 'Open VinSolutions', url: 'https://apps.vinsolutions.com/' },
  footnotes: ['Sales only (service excluded). Appointments are omitted.', 'Generated 2026-09-26T13:00:00.000Z.'],
}

describe('renderReportEmail', () => {
  it('renders tiles, section rows, a table section, the CTA button and footnotes', () => {
    const { html, text } = renderReportEmail(base)
    // headline + greeting + context
    expect(html).toContain('See what your team has been up to')
    expect(html).toContain('Hi team,')
    expect(html).toContain('5 new leads came in')
    // tiles (values + labels + a delta arrow)
    expect(html).toContain('New leads')
    expect(html).toContain('AI texts sent')
    expect(html).toContain('&#9650;') // up arrow
    expect(html).toContain('&#9660;') // down arrow
    // section row identity + stats
    expect(html).toContain('Jane')
    expect(html).toContain('Cars.com')
    expect(html).toContain('INTERNET')
    // table section
    expect(html).toContain('Other sources')
    expect(html).toContain('Source 3742136')
    // CTA
    expect(html).toContain('Open VinSolutions')
    expect(html).toContain('https://apps.vinsolutions.com/')
    // plain-text alternative carries the same figures
    expect(text).toContain('New leads: 5')
    expect(text).toContain('Open VinSolutions: https://apps.vinsolutions.com/')
  })

  it('escapes caller-supplied HTML in every field', () => {
    const { html } = renderReportEmail({
      ...base,
      storeName: '<script>alert(1)</script>',
      context: 'a & b < c > d "q" \'x\'',
      sections: [
        { title: '<b>t</b>', rows: [{ primary: '<i>p</i>', stats: [{ value: '<x>', label: '<y>', dotColor: '#000' }] }] },
      ],
    })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp;')
    expect(html).toContain('&lt;b&gt;t&lt;/b&gt;')
    expect(html).toContain('&lt;i&gt;p&lt;/i&gt;')
  })

  it('never embeds an external image and shows the omission footnote exactly once', () => {
    const { html } = renderReportEmail(base)
    expect(html).not.toContain('<img')
    expect(html).not.toContain('background-image')
    const occurrences = html.split('Sales only (service excluded). Appointments are omitted.').length - 1
    expect(occurrences).toBe(1)
  })

  it('renders a non-http CTA url as no button (text only) — no live href', () => {
    const { html } = renderReportEmail({ ...base, cta: { label: 'x', url: 'javascript:alert(1)' } })
    expect(html).not.toContain('javascript:alert(1)')
    expect(html).not.toContain('href="javascript')
  })
})
