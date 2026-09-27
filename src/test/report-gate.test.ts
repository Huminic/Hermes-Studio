import { describe, it, expect } from 'vitest'
import { gateDecision } from '../../scripts/report-gate'
import type { ManagementAudience } from '../server/studio-config'

const base: ManagementAudience = {
  emails: [],
  cells: [],
  reportsEnabled: false,
  alertsEnabled: false,
}

describe('report-gate gateDecision (N3.3 scheduler gating)', () => {
  it('SKIP when reports are disabled, regardless of audience', () => {
    const aud = { ...base, emails: ['gm@x.com'], cells: ['+15551230000'] }
    expect(gateDecision(aud, 'reports').go).toBe(false)
    expect(gateDecision(aud, 'text').go).toBe(false)
  })

  it('reports job: GO only with reports enabled AND ≥1 email', () => {
    expect(gateDecision({ ...base, reportsEnabled: true }, 'reports').go).toBe(false)
    expect(
      gateDecision({ ...base, reportsEnabled: true, emails: ['gm@x.com'] }, 'reports').go,
    ).toBe(true)
  })

  it('text job: GO only with reports enabled AND ≥1 cell (emails do not count)', () => {
    expect(
      gateDecision({ ...base, reportsEnabled: true, emails: ['gm@x.com'] }, 'text').go,
    ).toBe(false)
    expect(
      gateDecision({ ...base, reportsEnabled: true, cells: ['+15551230000'] }, 'text').go,
    ).toBe(true)
  })
})
