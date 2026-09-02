/**
 * PKT-02-01 authority binding loader + integrity assertions.
 *
 * The frozen per-metric semantic binding `pkt-02-01-binding.json` is the EXACT
 * authority for SW-011..015. This module loads it, asserts its sha256 equals the
 * frozen pin, and asserts the packet's `authority_binding` pointer (ref + sha256)
 * matches the canonical binding. Nothing here regenerates or mutates the binding;
 * it is read-only and fail-closed. Any mismatch throws `BindingIntegrityError`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

export const FROZEN_BINDING_SHA256 =
  '1c1c98a2e7b3be8d10eea9495861b7a33e65a00020ab7c9e756da363b69f2082'
export const CANONICAL_BINDING_REF =
  'docs/halo/contract/phase1b/pkt-02-01-binding.json'
export const PACKET_REF = 'docs/halo/contract/phase1b/packets/PKT-02-01.json'

export class BindingIntegrityError extends Error {}

export type MetricBinding = {
  canonical_condition: string
  business_question: string
  population: string
  calculation_kind: string
  numerator: string | null
  denominator: string | null
  formula: string | null
  unit: string
  direct_source_fields: Array<string>
  disposition: string
  source_existence_state: string
  evaluation_state: string
  lifecycle_bucket: string
  grade_target_id: string
  grade_approval: string
  grade_status: string
  grade_basis: string
  grade_value_or_range: string
  detection_rule: string
  ot_anchor: {
    baseline_id: string
    comparator: string
    threshold: number
    unit: string
    direction: string
    basis: string
  } | null
  authority: string
}

export type Binding = {
  artifact: string
  version: number
  packet_id: string
  alias_map: Record<string, string>
  metrics: Record<string, MetricBinding>
}

export type PacketDoc = {
  packet_id: string
  module: number
  target_ids: Array<string>
  period: string
  lifecycle_partition: Record<string, Array<string>>
  metric_definitions: Array<Record<string, unknown>>
  authority_binding: { ref: string; sha256: string }
}

const sha256Hex = (b: Buffer): string =>
  createHash('sha256').update(b).digest('hex')

export function assertFrozenBindingSha(actualSha: string): void {
  if (actualSha !== FROZEN_BINDING_SHA256) {
    throw new BindingIntegrityError(
      `binding sha mismatch: ${actualSha} != frozen ${FROZEN_BINDING_SHA256}`,
    )
  }
}

export function assertAuthorityPointer(ab: {
  ref: string
  sha256: string
}): void {
  if (ab.ref !== CANONICAL_BINDING_REF) {
    throw new BindingIntegrityError(
      `authority_binding.ref mismatch: ${ab.ref} != ${CANONICAL_BINDING_REF}`,
    )
  }
  assertFrozenBindingSha(ab.sha256)
}

export function loadBinding(repoRoot: string): {
  binding: Binding
  sha256: string
} {
  const buf = fs.readFileSync(path.join(repoRoot, CANONICAL_BINDING_REF))
  const sha256 = sha256Hex(buf)
  assertFrozenBindingSha(sha256)
  const binding = JSON.parse(buf.toString('utf8')) as Binding
  return { binding, sha256 }
}

export function loadPacket(repoRoot: string): PacketDoc {
  const buf = fs.readFileSync(path.join(repoRoot, PACKET_REF))
  const packet = JSON.parse(buf.toString('utf8')) as PacketDoc
  assertAuthorityPointer(packet.authority_binding)
  return packet
}

export function getMetricBinding(binding: Binding, id: string): MetricBinding {
  if (!(id in binding.metrics)) {
    throw new BindingIntegrityError(`unknown metric id in binding: ${id}`)
  }
  return binding.metrics[id]
}
