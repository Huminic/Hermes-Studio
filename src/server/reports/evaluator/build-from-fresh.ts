/**
 * Assemble Gate 2 spine inputs from the fresh capture directory + committed contracts,
 * then build the spine. Shared by the generator script AND the tests so "recompute"
 * and "determinism" are proven against the exact same path (no divergent logic).
 *
 * Reads ONLY the nine HELD deliveries by exact filename+full-sha256 allowlist derived
 * from the committed native-scheduled-evidence.json. Never reads the quarantined nine.
 * The reporting period is derived + validated from each delivery's committed period_hint
 * (never hardcoded); provenance is validated fail-closed per SCHEMA_CONTRACT §1.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { loadBaselineRegistry } from './baseline-registry'
import { loadCatalog } from './catalog'
import { LEADS_FAMILY_SLUG } from './families'
import {
  readAppointmentsHeld,
  readCrmHeld,
  readDashboardHeld,
} from './held-inputs'
import { readLeadsMetrics } from './leads-metrics'
import { buildCaptureEnvelope, buildEnvelope } from './provenance'
import { buildSpine } from './spine'
import type { Period } from './held-inputs'
import type { DeliveryEnvelope } from './provenance'
import type { BaselineRegistry } from './baseline-registry'
import type { CatalogCondition } from './catalog'
import type { DealerInput, Spine } from './spine'

export type Gate2Inputs = {
  catalog: Array<CatalogCondition>
  dealers: Array<DealerInput>
  registry: BaselineRegistry
  evaluableBaselineIds: Record<string, string>
}

const DEALERS = [
  {
    dealer_id: '21043',
    profile: 'serra-honda',
    dealer_name: 'Serra Honda of Sylacauga',
  },
  {
    dealer_id: '21044',
    profile: 'serra-nissan',
    dealer_name: 'Serra Nissan of Sylacauga',
  },
  {
    dealer_id: '21047',
    profile: 'tony-serra-ford',
    dealer_name: 'Tony Serra Ford',
  },
]
const TIMEZONE = 'America/New_York'
const HELD_FAMILIES = [
  'appointments',
  'crm_sales_gross',
  'dealership_performance',
]
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/** ISO 'YYYY-MM-DD' -> VinSolutions Filters label, e.g. 'Aug 24 2026 12:00AM'. */
function dashboardLabel(iso: string, kind: 'begin' | 'end'): string {
  const [y, m, d] = iso.split('-').map((x) => Number(x))
  const time = kind === 'begin' ? '12:00AM' : '11:59PM'
  return `${MONTHS[m - 1]} ${d} ${y} ${time}`
}

type Delivery = {
  filename: string
  sha256: string
  profile: string
  family: string
  validation_state: string
  received_at: string
  source_type: string
  sender: string
  subject: string
  gmail_message_id: string
  gmail_attachment_id: string
  period_hint: string
}

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex')

function readJson(p: string): unknown {
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

// Committed non-PII Leads golden = the accepted-provenance allowlist (capture_id,
// filename, full sha256, period). source_url + captured_at live ONLY in the capture
// manifest and are cross-checked (sha must equal the golden) before admission.
type LeadsGoldenFile = {
  capture_id: string
  profile: string
  dealer_id: string
  filename: string
  sha256: string
  period: { start: string; end: string }
}
type LeadsManifestFile = {
  capture_id: string
  profile: string
  filename: string
  sha256: string
  source_url: string
  captured_at: string
}

/**
 * The accepted Leads deliveries (browser_capture family) as a promotion-probe allowlist,
 * derived from the committed non-PII golden — the same provenance (capture_id/filename/
 * full sha256/period) the spine binds. Shared by the Gate 3 closure generator + tests so
 * the probe's accepted-evidence set never diverges from the committed golden.
 */
export function leadsAcceptedDeliveries(repoRoot: string): Array<{
  profile: string
  family: string
  sha256: string
  filename: string
  period_hint: string
}> {
  const golden = readJson(
    path.join(repoRoot, 'docs/halo/evidence/m1r/leads/leads-real-golden.json'),
  ) as { files: Array<LeadsGoldenFile> }
  return golden.files.map((g) => ({
    profile: g.profile,
    family: LEADS_FAMILY_SLUG,
    sha256: g.sha256,
    filename: g.filename,
    period_hint: `${g.period.start}/${g.period.end}`,
  }))
}

export function buildSpineFromFresh(opts: {
  freshDir: string
  repoRoot: string
  leadsDir?: string
}): Spine {
  const inputs = assembleGate2Inputs(opts)
  return buildSpine(inputs)
}

export function assembleGate2Inputs(opts: {
  freshDir: string
  repoRoot: string
  leadsDir?: string
}): Gate2Inputs {
  const { freshDir, repoRoot } = opts
  const leadsDir =
    opts.leadsDir ??
    process.env.HALO_LEADS_DIR ??
    '/tmp/halo-295-leads-20260831'
  const catalog = loadCatalog(
    readJson(
      path.join(
        repoRoot,
        'docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json',
      ),
    ),
  )
  const registry = loadBaselineRegistry(
    readJson(path.join(repoRoot, 'docs/halo/contract/baseline-registry.json')),
  )
  const contract = readJson(
    path.join(repoRoot, 'docs/halo/contract/gate2-evaluator-contract.json'),
  ) as { evaluable_conditions: Record<string, { baseline_id: string }> }
  const evaluableBaselineIds: Record<string, string> = {}
  for (const [id, spec] of Object.entries(contract.evaluable_conditions)) {
    evaluableBaselineIds[id] = spec.baseline_id
  }

  const evidence = readJson(
    path.join(
      repoRoot,
      'docs/halo/evidence/m1r/scheduled/native-scheduled-evidence.json',
    ),
  ) as { deliveries: Array<Delivery> }
  const held = evidence.deliveries.filter(
    (d) => d.validation_state === 'held' && HELD_FAMILIES.includes(d.family),
  )
  const pick = (profile: string, family: string): Delivery => {
    const d = held.find((x) => x.profile === profile && x.family === family)
    if (!d) throw new Error(`no HELD delivery for ${profile}/${family}`)
    return d
  }
  // Envelope (fail-closed provenance + period_hint) then sha-verified bytes.
  const envelopeOf = (d: Delivery): DeliveryEnvelope => buildEnvelope(d)
  const loadFrom = (dir: string, env: DeliveryEnvelope): Buffer => {
    const buf = fs.readFileSync(path.join(dir, env.filename))
    const got = sha256(buf)
    if (got !== env.sha256) {
      throw new Error(
        `sha mismatch for ${env.filename}: ${got} != allowlist ${env.sha256}`,
      )
    }
    return buf
  }
  const load = (env: DeliveryEnvelope): Buffer => loadFrom(freshDir, env)

  // Leads (browser_capture) accepted family — committed golden allowlist + capture manifest.
  const leadsGolden = readJson(
    path.join(repoRoot, 'docs/halo/evidence/m1r/leads/leads-real-golden.json'),
  ) as { files: Array<LeadsGoldenFile> }
  const leadsManifest = readJson(
    path.join(leadsDir, 'capture-manifest.json'),
  ) as { files: Array<LeadsManifestFile> }
  const leadsEnvelopeOf = (profile: string): DeliveryEnvelope => {
    const g = leadsGolden.files.find((f) => f.profile === profile)
    if (!g) throw new Error(`no committed leads golden for ${profile}`)
    const cm = leadsManifest.files.find((f) => f.capture_id === g.capture_id)
    if (!cm)
      throw new Error(`no leads capture-manifest entry for ${g.capture_id}`)
    // Cross-check the manifest against the committed allowlist before trusting its
    // source_url + captured_at (the only fields not carried in the golden).
    if (cm.sha256 !== g.sha256)
      throw new Error(`leads manifest sha != golden sha for ${g.capture_id}`)
    if (cm.filename !== g.filename)
      throw new Error(`leads manifest filename != golden for ${g.capture_id}`)
    return buildCaptureEnvelope({
      source_type: 'browser_capture',
      capture_id: g.capture_id,
      source_url: cm.source_url,
      captured_at: cm.captured_at,
      filename: g.filename,
      sha256: g.sha256,
      profile,
      family: LEADS_FAMILY_SLUG,
      period_hint: `${g.period.start}/${g.period.end}`,
    })
  }

  const dealers: Array<DealerInput> = DEALERS.map((dl) => {
    const appEnv = envelopeOf(pick(dl.profile, 'appointments'))
    const crmEnv = envelopeOf(pick(dl.profile, 'crm_sales_gross'))
    const dashEnv = envelopeOf(pick(dl.profile, 'dealership_performance'))
    // Period derived from committed period_hint; must agree across the dealer's families.
    if (
      appEnv.period_hint !== crmEnv.period_hint ||
      appEnv.period_hint !== dashEnv.period_hint
    ) {
      throw new Error(`period_hint disagreement for ${dl.profile}`)
    }
    const period: Period = {
      start: appEnv.period_start,
      end: appEnv.period_end,
    }

    const leadsEnv = leadsEnvelopeOf(dl.profile)
    // The accepted Leads capture must cover the SAME governed week as the scheduled
    // families (fail closed if the committed period_hints ever diverge).
    if (
      leadsEnv.period_start !== period.start ||
      leadsEnv.period_end !== period.end
    ) {
      throw new Error(`leads period_hint disagreement for ${dl.profile}`)
    }

    const appointments = readAppointmentsHeld(
      load(appEnv),
      dl.dealer_id,
      period,
    )
    const crm = readCrmHeld(load(crmEnv), dl.dealer_id, period)
    const dashboard = readDashboardHeld(load(dashEnv), {
      dealerName: dl.dealer_name,
      periodBeginLabel: dashboardLabel(period.start, 'begin'),
      periodEndLabel: dashboardLabel(period.end, 'end'),
    })
    const leads = readLeadsMetrics(loadFrom(leadsDir, leadsEnv), dl.dealer_id)

    return {
      dealer_id: dl.dealer_id,
      profile: dl.profile,
      dealer_name: dl.dealer_name,
      reporting_period: {
        start: period.start,
        end: period.end,
        timezone: TIMEZONE,
      },
      bundle: { appointments, crm, dashboard, leads },
      lineage: {
        appointments: {
          envelope: appEnv,
          sales_only_proof: appointments.salesOnlyProof,
          observed_date_range: appointments.observed,
        },
        crm_sales_gross: {
          envelope: crmEnv,
          sales_only_proof: crm.salesOnlyProof,
          observed_date_range: crm.observed,
        },
        dealership_performance: {
          envelope: dashEnv,
          sales_only_proof: dashboard.salesOnlyProof,
          observed_date_range: null,
        },
        leads: {
          envelope: leadsEnv,
          sales_only_proof: leads.sales_only_proof,
          observed_date_range: null,
        },
      },
    }
  })

  return { catalog, dealers, registry, evaluableBaselineIds }
}
