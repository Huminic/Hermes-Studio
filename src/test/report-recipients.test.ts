import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the config reader so the resolver is unit-tested without a workspace.
vi.mock('@/server/studio-config', () => ({
  readManagementAudience: vi.fn(),
}))

import { readManagementAudience } from '@/server/studio-config'
import {
  resolveEmailRecipients,
  resolveCellRecipients,
  resolveStoreName,
} from '../../scripts/report-recipients'

const mocked = vi.mocked(readManagementAudience)

beforeEach(() => {
  mocked.mockReset()
  mocked.mockReturnValue({
    emails: ['gm@serra.example', 'owner@serra.example'],
    cells: ['+15551230000', '+15559876543'],
    reportsEnabled: true,
    alertsEnabled: true,
    storeName: 'Tony Serra Ford',
  })
})

describe('report-recipients (N3.1 --to defaulting)', () => {
  it('defaults email recipients to the management audience when --to is empty', () => {
    expect(resolveEmailRecipients('serra-ford', [])).toEqual([
      'gm@serra.example',
      'owner@serra.example',
    ])
  })

  it('lets an explicit --to override the config emails', () => {
    expect(resolveEmailRecipients('serra-ford', ['one@x.com'])).toEqual(['one@x.com'])
    expect(mocked).not.toHaveBeenCalled()
  })

  it('defaults cell recipients to the management audience cells when --to is empty', () => {
    expect(resolveCellRecipients('serra-ford', [])).toEqual(['+15551230000', '+15559876543'])
  })

  it('lets an explicit --to override the config cells', () => {
    expect(resolveCellRecipients('serra-ford', ['+15550001111'])).toEqual(['+15550001111'])
  })

  it('resolves the store name from config, else the profile slug', () => {
    expect(resolveStoreName('serra-ford', '')).toBe('Tony Serra Ford')
    expect(resolveStoreName('serra-ford', 'Explicit Name')).toBe('Explicit Name')
    mocked.mockReturnValue({ emails: [], cells: [], reportsEnabled: false, alertsEnabled: false })
    expect(resolveStoreName('serra-nissan', '')).toBe('serra-nissan')
  })
})
