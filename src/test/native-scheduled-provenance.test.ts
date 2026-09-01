// @vitest-environment node
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

// Durable evidence + contract for the 18 native scheduled (Gmail) deliveries.
const EV = JSON.parse(
  fs.readFileSync(
    new URL(
      '../../docs/halo/evidence/m1r/scheduled/native-scheduled-evidence.json',
      import.meta.url,
    ),
    'utf8',
  ),
)
const CONTRACT = JSON.parse(
  fs.readFileSync(
    new URL(
      '../../docs/halo/contract/gmail-scheduler-provenance-contract.json',
      import.meta.url,
    ),
    'utf8',
  ),
)

describe('Native scheduled provenance (shadow #3)', () => {
  it('18 deliveries: 9 held / 9 quarantined with the expected families', () => {
    expect(EV.deliveries.length).toBe(18)
    expect(EV.summary.held).toBe(9)
    expect(EV.summary.quarantined).toBe(9)
    expect(EV.summary.held_families).toEqual([
      'appointments',
      'crm_sales_gross',
      'dealership_performance',
    ])
    expect(EV.summary.quarantined_families).toEqual([
      'cage_kpi',
      'lead_source_roi',
      'sales_comm_log',
    ])
  })

  it('sender is the PROVEN scheduler address on every delivery (not invented)', () => {
    expect(EV.sender_proof.expected_sender).toBe('reportscheduler@motosnap.com')
    expect(EV.sender_proof.distinct_senders_observed).toEqual([
      'reportscheduler@motosnap.com',
    ])
    expect(EV.sender_proof.ledger_sha256).toBe(
      '7820cfa7f0f6d90f38adc4a814169f835a8de74f5c9a78ebefed5f019480f293',
    )
    expect(String(EV.sender_proof.proof_method)).toMatch(
      /read-only Gmail metadata/i,
    )
    for (const d of EV.deliveries) {
      expect(d.source_type).toBe('gmail_scheduler')
      expect(d.sender).toBe('reportscheduler@motosnap.com')
      // Attachment IDs were not captured — recorded as unavailable, not invented.
      expect(d.gmail_attachment_id).toBe('unavailable')
      // Required provenance fields all present.
      for (const f of [
        'subject',
        'gmail_message_id',
        'received_at',
        'filename',
        'bytes',
        'sha256',
        'profile',
        'family',
        'period_hint',
      ]) {
        expect(d[f], `${d.filename}.${f}`).toBeDefined()
      }
    }
  })

  it('no signed URLs or raw-file leakage in the durable evidence (PII-safe)', () => {
    const text = JSON.stringify(EV)
    expect(text).not.toMatch(/https?:\/\//)
    expect(text.toLowerCase()).not.toContain('signed_url')
    expect(text.toLowerCase()).not.toContain('download_url')
  })

  it('gmail-scheduler contract requires sender + records attachment id unavailable', () => {
    expect(CONTRACT.expected_sender).toBe('reportscheduler@motosnap.com')
    expect(CONTRACT.required_provenance_fields).toContain('sender')
    expect(CONTRACT.unavailable_fields.gmail_attachment_id).toMatch(
      /not captured/i,
    )
    expect(CONTRACT.prohibited_persisted_fields).toContain(
      'signed_download_url',
    )
  })
})
