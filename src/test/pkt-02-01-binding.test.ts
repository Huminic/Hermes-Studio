// @vitest-environment node
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BindingIntegrityError,
  CANONICAL_BINDING_REF,
  FROZEN_BINDING_SHA256,
  assertAuthorityPointer,
  assertFrozenBindingSha,
  getMetricBinding,
  loadBinding,
  loadPacket,
} from '@/server/reports/packet/binding'

const REPO = path.resolve(__dirname, '..', '..')

describe('PKT-02-01 binding integrity', () => {
  it('assertFrozenBindingSha accepts the frozen sha and rejects any other', () => {
    expect(() => assertFrozenBindingSha(FROZEN_BINDING_SHA256)).not.toThrow()
    expect(() => assertFrozenBindingSha('0'.repeat(64))).toThrow(
      BindingIntegrityError,
    )
  })

  it('assertAuthorityPointer requires the canonical ref AND the frozen sha', () => {
    expect(() =>
      assertAuthorityPointer({
        ref: CANONICAL_BINDING_REF,
        sha256: FROZEN_BINDING_SHA256,
      }),
    ).not.toThrow()
    // wrong ref (even with the right sha) is rejected
    expect(() =>
      assertAuthorityPointer({
        ref: 'docs/halo/contract/phase1b/some-other.json',
        sha256: FROZEN_BINDING_SHA256,
      }),
    ).toThrow(BindingIntegrityError)
    // wrong sha (even with the right ref) is rejected
    expect(() =>
      assertAuthorityPointer({
        ref: CANONICAL_BINDING_REF,
        sha256: 'f'.repeat(64),
      }),
    ).toThrow(BindingIntegrityError)
  })

  it('loadBinding returns the frozen sha and all five metric records', () => {
    const { binding, sha256 } = loadBinding(REPO)
    expect(sha256).toBe(FROZEN_BINDING_SHA256)
    expect(binding.packet_id).toBe('PKT-02-01')
    expect(Object.keys(binding.metrics).sort()).toEqual([
      'SW-011',
      'SW-012',
      'SW-013',
      'SW-014',
      'SW-015',
    ])
  })

  it('binding carries the frozen measured vs pending dispositions', () => {
    const { binding } = loadBinding(REPO)
    for (const id of ['SW-011', 'SW-012', 'SW-015']) {
      expect(getMetricBinding(binding, id).disposition).toBe(
        'measured_validated',
      )
    }
    for (const id of ['SW-013', 'SW-014']) {
      const m = getMetricBinding(binding, id)
      expect(m.disposition).toBe('source_investigation_pending')
      expect(m.numerator).toBeNull()
      expect(m.denominator).toBeNull()
      expect(m.formula).toBeNull()
    }
  })

  it('loadPacket asserts the authority_binding pointer + frozen sha', () => {
    const packet = loadPacket(REPO)
    expect(packet.packet_id).toBe('PKT-02-01')
    expect(packet.authority_binding.ref).toBe(CANONICAL_BINDING_REF)
    expect(packet.authority_binding.sha256).toBe(FROZEN_BINDING_SHA256)
  })

  it('getMetricBinding throws for an unknown metric id', () => {
    const { binding } = loadBinding(REPO)
    expect(() => getMetricBinding(binding, 'SW-999')).toThrow(
      BindingIntegrityError,
    )
  })
})
