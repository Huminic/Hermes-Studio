// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { render, screen, within } from '@testing-library/react'
import { PowerPacks } from '@/components/customer-console/cockpit/PowerPacks'
import { PACKS } from '@/components/customer-console/cockpit/power-packs'

const CSS = fs.readFileSync(
  path.resolve(__dirname, '../components/customer-console/cockpit/cockpit.css'),
  'utf8',
)

/** Extract the body of a `@media (max-width: 480px) { … }` block (brace-matched). */
function mobileBlock(css: string): string {
  const start = css.indexOf('@media (max-width: 480px)')
  expect(start).toBeGreaterThan(-1)
  const open = css.indexOf('{', start)
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') {
      depth--
      if (depth === 0) return css.slice(open + 1, i)
    }
  }
  return ''
}

describe('Power Pack layout — overflow AND overlap regression', () => {
  it('grid tracks are minmax(0,1fr) and .svc can shrink (no grid blowout / overflow)', () => {
    // 1fr tracks inflate to min-content and overflow the mobile column; minmax(0,1fr) does not.
    expect(CSS).toMatch(/\.svc-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/)
    expect(CSS).not.toMatch(/\.svc-grid\s*\{[^}]*grid-template-columns:\s*1fr;\s*\}/)
    // .svc may shrink below its intrinsic content width.
    expect(CSS).toMatch(/\.cockpit\s+\.svc\s*\{[^}]*min-width:\s*0/)
  })

  it('on narrow screens the status occupies its OWN line (no overlap with name/description)', () => {
    const block = mobileBlock(CSS)
    // The row wraps and the status takes a full-width line beneath the text column,
    // so a long status can no longer share the row and overlap the name/description.
    expect(block).toMatch(/\.svc\s*\{[^}]*flex-wrap:\s*wrap/)
    expect(block).toMatch(/\.svc-st\s*\{[^}]*flex-basis:\s*100%/)
    expect(block).toMatch(/\.svc-st\s*\{[^}]*white-space:\s*normal/)
  })

  it('renders name, description, AND status for every pack (all three remain readable)', () => {
    render(<PowerPacks heartbeats={{}} />)
    const rows = screen.getAllByText((_, el) => el?.className === 'svc-n')
    expect(rows.length).toBe(PACKS.length)
    // Each row surfaces a distinct name, a description, and a status chip.
    for (const p of PACKS) {
      const nameEl = screen.getByText(p.name)
      const row = nameEl.closest('.svc') as HTMLElement
      expect(row).toBeTruthy()
      expect(row.querySelector('.svc-d')?.textContent).toBe(p.desc)
      const status = row.querySelector('.svc-st')
      expect(status).toBeTruthy()
      expect((status?.textContent ?? '').trim().length).toBeGreaterThan(0)
      // Structural guard: status is a sibling of the text column, not nested inside it
      // (nesting is what let it overlap) — name/desc live in .svc-mid, status does not.
      expect(within(row.querySelector('.svc-mid') as HTMLElement).queryByText((status?.textContent ?? '').trim())).toBeNull()
    }
  })
})
