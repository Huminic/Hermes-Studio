/**
 * Baseline registry resolver. Turns the committed definition-first registry JSON into
 * typed Baseline objects by id. Operational targets carry a numeric threshold (value);
 * industry benchmarks with an unverified value resolve with value=null (never fabricated).
 * Pure.
 */
import type { Baseline } from './types'

type RawOperationalTarget = {
  id: string
  metric_id: string
  basis: string
  label: string
  definition: string
  unit: string
  comparator: string
  threshold: number
  direction: string
  source: string
  verified_date: string
  confidence: string
}

type RawIndustryBenchmark = {
  id: string
  basis: string
  publisher: string
  title: string
  publication_date: string
  exact_definition: string
  unit: string
  value: number | null
  url: string
  confidence: string
}

export type BaselineRegistry = {
  resolve: (baselineId: string) => Baseline | null
}

function asDir(d: string): 'higher_is_better' | 'lower_is_better' | null {
  return d === 'higher_is_better' || d === 'lower_is_better' ? d : null
}

function asCmp(c: string): '<' | '>' | null {
  return c === '<' || c === '>' ? c : null
}

export function loadBaselineRegistry(raw: unknown): BaselineRegistry {
  const r = raw as {
    operational_targets?: unknown
    industry_benchmarks?: unknown
  }
  const ots = Array.isArray(r.operational_targets)
    ? (r.operational_targets as Array<RawOperationalTarget>)
    : []
  const ibs = Array.isArray(r.industry_benchmarks)
    ? (r.industry_benchmarks as Array<RawIndustryBenchmark>)
    : []

  const byId = new Map<string, Baseline>()
  for (const o of ots) {
    byId.set(o.id, {
      basis: 'operational_target',
      id: o.id,
      label: o.label,
      unit: o.unit,
      value: o.threshold,
      comparator: asCmp(o.comparator),
      direction: asDir(o.direction),
      source: o.source,
      publication_date: null,
      url: null,
      confidence: o.confidence,
      definition: o.definition,
    })
  }
  for (const b of ibs) {
    byId.set(b.id, {
      basis: 'industry_benchmark',
      id: b.id,
      label: b.title,
      unit: b.unit,
      value: b.value,
      comparator: null,
      direction: null,
      source: b.publisher,
      publication_date: b.publication_date,
      url: b.url,
      confidence: b.confidence,
      definition: b.exact_definition,
    })
  }

  return { resolve: (id: string) => byId.get(id) ?? null }
}
