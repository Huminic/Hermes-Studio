// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { makeXlsx, makeXlsxSheets } from './helpers/make-xlsx'
import type { Period } from '@/server/reports/evaluator/held-inputs'
import {
  ProvenanceError,
  buildEnvelope,
  parsePeriodHint,
} from '@/server/reports/evaluator/provenance'
import {
  HeldInputError,
  readAppointmentsHeld,
  readCrmHeld,
  readDashboardHeld,
} from '@/server/reports/evaluator/held-inputs'

const PERIOD: Period = { start: '2026-08-24', end: '2026-08-30' }
const goodDelivery = {
  source_type: 'gmail_scheduler',
  sender: 'reportscheduler@motosnap.com',
  subject: 'VIN | Serra Nissan 21044 | Appointments | Weekly',
  gmail_message_id: '1a0579be92f703ca',
  gmail_attachment_id: 'unavailable',
  received_at: '2026-08-31T11:37:09+00:00',
  filename: 'Report-2021.xlsx',
  sha256: 'a'.repeat(64),
  profile: 'serra-nissan',
  family: 'appointments',
  period_hint: '2026-08-24/2026-08-30',
}

describe('Provenance envelope (SCHEMA_CONTRACT §1, repair req 2)', () => {
  it('valid gmail_scheduler delivery builds + parses the period', () => {
    const env = buildEnvelope(goodDelivery)
    expect(env.period_start).toBe('2026-08-24')
    expect(env.period_end).toBe('2026-08-30')
    expect(env.gmail_attachment_id).toBe('unavailable')
  })
  it('missing sender / subject / message id each fail closed (never fabricated)', () => {
    expect(() => buildEnvelope({ ...goodDelivery, sender: '' })).toThrow(
      ProvenanceError,
    )
    expect(() => buildEnvelope({ ...goodDelivery, subject: '' })).toThrow(
      ProvenanceError,
    )
    expect(() =>
      buildEnvelope({ ...goodDelivery, gmail_message_id: '' }),
    ).toThrow(/message_id/)
  })
  it('wrong sender / source_type fail closed', () => {
    expect(() =>
      buildEnvelope({ ...goodDelivery, sender: 'someone@else.com' }),
    ).toThrow(/sender/)
    expect(() =>
      buildEnvelope({ ...goodDelivery, source_type: 'browser_export' }),
    ).toThrow(/source_type/)
  })
  it('bad sha / period_hint fail closed', () => {
    expect(() => buildEnvelope({ ...goodDelivery, sha256: 'short' })).toThrow(
      /sha256/,
    )
    expect(() =>
      buildEnvelope({ ...goodDelivery, period_hint: '2026-08-24' }),
    ).toThrow(/period_hint/)
    expect(() => parsePeriodHint('garbage')).toThrow(ProvenanceError)
    expect(() => parsePeriodHint('2026-08-30/2026-08-24')).toThrow(
      /start after end/,
    )
  })
  it('absent attachment id is encoded explicitly, not invented', () => {
    const env = buildEnvelope({ ...goodDelivery, gmail_attachment_id: '' })
    expect(env.gmail_attachment_id).toBe('unavailable')
  })
})

const APPT_HEADER = [
  'Appointment ID',
  'Dealer',
  'Dealer ID',
  'Appt Reason',
  'Appointment Start Date',
  'Appointment Start DateTime',
  'Appointment Status',
  'Is Show',
  'Is No Show',
  'Is Confirmed',
  'Is Completed',
  'Is Cancelled',
]
const apptRow = (
  id: string,
  dealer: string,
  reason: string,
  startSerial: string,
  show: string,
) => [
  id,
  'Serra Nissan',
  dealer,
  reason,
  startSerial,
  startSerial,
  'Completed',
  show,
  'No',
  'Yes',
  'Yes',
  'No',
]

describe('Appointments reader — period + Sales-only enforced (repair req 2,3)', () => {
  it('valid in-period Sales appointments read', () => {
    const buf = makeXlsx([
      APPT_HEADER,
      apptRow('1', '21044', 'Sales Appointment', '46258', 'Yes'),
    ])
    const a = readAppointmentsHeld(buf, '21044', PERIOD)
    expect(a.total).toBe(1)
    expect(a.salesOnlyProof).toMatch(/Sales Appointment/)
  })
  it('out-of-period Appointment Start Date fails closed', () => {
    const buf = makeXlsx([
      APPT_HEADER,
      apptRow('1', '21044', 'Sales Appointment', '46000', 'Yes'),
    ])
    expect(() => readAppointmentsHeld(buf, '21044', PERIOD)).toThrow(
      /outside period/,
    )
  })
  it('non-Sales appointment reason fails closed', () => {
    const buf = makeXlsx([
      APPT_HEADER,
      apptRow('1', '21044', 'Service Walk', '46258', 'Yes'),
    ])
    expect(() => readAppointmentsHeld(buf, '21044', PERIOD)).toThrow(
      HeldInputError,
    )
  })
  it('duplicate Appointment ID fails closed', () => {
    const buf = makeXlsx([
      APPT_HEADER,
      apptRow('1', '21044', 'Sales Appointment', '46258', 'Yes'),
      apptRow('1', '21044', 'Sales Appointment', '46259', 'No'),
    ])
    expect(() => readAppointmentsHeld(buf, '21044', PERIOD)).toThrow(
      /duplicate Appointment ID/,
    )
  })
  it('missing Start DateTime column fails the signature', () => {
    const shortHeader = APPT_HEADER.filter(
      (h) => h !== 'Appointment Start DateTime',
    )
    const row = apptRow(
      '1',
      '21044',
      'Sales Appointment',
      '46258',
      'Yes',
    ).filter((_v, i) => i !== 5)
    expect(() =>
      readAppointmentsHeld(makeXlsx([shortHeader, row]), '21044', PERIOD),
    ).toThrow(/signature/)
  })
})

const CRM_HEADER = [
  'Dealer',
  'Dealer ID',
  'Sold Date',
  'Sale ID',
  'Deal Number',
  'Inventory Type',
  'Front Gross',
  'Back Gross',
  'Total Gross',
]
const crmRow = (dealer: string, sold: string) => [
  'Serra Nissan',
  dealer,
  sold,
  'S1',
  'D1',
  'Used',
  '100',
  '50',
  '150',
]

describe('CRM reader — coverage-window enforced (repair req 2)', () => {
  it('every Sold Date inside the window reads', () => {
    const c = readCrmHeld(
      makeXlsx([CRM_HEADER, crmRow('21044', '46259')]),
      '21044',
      PERIOD,
    )
    expect(c.rowCount).toBe(1)
    expect(c.observed.start).toBe('2026-08-25')
  })
  it('out-of-window Sold Date fails closed', () => {
    expect(() =>
      readCrmHeld(
        makeXlsx([CRM_HEADER, crmRow('21044', '46300')]),
        '21044',
        PERIOD,
      ),
    ).toThrow(/coverage window/)
  })
})

function dashboard(leadTypes: string): Buffer {
  return makeXlsxSheets([
    {
      name: 'Report',
      rows: [
        ['Dealership Summary'],
        [
          '',
          'Leads',
          'Appts Set',
          'Appts Set %',
          'Appts Show',
          'Total Visits',
          'Initial Visits',
          'Be Backs',
          'Sold in Period',
        ],
        ['TOTAL', '20', '5', '0.25', '4', '12', '10', '3', '2'],
        ['Lead Type & Inventory Type Summary'],
        ['', 'Visit Summary'],
        ['', 'Total Visits', 'Initial Visits', 'Be Backs', 'Demo', 'Writeup'],
        ['TOTAL', '12', '10', '3', '1', '6'],
      ],
    },
    {
      name: 'Filters',
      rows: [
        ['Filter Name', 'Number Selected', 'Selected Values'],
        ['Dealers', '1', 'Serra Nissan of Sylacauga'],
        ['Date Range Begin', '1', 'Aug 24 2026 12:00AM'],
        ['Date Range End', '1', 'Aug 30 2026 11:59PM'],
        ['Lead Sources Excluded', '5', 'Service, Service Dept'],
        ['Appointment Reasons', '1', 'Sales Appointment'],
        ['Lead Types', '3', leadTypes],
        ['Inventory Types', '4', 'Certified, New, Unknown, Used'],
        ['Lead Status Types', '3', 'Active, Lost, Sold'],
      ],
    },
  ])
}
const DASH_WIN = {
  dealerName: 'Serra Nissan of Sylacauga',
  periodBeginLabel: 'Aug 24 2026 12:00AM',
  periodEndLabel: 'Aug 30 2026 11:59PM',
}

describe('Dashboard reader — exact Lead Types enforced (repair req 3)', () => {
  it('exactly {Internet, Phone, Walk-in} reads', () => {
    const d = readDashboardHeld(dashboard('Internet, Phone, Walk-in'), DASH_WIN)
    expect(d.leads).toBe(20)
  })
  it('extra / wrong Lead Types fail closed', () => {
    expect(() =>
      readDashboardHeld(dashboard('Internet, Phone'), DASH_WIN),
    ).toThrow(/Lead Types/)
    expect(() =>
      readDashboardHeld(
        dashboard('Internet, Phone, Walk-in, Wholesale'),
        DASH_WIN,
      ),
    ).toThrow(/Lead Types/)
  })
})
