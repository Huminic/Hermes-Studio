// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { EvalRow } from '@/server/reports/evaluator/types'
import type { Gate2Inputs } from '@/server/reports/evaluator/build-from-fresh'
import type { ValidatorContext } from '@/server/reports/evaluator/semantic-validator'
import type { EvaluableId } from '@/server/reports/evaluator/evaluators'
import { assembleGate2Inputs } from '@/server/reports/evaluator/build-from-fresh'
import { buildSpine } from '@/server/reports/evaluator/spine'
import { validateEvaluatedRow } from '@/server/reports/evaluator/semantic-validator'
import { METRIC_SPECS } from '@/server/reports/evaluator/metric-spec'

const REPO = path.resolve(__dirname, '..', '..')
const FRESH = process.env.HALO_FRESH_DIR ?? '/tmp/halo-295-fresh-20260831'
const HAVE = fs.existsSync(path.join(FRESH, 'manifest.json'))
const CONTRACT = JSON.parse(
  fs.readFileSync(
    path.join(REPO, 'docs/halo/contract/gate2-evaluator-contract.json'),
    'utf8',
  ),
) as { required_row_fields: Array<string> }

function ctxFor(
  inputs: Gate2Inputs,
  dealerId: string,
  metricId: EvaluableId,
): ValidatorContext {
  const d = inputs.dealers.find((x) => x.dealer_id === dealerId)!
  const family = METRIC_SPECS[metricId].source_family
  // The Leads source_family slug maps to the 'leads' lineage key (matches spine familyKey).
  const lineageKey =
    family === 'vinsolutions_custom_reporting_leads' ? 'leads' : family
  const fl = d.lineage[lineageKey]
  const condition = inputs.catalog.find((c) => c.metric_id === metricId)!
  return {
    condition,
    catalog: inputs.catalog,
    bundle: d.bundle,
    cohort: inputs.dealers.map((x) => ({
      dealer_id: x.dealer_id,
      bundle: x.bundle,
    })),
    dealerId: d.dealer_id,
    profile: d.profile,
    dealerName: d.dealer_name,
    period: d.reporting_period,
    envelope: fl.envelope,
    expectedProof: fl.sales_only_proof,
    expectedObserved: fl.observed_date_range,
    registry: inputs.registry,
  }
}

describe.runIf(HAVE)(
  'Semantic validator — exhaustive binding (repair #2)',
  () => {
    const inputs = assembleGate2Inputs({ freshDir: FRESH, repoRoot: REPO })
    const spine = buildSpine(inputs)
    const authentic = spine.rows.find(
      (r) => r.metric_id === 'SW-032' && r.dealer_id === '21044',
    )!
    const ctx = ctxFor(inputs, '21044', 'SW-032')
    const clone = (): EvalRow =>
      JSON.parse(JSON.stringify(authentic)) as EvalRow

    it('the authentic evaluated row passes', () => {
      expect(authentic.status).toBe('evaluated')
      expect(validateEvaluatedRow(clone(), ctx)).toEqual({
        ok: true,
        failed: [],
      })
    })

    const mut: Array<{
      name: string
      mutate: (r: EvalRow) => void
      clause: string
      exact?: boolean
    }> = [
      // value / candidate
      {
        name: 'value',
        mutate: (r) => (r.value = 0.99),
        clause: 'value_inconsistent_with_source',
        exact: true,
      },
      {
        name: 'numerator',
        mutate: (r) => (r.numerator = 99),
        clause: 'numerator_mismatch',
      },
      {
        name: 'denominator',
        mutate: (r) => (r.denominator = 99),
        clause: 'denominator_mismatch',
      },
      {
        name: 'source_fields',
        mutate: (r) => (r.source_fields = []),
        clause: 'source_fields_mismatch',
        exact: true,
      },
      {
        name: 'unit',
        mutate: (r) => (r.unit = 'percent'),
        clause: 'unit_mismatch',
        exact: true,
      },
      {
        name: 'formula',
        mutate: (r) => (r.formula = 'made up'),
        clause: 'formula_mismatch',
        exact: true,
      },
      {
        name: 'source_family',
        mutate: (r) => (r.source_family = 'crm_sales_gross'),
        clause: 'source_family_mismatch',
      },
      // baseline — every field bound
      {
        name: 'baseline.id',
        mutate: (r) => {
          if (r.baseline) r.baseline.id = 'OT-WRONG'
        },
        clause: 'baseline_id_mismatch',
        exact: true,
      },
      {
        name: 'baseline.value',
        mutate: (r) => {
          if (r.baseline) r.baseline.value = 0.9
        },
        clause: 'baseline_value_mismatch',
        exact: true,
      },
      {
        name: 'baseline.value=null',
        mutate: (r) => {
          if (r.baseline) r.baseline.value = null
        },
        clause: 'baseline_value_unverified',
      },
      {
        name: 'baseline.basis',
        mutate: (r) => {
          if (r.baseline) r.baseline.basis = 'industry_benchmark'
        },
        clause: 'baseline_basis_mismatch',
        exact: true,
      },
      {
        name: 'baseline.direction',
        mutate: (r) => {
          if (r.baseline) r.baseline.direction = 'lower_is_better'
        },
        clause: 'baseline_direction_mismatch',
        exact: true,
      },
      {
        name: 'baseline.comparator',
        mutate: (r) => {
          if (r.baseline) r.baseline.comparator = '>'
        },
        clause: 'baseline_comparator_mismatch',
        exact: true,
      },
      {
        name: 'baseline.unit',
        mutate: (r) => {
          if (r.baseline) r.baseline.unit = 'percent'
        },
        clause: 'baseline_unit_mismatch',
        exact: true,
      },
      {
        name: 'baseline.definition(nonblank wrong)',
        mutate: (r) => {
          if (r.baseline)
            r.baseline.definition = 'a plausible but wrong definition'
        },
        clause: 'baseline_definition_mismatch',
        exact: true,
      },
      {
        name: 'baseline.label',
        mutate: (r) => {
          if (r.baseline) r.baseline.label = 'Wrong Label'
        },
        clause: 'baseline_label_mismatch',
        exact: true,
      },
      {
        name: 'baseline.source',
        mutate: (r) => {
          if (r.baseline) r.baseline.source = 'made up source'
        },
        clause: 'baseline_source_mismatch',
        exact: true,
      },
      {
        name: 'baseline.confidence',
        mutate: (r) => {
          if (r.baseline) r.baseline.confidence = 'high'
        },
        clause: 'baseline_confidence_mismatch',
        exact: true,
      },
      {
        name: 'baseline.url(insert)',
        mutate: (r) => {
          if (r.baseline) r.baseline.url = 'https://evil'
        },
        clause: 'baseline_url_mismatch',
        exact: true,
      },
      {
        name: 'baseline.publication_date(insert)',
        mutate: (r) => {
          if (r.baseline) r.baseline.publication_date = '2020'
        },
        clause: 'baseline_publication_date_mismatch',
        exact: true,
      },
      // derived
      {
        name: 'variance',
        mutate: (r) => (r.variance = 0),
        clause: 'variance_incorrect',
        exact: true,
      },
      {
        name: 'rating',
        mutate: (r) => (r.rating = 'healthy'),
        clause: 'rating_incorrect',
        exact: true,
      },
      {
        name: 'rank',
        mutate: (r) => (r.rank = 1),
        clause: 'rank_incorrect',
        exact: true,
      },
      {
        name: 'notification',
        mutate: (r) =>
          (r.notification_or_automation_candidate = 'monitor_only'),
        clause: 'notification_candidate_incorrect',
        exact: true,
      },
      {
        name: 'confidence.label',
        mutate: (r) => {
          if (r.evaluation_confidence) r.evaluation_confidence.label = 'high'
        },
        clause: 'confidence_label_incorrect',
        exact: true,
      },
      {
        name: 'confidence.basis',
        mutate: (r) => {
          if (r.evaluation_confidence)
            r.evaluation_confidence.basis = 'made up basis'
        },
        clause: 'confidence_basis_incorrect',
        exact: true,
      },
      // lineage — every field bound
      {
        name: 'lineage.sha',
        mutate: (r) => {
          if (r.source_lineage) r.source_lineage.artifact_sha256 = 'deadbeef'
        },
        clause: 'lineage_sha_mismatch',
        exact: true,
      },
      {
        name: 'lineage.filename',
        mutate: (r) => {
          if (r.source_lineage) r.source_lineage.artifact_filename = 'Evil.xlsx'
        },
        clause: 'lineage_filename_mismatch',
        exact: true,
      },
      {
        name: 'lineage.dealer_id',
        mutate: (r) => {
          if (r.source_lineage) r.source_lineage.dealer_id = '99999'
        },
        clause: 'lineage_dealer_id_mismatch',
        exact: true,
      },
      {
        name: 'lineage.dealer_name',
        mutate: (r) => {
          if (r.source_lineage) r.source_lineage.dealer_name = 'Nope'
        },
        clause: 'lineage_dealer_name_mismatch',
        exact: true,
      },
      {
        name: 'lineage.period',
        mutate: (r) => {
          if (r.source_lineage)
            r.source_lineage.reporting_period = {
              start: '2000-01-01',
              end: '2000-01-07',
              timezone: 'UTC',
            }
        },
        clause: 'lineage_period_mismatch',
        exact: true,
      },
      {
        name: 'lineage.proof',
        mutate: (r) => {
          if (r.source_lineage)
            r.source_lineage.sales_only_proof = 'trust me, sales only'
        },
        clause: 'lineage_proof_falsified',
        exact: true,
      },
      {
        name: 'lineage.sender',
        mutate: (r) => {
          if (r.source_lineage) r.source_lineage.sender = 'evil@example.com'
        },
        clause: 'lineage_sender_mismatch',
        exact: true,
      },
      {
        name: 'lineage.subject',
        mutate: (r) => {
          if (r.source_lineage) r.source_lineage.subject = 'Re: lol'
        },
        clause: 'lineage_subject_mismatch',
        exact: true,
      },
      {
        name: 'lineage.message_id',
        mutate: (r) => {
          if (r.source_lineage)
            r.source_lineage.gmail_message_id = 'fabricated-id'
        },
        clause: 'lineage_message_id_mismatch',
        exact: true,
      },
      {
        name: 'lineage.attachment_id(fabricated)',
        mutate: (r) => {
          if (r.source_lineage)
            r.source_lineage.gmail_attachment_id = 'ANGjdJ-forged'
        },
        clause: 'lineage_attachment_id_mismatch',
        exact: true,
      },
      {
        name: 'lineage.period_hint',
        mutate: (r) => {
          if (r.source_lineage)
            r.source_lineage.period_hint = '2000-01-01/2000-01-07'
        },
        clause: 'lineage_period_hint_mismatch',
        exact: true,
      },
      {
        name: 'lineage.observed_range(false)',
        mutate: (r) => {
          if (r.source_lineage)
            r.source_lineage.observed_date_range = {
              start: '2000-01-01',
              end: '2000-01-02',
            }
        },
        clause: 'lineage_observed_range_mismatch',
        exact: true,
      },
      // catalog / dealer / placement
      {
        name: 'metric_id relabel',
        mutate: (r) => (r.metric_id = 'SW-031'),
        clause: 'metric_id_mismatch',
      },
      {
        name: 'condition text',
        mutate: (r) => (r.condition = 'something else'),
        clause: 'condition_mismatch',
        exact: true,
      },
      {
        name: 'dealer_id relabel',
        mutate: (r) => (r.dealer_id = '21043'),
        clause: 'dealer_id_mismatch',
        exact: true,
      },
      {
        name: 'profile relabel',
        mutate: (r) => (r.profile = 'serra-honda'),
        clause: 'profile_mismatch',
        exact: true,
      },
      {
        name: 'section',
        mutate: (r) => (r.section = 'X'),
        clause: 'section_mismatch',
        exact: true,
      },
      {
        name: 'subsection',
        mutate: (r) => (r.subsection = 'X'),
        clause: 'subsection_mismatch',
        exact: true,
      },
      {
        name: 'cluster',
        mutate: (r) => (r.cluster = 'X'),
        clause: 'cluster_mismatch',
        exact: true,
      },
      {
        name: 'related_metric_ids',
        mutate: (r) => (r.related_metric_ids = ['SW-999']),
        clause: 'related_metric_ids_mismatch',
        exact: true,
      },
      {
        name: 'evidence_or_inference',
        mutate: (r) => (r.evidence_or_inference = 'inference'),
        clause: 'evidence_or_inference_mismatch',
        exact: true,
      },
      {
        name: 'recommended_owner',
        mutate: (r) => (r.recommended_owner = 'X'),
        clause: 'recommended_owner_mismatch',
        exact: true,
      },
      {
        name: 'recommended_action',
        mutate: (r) => (r.recommended_action = 'X'),
        clause: 'recommended_action_mismatch',
        exact: true,
      },
      {
        name: 'customer_pdf_location',
        mutate: (r) => (r.customer_pdf_location = 'X'),
        clause: 'customer_pdf_location_mismatch',
        exact: true,
      },
      {
        name: 'internal_evidence_location',
        mutate: (r) => (r.internal_evidence_location = 'X'),
        clause: 'internal_evidence_location_mismatch',
        exact: true,
      },
      {
        name: 'unresolved_reason',
        mutate: (r) => (r.unresolved_reason = 'x'),
        clause: 'unresolved_reason_must_be_null',
        exact: true,
      },
      {
        name: 'unresolved_owner',
        mutate: (r) => (r.unresolved_owner = 'x'),
        clause: 'unresolved_owner_must_be_null',
        exact: true,
      },
      {
        name: 'unresolved_next_action',
        mutate: (r) => (r.unresolved_next_action = 'x'),
        clause: 'unresolved_next_action_must_be_null',
        exact: true,
      },
      {
        name: 'status',
        mutate: (r) => (r.status = 'unresolved'),
        clause: 'status_not_evaluated',
        exact: true,
      },
    ]

    for (const m of mut) {
      it(`mutation "${m.name}" -> ${m.clause}`, () => {
        const r = clone()
        m.mutate(r)
        const v = validateEvaluatedRow(r, ctx)
        expect(v.ok).toBe(false)
        expect(v.failed, v.failed.join(',')).toContain(m.clause)
        if (m.exact) expect(v.failed).toEqual([m.clause])
      })
    }

    it('rooftop relabel of BOTH row + lineage still fails against the admitted DealerInput/envelope', () => {
      // Relabel a nissan row to honda across row + lineage, then validate vs HONDA ctx:
      // the honda bundle recompute (0.5714) != the carried nissan value (0.3333).
      const r = clone()
      r.dealer_id = '21043'
      r.profile = 'serra-honda'
      if (r.source_lineage) r.source_lineage.dealer_id = '21043'
      const hondaCtx = ctxFor(inputs, '21043', 'SW-032')
      const v = validateEvaluatedRow(r, hondaCtx)
      expect(v.ok).toBe(false)
      expect(v.failed).toContain('value_inconsistent_with_source')
    })

    it('a legitimate cohort difference changes ONLY rank (honda rank 1, nissan rank 3), both valid', () => {
      const honda = spine.rows.find(
        (r) => r.metric_id === 'SW-032' && r.dealer_id === '21043',
      )!
      expect(
        validateEvaluatedRow(
          JSON.parse(JSON.stringify(honda)) as EvalRow,
          ctxFor(inputs, '21043', 'SW-032'),
        ).ok,
      ).toBe(true)
      expect(honda.rank).toBe(1)
      expect(authentic.rank).toBe(3)
      expect(honda.value).not.toBe(authentic.value)
    })

    it('SW-031 (dashboard) and SW-041 rows validate across dealers', () => {
      for (const id of ['SW-031', 'SW-041'] as const) {
        for (const dealer of ['21043', '21044', '21047']) {
          const row = spine.rows.find(
            (r) => r.metric_id === id && r.dealer_id === dealer,
          )!
          expect(
            validateEvaluatedRow(
              JSON.parse(JSON.stringify(row)) as EvalRow,
              ctxFor(inputs, dealer, id),
            ).ok,
            `${id}:${dealer}`,
          ).toBe(true)
        }
      }
    })
  },
)

describe.runIf(HAVE)(
  'Semantic validator — accepted Leads family (browser_capture + statistic + detail)',
  () => {
    const inputs = assembleGate2Inputs({ freshDir: FRESH, repoRoot: REPO })
    const spine = buildSpine(inputs)
    const clone = (id: EvaluableId, dealer: string): EvalRow =>
      JSON.parse(
        JSON.stringify(
          spine.rows.find((r) => r.metric_id === id && r.dealer_id === dealer)!,
        ),
      ) as EvalRow

    it('the authentic SW-011/012/015 Leads rows pass for all three dealers', () => {
      for (const id of ['SW-011', 'SW-012', 'SW-015'] as const)
        for (const dealer of ['21043', '21044', '21047'])
          expect(
            validateEvaluatedRow(clone(id, dealer), ctxFor(inputs, dealer, id))
              .ok,
            `${id}:${dealer}`,
          ).toBe(true)
    })

    it('SW-011 is a statistic: value (median) != numerator/denominator yet still valid', () => {
      const r = clone('SW-011', '21043')
      // coverage numerator 27 / business-hours pop 76 ≈ 0.355, NOT the median value 6.
      expect(r.numerator! / r.denominator!).not.toBeCloseTo(r.value!, 6)
      expect(
        validateEvaluatedRow(r, ctxFor(inputs, '21043', 'SW-011')).ok,
      ).toBe(true)
    })

    it('mutating the statistic value away from the recomputed median fails', () => {
      const r = clone('SW-011', '21043')
      r.value = 999
      const v = validateEvaluatedRow(r, ctxFor(inputs, '21043', 'SW-011'))
      expect(v.ok).toBe(false)
      expect(v.failed).toContain('value_inconsistent_with_source')
    })

    it('mutating the persisted evaluation_detail fails (non-vacuous detail binding)', () => {
      const r = clone('SW-015', '21044')
      ;(r.evaluation_detail as Record<string, unknown>).triggered_rep_count = 99
      const v = validateEvaluatedRow(r, ctxFor(inputs, '21044', 'SW-015'))
      expect(v.ok).toBe(false)
      expect(v.failed).toContain('evaluation_detail_mismatch')
    })

    it('mutating the browser_capture lineage capture_id fails', () => {
      const r = clone('SW-012', '21047')
      if (r.source_lineage)
        r.source_lineage.capture_id = 'VIN-LEADS-20260831-99999'
      const v = validateEvaluatedRow(r, ctxFor(inputs, '21047', 'SW-012'))
      expect(v.ok).toBe(false)
      expect(v.failed).toContain('lineage_capture_id_mismatch')
    })

    it('mutating the browser_capture lineage source_url fails', () => {
      const r = clone('SW-012', '21047')
      if (r.source_lineage)
        r.source_lineage.source_url = 'https://evil.example.com/x'
      const v = validateEvaluatedRow(r, ctxFor(inputs, '21047', 'SW-012'))
      expect(v.ok).toBe(false)
      expect(v.failed).toContain('lineage_source_url_mismatch')
    })

    it('SW-015 persisted detail is structural aggregates only (no rep identity)', () => {
      const allowed = new Set<string>([
        'reps_with_numeric',
        'triggered_rep_count',
        'triggered_rep_share',
        'triggered_rep_sample_sizes',
        'max_rep_mean_min',
        'store_median_min',
        'footnote',
      ])
      for (const dealer of ['21043', '21044', '21047']) {
        const d = spine.rows.find(
          (r) => r.metric_id === 'SW-015' && r.dealer_id === dealer,
        )!.evaluation_detail as Record<string, unknown>
        for (const k of Object.keys(d)) expect(allowed.has(k), k).toBe(true)
        expect(Array.isArray(d.triggered_rep_sample_sizes)).toBe(true)
        for (const n of d.triggered_rep_sample_sizes as Array<unknown>)
          expect(typeof n).toBe('number')
      }
    })
  },
)

describe.runIf(HAVE)(
  'Completeness guard — every required_row_field is semantically bound',
  () => {
    const inputs = assembleGate2Inputs({ freshDir: FRESH, repoRoot: REPO })
    const spine = buildSpine(inputs)
    const authentic = spine.rows.find(
      (r) => r.metric_id === 'SW-032' && r.dealer_id === '21044',
    )!
    const ctx = ctxFor(inputs, '21044', 'SW-032')

    function corrupt(v: unknown): unknown {
      if (v === null) return 'X-not-null'
      if (typeof v === 'string') return v + '-X'
      if (typeof v === 'number') return v + 1
      if (typeof v === 'boolean') return !v
      if (Array.isArray(v)) return v.length ? [] : ['X']
      if (typeof v === 'object') return {}
      return 'X'
    }

    it('mutating ANY single required field flips the verdict to false (no field escapes)', () => {
      for (const field of CONTRACT.required_row_fields) {
        const r = JSON.parse(JSON.stringify(authentic)) as Record<
          string,
          unknown
        >
        r[field] = corrupt(r[field])
        const v = validateEvaluatedRow(r as unknown as EvalRow, ctx)
        expect(
          v.ok,
          `required field "${field}" is NOT semantically bound`,
        ).toBe(false)
      }
    })
  },
)
