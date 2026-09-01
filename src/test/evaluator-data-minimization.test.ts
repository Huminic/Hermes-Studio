// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AllowedSelection } from '@/server/reports/evaluator/data-minimization'
import {
  ALLOWED_EXPORT_FIELD_SELECTION,
  isProhibitedField,
  validateAllSelections,
  validateSelection,
} from '@/server/reports/evaluator/data-minimization'

const REPO = path.resolve(__dirname, '..', '..')
const ACQ = JSON.parse(
  fs.readFileSync(
    path.join(REPO, 'docs/halo/contract/acquisition-contract.json'),
    'utf8',
  ),
)

describe('Gate 3 data-minimization control (addendum)', () => {
  it('every committed allowed field selection is PII-minimal (no prohibited field)', () => {
    const v = validateAllSelections(ALLOWED_EXPORT_FIELD_SELECTION)
    expect(v.ok, JSON.stringify(v.violations)).toBe(true)
    for (const sel of ALLOWED_EXPORT_FIELD_SELECTION) {
      for (const f of [
        ...sel.minimal_fields,
        ...sel.join_keys.map((k) => k.field),
      ]) {
        expect(isProhibitedField(f), `${sel.dataset}: ${f}`).toBe(false)
      }
      // Join keys must be flagged pseudonymizable and excluded from customer PDFs.
      for (const k of sel.join_keys) {
        expect(k.pseudonymize).toBe(true)
        expect(k.in_customer_pdf).toBe(false)
      }
    }
  })

  it('REGRESSION: a read-only selection with a prohibited field FAILS without a compliance route', () => {
    const bad: AllowedSelection = {
      acquisition_route: 'readonly_browser_capture',
      dataset: 'Leads',
      closes_candidate_metric_examples: ['SW-011'],
      minimal_fields: [
        'Dealer ID',
        'Customer',
        'VIN',
        'Actual Response Time (Min)',
      ],
      join_keys: [],
      excluded_pii: [],
      note: 'contrived — includes prohibited fields',
    }
    const v = validateSelection(bad)
    expect(v.ok).toBe(false)
    expect(v.violations).toContain('Customer')
    expect(v.violations).toContain('VIN')
    // The whole-set validator surfaces the violations too.
    expect(
      validateAllSelections([...ALLOWED_EXPORT_FIELD_SELECTION, bad]).ok,
    ).toBe(false)
  })

  it('a compliance-authorization route MAY retain a PII field (with authorization)', () => {
    const compliancePii: AllowedSelection = {
      acquisition_route: 'compliance_authorization',
      dataset: 'CRM (compliance)',
      closes_candidate_metric_examples: ['SW-098'],
      minimal_fields: ['Dealer ID', 'phone number', 'TCPA consent timestamp'],
      join_keys: [],
      excluded_pii: [],
      note: 'compliance condition — PII permitted under authorization + governed handling',
    }
    expect(validateSelection(compliancePii).ok).toBe(true)
  })

  it('prohibited-field detector catches the named PII categories', () => {
    for (const f of [
      'Customer Full Name',
      'Email Address',
      'Phone Number',
      'Street Address',
      'VIN',
      'Stock Number',
      'CoBuyer Full Name',
      'Vehicle Memo',
      'Trade 1 Make',
      'Message Content',
    ]) {
      expect(isProhibitedField(f), f).toBe(true)
    }
    for (const f of [
      'Dealer ID',
      'Lead Source',
      'Actual Response Time (Min)',
      'Total Gross',
      'Sold Date',
      'Assigned User - User Group',
    ]) {
      expect(isProhibitedField(f), f).toBe(false)
    }
  })

  it('acquisition contract carries the data_minimization block (not a new approval gate)', () => {
    const dm = ACQ.data_minimization
    expect(dm).toBeDefined()
    expect(dm.is_new_approval_gate).toBe(false)
    expect(dm.validation.ok).toBe(true)
    expect(dm.validation.violations).toEqual([])
    expect(Array.isArray(dm.allowed_export_field_selection)).toBe(true)
    expect(String(dm.observed_vs_allowed_note)).toMatch(/observed CAPABILITY/)
    // Observed capability (dataset_evidence) is distinct from allowed export selection.
    expect(ACQ.dataset_evidence.observed_field_notes).toBeDefined()
    // No Service field ever appears in an allowed selection.
    for (const sel of dm.allowed_export_field_selection) {
      for (const f of sel.minimal_fields)
        expect(String(f).toLowerCase()).not.toBe('service')
    }
  })

  it('invariants preserved: routes 582/273, domains 27/48/9/21, all candidate_unproved', () => {
    const views = JSON.parse(
      fs.readFileSync(
        path.join(REPO, 'docs/halo/evidence/m1r/evaluator/closure-views.json'),
        'utf8',
      ),
    )
    expect(views.total).toBe(855)
    expect(views.duane_approval_required_count).toBe(273)
    expect(views.no_new_approval_count).toBe(582)
    expect(views.by_boundary_domain).toEqual({
      service: 27,
      compliance: 48,
      cross_rooftop: 9,
      external_enrichment: 21,
    })
    expect(views.by_route_proof_state).toEqual({ candidate_unproved: 855 })
  })
})
