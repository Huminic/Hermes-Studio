/**
 * Gate 2 — exact 885-cell evaluator spine types.
 *
 * One EvalRow per (metric_id x dealer). status is 'evaluated' ONLY when the strict
 * predicate holds (see strict-predicate.ts); otherwise 'unresolved'. Unresolved rows
 * remain in the 885-row ledger for audit but DO NOT count toward completion.
 *
 * The ledger is NON-PII by construction: evaluated rows carry aggregate integer
 * numerator/denominator and derived rates only — never customer names, VINs, or
 * row-level values.
 */

export type EvalStatus = 'evaluated' | 'unresolved'

export type Baseline = {
  basis: 'operational_target' | 'industry_benchmark'
  id: string
  label: string
  unit: string
  value: number | null
  comparator: '<' | '>' | null
  direction: 'higher_is_better' | 'lower_is_better' | null
  source: string
  publication_date: string | null
  url: string | null
  confidence: string
  definition: string
}

export type SourceLineage = {
  family: string
  artifact_filename: string
  artifact_sha256: string
  captured_at: string
  reporting_period: { start: string; end: string; timezone: string }
  dealer_id: string
  dealer_name: string
  sales_only_proof: string
  // Governed delivery envelope (SCHEMA_CONTRACT §1) — bound + validated, never hardcoded.
  source_type: string
  sender: string
  subject: string
  gmail_message_id: string
  gmail_attachment_id: string
  period_hint: string
  observed_date_range: { start: string; end: string } | null
}

export type EvalRow = {
  metric_id: string
  dealer_id: string
  profile: string
  section: string
  subsection: string
  condition: string

  status: EvalStatus

  source_family: string | null
  source_lineage: SourceLineage | null
  source_fields: Array<string> | null

  formula: string | null
  value: number | null
  unit: string | null
  numerator: number | null
  denominator: number | null

  reporting_period: { start: string; end: string; timezone: string } | null
  captured_at: string | null

  baseline: Baseline | null
  variance: number | null
  rating: 'healthy' | 'watch' | 'breach' | null
  rank: number | null
  evaluation_confidence: { label: string; basis: string } | null

  related_metric_ids: Array<string>
  cluster: string
  evidence_or_inference: 'evidence' | 'inference' | null

  recommended_owner: string | null
  recommended_action: string | null
  notification_or_automation_candidate: string | null

  customer_pdf_location: string | null
  internal_evidence_location: string | null

  unresolved_reason: string | null
  unresolved_owner: string | null
  unresolved_next_action: string | null
}
