import { describe, it, expect } from 'vitest'
import { isSafeDeliveryFilename } from '@/server/ingest/safe-filename'

const NUL = String.fromCharCode(0)
const TAB = String.fromCharCode(9)
const DEL = String.fromCharCode(127)

describe('isSafeDeliveryFilename', () => {
  it('accepts the exact real Honda raw + derivative basenames', () => {
    // the delivery that failed closed before this fix
    expect(isSafeDeliveryFilename('OPPORTUNITIES (3).csv')).toBe(true)
    expect(isSafeDeliveryFilename('response-times-canonical-v1.csv')).toBe(true)
  })

  it('accepts safe basenames with spaces and parentheses', () => {
    for (const ok of [
      'simple.csv',
      'Report 2026 (final).csv',
      'a_b-c (1).csv',
      'Sales Communication Log (2).csv',
      'DATA.CSV', // .csv is case-insensitive
    ]) expect(isSafeDeliveryFilename(ok), ok).toBe(true)
  })

  it('rejects path separators, traversal, and absolute paths', () => {
    for (const bad of [
      '../secret.csv',
      '../../etc/passwd.csv',
      '..\\secret.csv',
      '/etc/passwd.csv',
      '/abs.csv',
      'sub/dir.csv',
      'sub\\dir.csv',
      'a/../b.csv',
      'weird..name.csv', // any ".." is rejected
      '..csv',
    ]) expect(isSafeDeliveryFilename(bad), bad).toBe(false)
  })

  it('rejects dotfiles / leading dot', () => {
    for (const bad of ['.hidden.csv', '.csv', '.', '..']) expect(isSafeDeliveryFilename(bad), bad).toBe(false)
  })

  it('rejects NUL / control chars', () => {
    for (const bad of [`OPPORTUNITIES (3).csv${NUL}.exe`, `a${NUL}b.csv`, `tab${TAB}.csv`, `del${DEL}.csv`]) {
      expect(isSafeDeliveryFilename(bad), JSON.stringify(bad)).toBe(false)
    }
  })

  it('rejects non-.csv (incl. double extension and json)', () => {
    for (const bad of ['report.txt', 'report.json', 'manifest.v1.json', 'report.csv.exe', 'report.xlsx', 'noext', 'report.CSVX']) {
      expect(isSafeDeliveryFilename(bad), bad).toBe(false)
    }
  })

  it('rejects leading/trailing whitespace, empties, over-length, and disallowed chars', () => {
    for (const bad of [
      ' leading.csv',
      'trailing.csv ',
      '',
      '   ',
      '"quoted".csv',
      "it's.csv",
      'na;me.csv',
      'na*me.csv',
      'café.csv', // non-ASCII not in the closed allowlist
      `${'x'.repeat(256)}.csv`,
    ]) expect(isSafeDeliveryFilename(bad), JSON.stringify(bad)).toBe(false)
  })

  it('rejects non-string input', () => {
    for (const bad of [undefined, null, 123, {}, []]) expect(isSafeDeliveryFilename(bad as unknown)).toBe(false)
  })
})
