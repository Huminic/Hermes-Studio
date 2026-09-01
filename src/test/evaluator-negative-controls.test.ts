// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { makeXlsx, makeXlsxSheets } from './helpers/make-xlsx'
import type { EvalRow } from '@/server/reports/evaluator/types'
import type { HeldBundle } from '@/server/reports/evaluator/evaluators'
import {
  HeldInputError,
  readAppointmentsHeld,
  readCrmHeld,
  readDashboardHeld,
} from '@/server/reports/evaluator/held-inputs'
import { evalSW031, evalSW032 } from '@/server/reports/evaluator/evaluators'
import { QUARANTINED_FAMILIES } from '@/server/reports/evaluator/families'

const REPO = path.resolve(__dirname, '..', '..')
const LEDGER = JSON.parse(
  fs.readFileSync(
    path.join(REPO, 'docs/halo/evidence/m1r/evaluator/spine-ledger.json'),
    'utf8',
  ),
) as { rows: Array<EvalRow> }

const APPT_HEADER = [
  'Appointment ID',
  'Dealer ID',
  'Appt Reason',
  'Is Show',
  'Is No Show',
  'Is Confirmed',
  'Is Completed',
  'Is Cancelled',
]
const apptRow = (
  dealer: string,
  reason: string,
  show: string,
  noShow: string,
) => ['1', dealer, reason, show, noShow, 'Yes', 'Yes', 'No']

function dashboard(opts: {
  dealer: string
  excluded: string
  leadTypes?: string
}): Buffer {
  return makeXlsxSheets([
    {
      name: 'Report',
      rows: [
        ['Dealership Summary'],
        ['', 'Leads', 'Appts Set', 'Appts Set %', 'Sold in Period'],
        ['New', '10', '1', '0.1', '0'],
        ['TOTAL', '20', '5', '0.25', '2'],
      ],
    },
    {
      name: 'Filters',
      rows: [
        ['Filter Name', 'Number Selected', 'Selected Values'],
        ['Dealers', '1', opts.dealer],
        ['Date Range Begin', '1', 'Aug 24 2026 12:00AM'],
        ['Date Range End', '1', 'Aug 30 2026 11:59PM'],
        ['Lead Sources Excluded', '5', opts.excluded],
        ['Appointment Reasons', '1', 'Sales Appointment'],
        ['Lead Types', '3', opts.leadTypes ?? 'Internet, Phone, Walk-in'],
        ['Inventory Types', '4', 'Certified, New, Unknown, Used'],
        ['Lead Status Types', '3', 'Active, Lost, Sold'],
      ],
    },
  ])
}
const WINDOW = {
  dealerName: 'Serra Nissan of Sylacauga',
  periodBeginLabel: 'Aug 24 2026 12:00AM',
  periodEndLabel: 'Aug 30 2026 11:59PM',
}

describe('Fail-closed on Service/Parts token in DATA rows (req 6)', () => {
  it('appointments data row with a Service token throws', () => {
    const buf = makeXlsx([
      APPT_HEADER,
      apptRow('21044', 'Service Appointment', 'Yes', 'No'),
    ])
    expect(() => readAppointmentsHeld(buf, '21044')).toThrow(HeldInputError)
  })
  it('crm data row with a Parts token throws', () => {
    const header = ['Dealer ID', 'Inventory Type', 'Front Gross', 'Model']
    const buf = makeXlsx([header, ['21044', 'New', '100', 'Parts Special']])
    expect(() => readCrmHeld(buf, '21044')).toThrow(HeldInputError)
  })
  it('dashboard summary data row with a Service token throws', () => {
    const buf = makeXlsxSheets([
      {
        name: 'Report',
        rows: [
          ['Dealership Summary'],
          ['', 'Leads', 'Appts Set', 'Appts Set %', 'Sold in Period'],
          ['Service', '10', '1', '0.1', '0'],
          ['TOTAL', '20', '5', '0.25', '2'],
        ],
      },
      {
        name: 'Filters',
        rows: [
          ['Filter Name', 'Number Selected', 'Selected Values'],
          ['Dealers', '1', WINDOW.dealerName],
          ['Date Range Begin', '1', 'Aug 24 2026 12:00AM'],
          ['Date Range End', '1', 'Aug 30 2026 11:59PM'],
          ['Lead Sources Excluded', '5', 'Service, Service Dept'],
          ['Appointment Reasons', '1', 'Sales Appointment'],
          ['Lead Types', '3', 'Internet, Phone, Walk-in'],
          ['Inventory Types', '4', 'Certified, New, Unknown, Used'],
          ['Lead Status Types', '3', 'Active, Lost, Sold'],
        ],
      },
    ])
    expect(() => readDashboardHeld(buf, WINDOW)).toThrow(HeldInputError)
  })
})

describe('Dashboard Filters must AFFIRMATIVELY prove Sales-only (req 6)', () => {
  it('reads when Service is in the Excluded list', () => {
    const d = readDashboardHeld(
      dashboard({
        dealer: WINDOW.dealerName,
        excluded: 'Service, Service Dept',
      }),
      WINDOW,
    )
    expect(d.leads).toBe(20)
    expect(d.apptsSet).toBe(5)
  })
  it('throws when Service is NOT affirmatively excluded', () => {
    expect(() =>
      readDashboardHeld(
        dashboard({
          dealer: WINDOW.dealerName,
          excluded: 'Autotrader, Cars.com',
        }),
        WINDOW,
      ),
    ).toThrow(/Sales-only/)
  })
  it('throws when Service appears in an INCLUSION filter (Lead Types)', () => {
    expect(() =>
      readDashboardHeld(
        dashboard({
          dealer: WINDOW.dealerName,
          excluded: 'Service, Service Dept',
          leadTypes: 'Internet, Service',
        }),
        WINDOW,
      ),
    ).toThrow(/fail closed/)
  })
})

describe('One-rooftop identity + magic bytes (req 6)', () => {
  it('appointments with a foreign Dealer ID throws', () => {
    const buf = makeXlsx([
      APPT_HEADER,
      apptRow('99999', 'Sales Appointment', 'Yes', 'No'),
    ])
    expect(() => readAppointmentsHeld(buf, '21044')).toThrow(/dealer identity/)
  })
  it('non-XLSX bytes throw (bad magic)', () => {
    expect(() =>
      readAppointmentsHeld(Buffer.from('not a zip file'), '21044'),
    ).toThrow(/magic/)
  })
})

describe('Missing is not zero -> NotEvaluable (req 4)', () => {
  it('appointments total 0 -> SW-032 not evaluable', () => {
    const b: HeldBundle = {
      appointments: {
        family: 'appointments',
        total: 0,
        show: 0,
        noShow: 0,
        confirmed: 0,
        completed: 0,
        cancelled: 0,
        dealerIds: ['21044'],
      },
      crm: null,
      dashboard: null,
    }
    const r = evalSW032(b)
    expect(r.ok).toBe(false)
  })
  it('dashboard leads 0 or null -> SW-031 not evaluable', () => {
    const base = {
      family: 'dealership_performance' as const,
      apptsSet: 5,
      apptsSetPct: null,
      soldInPeriod: 0,
      salesOnlyProof: 'x',
      dealerName: 'x',
      periodBegin: 'x',
      periodEnd: 'x',
    }
    expect(
      evalSW031({
        appointments: null,
        crm: null,
        dashboard: { ...base, leads: 0 },
      }).ok,
    ).toBe(false)
    expect(
      evalSW031({
        appointments: null,
        crm: null,
        dashboard: { ...base, leads: null },
      }).ok,
    ).toBe(false)
  })
})

describe('Quarantined input can never produce an evaluated row (req 5)', () => {
  it('no evaluated ledger row is sourced from a quarantined family', () => {
    for (const r of LEDGER.rows.filter((x) => x.status === 'evaluated')) {
      expect(QUARANTINED_FAMILIES.includes(r.source_family ?? '')).toBe(false)
    }
  })
  it('an absent held family yields NotEvaluable (no fabricated evaluation)', () => {
    expect(
      evalSW031({ appointments: null, crm: null, dashboard: null }).ok,
    ).toBe(false)
    expect(
      evalSW032({ appointments: null, crm: null, dashboard: null }).ok,
    ).toBe(false)
  })
})
