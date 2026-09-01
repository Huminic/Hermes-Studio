/**
 * Gate 3 — data-minimization control for read-only VinSolutions captures / unsaved exports.
 *
 * For every read-only browser capture or unsaved export, SELECT AND RETAIN ONLY the fields
 * strictly required to calculate the named SW metric(s). Exclude customer names, emails,
 * phones, addresses, VINs, credit/payment attributes, free-text notes, and all other direct
 * or unnecessary PII unless Duane separately authorizes the specific compliance/PII condition
 * and a governed handling route. IDs may be retained ONLY when technically necessary for
 * deterministic de-dup/join, must be minimized/pseudonymized when possible, and must never
 * appear in customer PDFs. This is a data-minimization control, NOT a new approval gate for
 * already-authorized read-only Sales-only passes. Pure + deterministic.
 *
 * `observed capability` (what a dataset exposes) is DISTINCT from `allowed export field
 * selection` (what may actually be selected/retained). The latter lives here.
 */

export const DATA_MINIMIZATION_POLICY =
  'For every read-only VinSolutions browser capture or unsaved export, select and retain ONLY the fields strictly required to calculate the named SW metric(s). Exclude customer names, emails, phones, addresses, VINs, credit/payment attributes, free-text notes, and all other unnecessary PII unless Duane separately authorizes the specific compliance/PII condition and governed handling route. IDs are retained only when technically necessary for deterministic de-dup/join, minimized/pseudonymized when possible, and never placed in customer PDFs. Do not query, display, copy, export, log, or commit unrelated fields merely because a dataset exposes them.'

export const PROHIBITED_FIELDS_LIST: Array<string> = [
  'customer name',
  'email address',
  'phone number',
  'street address',
  'VIN',
  'stock number',
  'credit/payment attributes',
  'free-text notes / memo',
  'message content',
  'CoBuyer / co-buyer',
  'trade-in details',
  'SSN / DOB / driver license',
]

const PROHIBITED_FIELD_PATTERNS: Array<RegExp> = [
  /customer/i,
  /\bname\b/i,
  /e-?mail/i,
  /\bphone\b/i,
  /address/i,
  /\bVIN\b/i,
  /stock number/i,
  /credit/i,
  /payment/i,
  /\bSSN\b/i,
  /\bDOB\b/i,
  /driver'?s? licen|DL#/i,
  /\bnotes?\b|memo|free-?text|message content/i,
  /co-?buyer/i,
  /\btrade\b/i,
]

export function isProhibitedField(field: string): boolean {
  return PROHIBITED_FIELD_PATTERNS.some((re) => re.test(field))
}

export type JoinKey = {
  field: string
  purpose: 'dedup_join'
  pseudonymize: boolean
  in_customer_pdf: false
}

export type AllowedSelection = {
  acquisition_route: string
  dataset: string
  closes_candidate_metric_examples: Array<string>
  minimal_fields: Array<string>
  join_keys: Array<JoinKey>
  excluded_pii: Array<string>
  note: string
}

const jk = (field: string): JoinKey => ({
  field,
  purpose: 'dedup_join',
  pseudonymize: true,
  in_customer_pdf: false,
})

// The minimal, PII-free field selection per read-only candidate dataset. Only fields needed
// to compute the named metrics + the join keys required for deterministic de-dup are kept.
export const ALLOWED_EXPORT_FIELD_SELECTION: Array<AllowedSelection> = [
  {
    acquisition_route: 'new_readonly_vinsolutions_export',
    dataset: 'Leads',
    closes_candidate_metric_examples: ['SW-001', 'SW-004', 'SW-006'],
    minimal_fields: [
      'Dealer ID',
      'Lead Source',
      'Lead Type',
      'Lead Source Group',
      'Lead Status Type',
      'Actual Response Time (Min)',
      'Adjusted Response Time (Min)',
      'Actionable Response Datetime',
      'Contacted Indicator',
      'Originated After Hours',
      'Lead Origination Date',
      'Sold Datetime',
    ],
    join_keys: [jk('Lead ID')],
    excluded_pii: [
      'Customer',
      'VIN',
      'Stock Number',
      'CoBuyer Full Name',
      'Vehicle Memo',
      'Trade 1/2 fields',
      'Last Attempted Phone/Email Contact',
    ],
    note: 'response/source/funnel measures only; no customer identity, no vehicle identity.',
  },
  {
    acquisition_route: 'readonly_browser_capture',
    dataset: 'Leads',
    closes_candidate_metric_examples: ['SW-011', 'SW-015'],
    minimal_fields: [
      'Dealer ID',
      'Actual Response Time (Min)',
      'Adjusted Response Time (Min)',
      'Actionable Response Datetime',
      'Originated After Hours',
      'Lead Origination Date',
    ],
    join_keys: [jk('Lead ID')],
    excluded_pii: ['Customer', 'VIN', 'CoBuyer Full Name', 'Trade 1/2 fields'],
    note: 'per-lead response timing + business-hours flag only.',
  },
  {
    acquisition_route: 'new_readonly_vinsolutions_export',
    dataset: 'Appointments',
    closes_candidate_metric_examples: ['SW-008', 'SW-042'],
    minimal_fields: [
      'Dealer ID',
      'Appt Reason',
      'Appointment Status',
      'Is Show',
      'Is No Show',
      'Is Confirmed',
      'Is Completed',
      'Is Cancelled',
      'Appointment Start Date',
      'Appointment Start DateTime',
      'Confirmed Date',
      'Completed Date',
      'Assigned User - User Group',
    ],
    join_keys: [jk('Appointment ID')],
    excluded_pii: ['Customer', 'Assigned User (name)', 'Confirmed User (name)'],
    note: 'appointment status/timing + user ROLE only; not user names.',
  },
  {
    acquisition_route: 'new_readonly_vinsolutions_export',
    dataset: 'CRM Sales',
    closes_candidate_metric_examples: ['SW-034', 'SW-049'],
    minimal_fields: [
      'Dealer ID',
      'Inventory Type',
      'Front Gross',
      'Back Gross',
      'Total Gross',
      'Sold Date',
      'Days To Sell From Lead Creation',
      'Days To Sell From First Contact',
    ],
    join_keys: [jk('Deal Number'), jk('Sale ID')],
    excluded_pii: [
      'Customer',
      'VIN',
      'Stock Number',
      'Sales Representative (name)',
    ],
    note: 'gross/timing measures only; no customer or vehicle identity.',
  },
  {
    acquisition_route: 'readonly_browser_capture',
    dataset: 'Customer Contact',
    closes_candidate_metric_examples: ['SW-025', 'SW-096'],
    minimal_fields: [
      'Dealer',
      'CRM User - User Group',
      'Contact Date',
      'Last Attempted Contact Date',
      'Last Actual Contact Date',
    ],
    join_keys: [],
    excluded_pii: ['Customer (name)', 'phone', 'email', 'message content'],
    note: 'contact dates + user ROLE only; no customer identity or message content.',
  },
  {
    acquisition_route: 'new_readonly_vinsolutions_export',
    dataset: 'Daily Communication Summary By User',
    closes_candidate_metric_examples: ['SW-002', 'SW-021'],
    minimal_fields: [
      'Dealer',
      'User - User Group',
      'Date',
      'Sales Inbound Calls',
      'Sales Outbound Calls',
      'Sales Total Calls',
    ],
    join_keys: [],
    excluded_pii: [
      'SERVICE call-count columns (Sales-only)',
      'Customer',
      'message content',
    ],
    note: 'SALES call-count columns ONLY; Service columns never selected.',
  },
]

export type SelectionViolation = {
  dataset: string
  acquisition_route: string
  field: string
}

/** A selection is valid unless it retains a prohibited field WITHOUT a compliance route. */
export function validateSelection(sel: AllowedSelection): {
  ok: boolean
  violations: Array<string>
} {
  if (sel.acquisition_route === 'compliance_authorization')
    return { ok: true, violations: [] }
  const fields = [...sel.minimal_fields, ...sel.join_keys.map((k) => k.field)]
  const violations = fields.filter((f) => isProhibitedField(f))
  return { ok: violations.length === 0, violations }
}

export function validateAllSelections(sels: Array<AllowedSelection>): {
  ok: boolean
  violations: Array<SelectionViolation>
} {
  const violations: Array<SelectionViolation> = []
  for (const sel of sels) {
    for (const field of validateSelection(sel).violations) {
      violations.push({
        dataset: sel.dataset,
        acquisition_route: sel.acquisition_route,
        field,
      })
    }
  }
  return { ok: violations.length === 0, violations }
}
