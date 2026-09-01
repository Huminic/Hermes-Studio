/**
 * M1R — durable, non-PII evidence for the native VinSolutions scheduled deliveries
 * that arrived by Gmail (source_type=gmail_scheduler).
 *
 * Joins the temporary capture manifest + classify report (default
 * /tmp/halo-295-fresh-20260831, override HALO_FRESH_DIR) with the read-only Gmail
 * sender-proof ledger (default /tmp/halo-295-gmail-sender-proof.json, override
 * HALO_GMAIL_SENDER_PROOF) and writes a durable evidence artifact carrying ONLY
 * non-PII provenance + verdicts:
 *   docs/halo/evidence/m1r/scheduled/native-scheduled-evidence.json
 *
 * The `sender` is NOT hard-coded: it is bound per delivery from the ledger, which
 * independently proved from=reportscheduler@motosnap.com for each exact message ID
 * via a read-only Gmail metadata read. Attachment IDs were not captured, so they
 * are recorded as unavailable — never invented. Persists NO signed URLs, NO raw
 * XLSX, NO row-level content. Read-only on the source; no promotion, /srv, network.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const DIR = process.env.HALO_FRESH_DIR ?? '/tmp/halo-295-fresh-20260831'
const LEDGER =
  process.env.HALO_GMAIL_SENDER_PROOF ?? '/tmp/halo-295-gmail-sender-proof.json'
const LEDGER_SHA =
  '7820cfa7f0f6d90f38adc4a814169f835a8de74f5c9a78ebefed5f019480f293'
const OUT = path.resolve('docs/halo/evidence/m1r/scheduled')
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex')

type ManifestEntry = {
  profile: string
  family: string
  period_hint: string
  message_id: string
  subject: string
  received_at: string
  filename: string
  downloaded_size_bytes: number
  sha256: string
}
type ClassifyEntry = {
  filename: string
  validation_state: string
  quarantine_reason?: string | null
  tab_rows?: Record<string, number>
}
type LedgerRecord = {
  message_id: string
  from: string
  subject: string
  date: string
}
type Ledger = {
  mailbox: string
  proof_method: string
  expected_sender: string
  attachment_id_status: string
  messages: Array<LedgerRecord>
}

function cadenceOf(periodHint: string): { cadence: string; period: string } {
  if (periodHint.includes('/'))
    return { cadence: 'weekly', period: periodHint.replace('/', '..') }
  return { cadence: 'daily', period: periodHint }
}

function main(): void {
  const manifest: Array<ManifestEntry> = JSON.parse(
    fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'),
  )
  const classify: Array<ClassifyEntry> = JSON.parse(
    fs.readFileSync(path.join(DIR, 'classify-report.json'), 'utf8'),
  )

  // Verify the sender-proof ledger by SHA-256 before trusting it.
  const ledgerBuf = fs.readFileSync(LEDGER)
  const ledgerSha = sha256(ledgerBuf)
  if (ledgerSha !== LEDGER_SHA)
    throw new Error(
      `sender-proof ledger sha ${ledgerSha} != expected ${LEDGER_SHA}`,
    )
  const ledger: Ledger = JSON.parse(ledgerBuf.toString('utf8'))
  const senderById = new Map(ledger.messages.map((m) => [m.message_id, m.from]))

  const byFile = new Map(classify.map((c) => [c.filename, c]))
  fs.mkdirSync(OUT, { recursive: true })

  const deliveries = manifest.map((m) => {
    const c = byFile.get(m.filename)
    const { cadence, period } = cadenceOf(m.period_hint)
    const dataRows = c?.tab_rows
      ? Object.values(c.tab_rows).reduce((a, b) => a + b, 0)
      : null
    // Sender bound from the verified ledger — never hard-coded/invented.
    const sender = senderById.get(m.message_id)
    if (!sender)
      throw new Error(
        `message ${m.message_id} (${m.filename}) absent from sender-proof ledger`,
      )
    return {
      // Provenance (gmail-scheduler contract; sender proven by ledger; no URLs):
      source_type: 'gmail_scheduler',
      sender,
      subject: m.subject,
      gmail_message_id: m.message_id,
      gmail_attachment_id: 'unavailable', // ledger: attachment IDs were not captured
      received_at: m.received_at,
      filename: m.filename,
      bytes: m.downloaded_size_bytes,
      sha256: m.sha256,
      profile: m.profile,
      family: m.family,
      period_hint: m.period_hint,
      cadence,
      period,
      // Verdict (classifier; held = accepted-eligible, NOT promoted):
      validation_state: c?.validation_state ?? 'unknown',
      quarantine_reason: c?.quarantine_reason ?? null,
      data_row_total: dataRows,
    }
  })

  const held = deliveries.filter((d) => d.validation_state === 'held')
  const quarantined = deliveries.filter(
    (d) => d.validation_state === 'quarantined',
  )
  const sendersProven = new Set(deliveries.map((d) => d.sender))
  const evidence = {
    artifact: 'm1r-native-scheduled-evidence',
    source_type: 'gmail_scheduler',
    sender_proof: {
      expected_sender: ledger.expected_sender,
      distinct_senders_observed: [...sendersProven].sort(),
      mailbox: ledger.mailbox,
      proof_method: ledger.proof_method,
      ledger_sha256: LEDGER_SHA,
      attachment_id_status: ledger.attachment_id_status,
    },
    capture_note:
      'Non-PII durable evidence for the 18 native scheduled deliveries (Gmail). sender is bound per delivery from the SHA-verified read-only Gmail metadata ledger (not hard-coded); every message independently reports from=reportscheduler@motosnap.com. Attachment IDs were not captured (recorded as unavailable). No signed URLs, no raw XLSX, no row-level PII.',
    periods: { weekly: '2026-08-24..2026-08-30', daily: '2026-08-30' },
    summary: {
      total: deliveries.length,
      held: held.length,
      quarantined: quarantined.length,
      held_families: [...new Set(held.map((d) => d.family))].sort(),
      quarantined_families: [
        ...new Set(quarantined.map((d) => d.family)),
      ].sort(),
    },
    quarantine_cause:
      'All 9 quarantined deliveries (cage_kpi, lead_source_roi, sales_comm_log × 3) positively select hidden Lead Intents of Parts and Service. Clean visible rows and a Lead-Sources-Excluded filter do not cure this. Never promote or calculate from these 9.',
    notes: [
      'Honda daily sales_comm_log additionally has zero real data rows.',
      'Held = classifier accepted-eligible only; NOT promotion into analytics.',
    ],
    deliveries: deliveries.sort((a, b) =>
      (a.profile + a.family).localeCompare(b.profile + b.family),
    ),
  }
  fs.writeFileSync(
    path.join(OUT, 'native-scheduled-evidence.json'),
    JSON.stringify(evidence, null, 2) + '\n',
    'utf8',
  )

  console.log(
    `held=${held.length} quarantined=${quarantined.length} senders=${[...sendersProven].join(',')} -> ${path.relative(process.cwd(), OUT)}/native-scheduled-evidence.json`,
  )
}

main()
