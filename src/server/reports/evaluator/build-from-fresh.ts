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
import {
  readAppointmentsHeld,
  readCrmHeld,
  readDashboardHeld,
} from './held-inputs'
import { buildEnvelope } from './provenance'
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

export function buildSpineFromFresh(opts: {
  freshDir: string
  repoRoot: string
}): Spine {
  const inputs = assembleGate2Inputs(opts)
  return buildSpine(inputs)
}

export function assembleGate2Inputs(opts: {
  freshDir: string
  repoRoot: string
}): Gate2Inputs {
  const { freshDir, repoRoot } = opts
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
  const load = (env: DeliveryEnvelope): Buffer => {
    const buf = fs.readFileSync(path.join(freshDir, env.filename))
    const got = sha256(buf)
    if (got !== env.sha256) {
      throw new Error(
        `sha mismatch for ${env.filename}: ${got} != allowlist ${env.sha256}`,
      )
    }
    return buf
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

    return {
      dealer_id: dl.dealer_id,
      profile: dl.profile,
      dealer_name: dl.dealer_name,
      reporting_period: {
        start: period.start,
        end: period.end,
        timezone: TIMEZONE,
      },
      bundle: { appointments, crm, dashboard },
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
      },
    }
  })

  return { catalog, dealers, registry, evaluableBaselineIds }
}
