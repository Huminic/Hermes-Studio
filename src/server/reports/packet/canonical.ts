/**
 * Deterministic canonical JSON + sha256. Object keys are sorted recursively so a
 * given logical content always serializes to identical bytes — the basis for
 * replay, idempotence, and tamper detection across the packet-execution machinery.
 * Arrays preserve order (order is meaningful); undefined is dropped.
 */
import { createHash } from 'node:crypto'

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[k]
      if (v !== undefined) out[k] = canonicalize(v)
    }
    return out
  }
  return value
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

export function sha256Of(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

export function sha256Hex(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex')
}
