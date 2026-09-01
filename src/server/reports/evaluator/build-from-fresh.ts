/**
 * Assemble Gate 2 spine inputs from the fresh capture directory + committed contracts,
 * then build the spine. Shared by the generator script AND the tests so "recompute"
 * and "determinism" are proven against the exact same path (no divergent logic).
 *
 * Reads ONLY the nine HELD deliveries by exact filename+full-sha256 allowlist derived
 * from the committed native-scheduled-evidence.json. Never reads the quarantined nine.
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
import { buildSpine } from './spine'
import type { DealerInput, Spine } from './spine'

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
const PERIOD = {
  start: '2026-08-24',
  end: '2026-08-30',
  timezone: 'America/New_York',
}
const WINDOW = {
  beginLabel: 'Aug 24 2026 12:00AM',
  endLabel: 'Aug 30 2026 11:59PM',
}
const HELD_FAMILIES = [
  'appointments',
  'crm_sales_gross',
  'dealership_performance',
]

type Delivery = {
  filename: string
  sha256: string
  profile: string
  family: string
  validation_state: string
  received_at: string
}

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex')

function readJson(p: string): unknown {
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

export function buildSpineFromFresh(opts: {
  freshDir: string
  repoRoot: string
}): Spine {
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
  ) as {
    evaluable_conditions: Record<string, { baseline_id: string }>
  }
  const evaluableBaselineIds: Record<string, string> = {}
  for (const [id, spec] of Object.entries(contract.evaluable_conditions)) {
    evaluableBaselineIds[id] = spec.baseline_id
  }

  const evidence = readJson(
    path.join(
      repoRoot,
      'docs/halo/evidence/m1r/scheduled/native-scheduled-evidence.json',
    ),
  ) as {
    deliveries: Array<Delivery>
  }
  const held = evidence.deliveries.filter(
    (d) => d.validation_state === 'held' && HELD_FAMILIES.includes(d.family),
  )
  const pick = (profile: string, family: string): Delivery => {
    const d = held.find((x) => x.profile === profile && x.family === family)
    if (!d) throw new Error(`no HELD delivery for ${profile}/${family}`)
    return d
  }
  const load = (d: Delivery): Buffer => {
    const buf = fs.readFileSync(path.join(freshDir, d.filename))
    const got = sha256(buf)
    if (got !== d.sha256)
      throw new Error(
        `sha mismatch for ${d.filename}: ${got} != allowlist ${d.sha256}`,
      )
    return buf
  }

  const dealers: Array<DealerInput> = DEALERS.map((dl) => {
    const appD = pick(dl.profile, 'appointments')
    const crmD = pick(dl.profile, 'crm_sales_gross')
    const dashD = pick(dl.profile, 'dealership_performance')
    const appointments = readAppointmentsHeld(load(appD), dl.dealer_id)
    const crm = readCrmHeld(load(crmD), dl.dealer_id)
    const dashboard = readDashboardHeld(load(dashD), {
      dealerName: dl.dealer_name,
      periodBeginLabel: WINDOW.beginLabel,
      periodEndLabel: WINDOW.endLabel,
    })
    return {
      dealer_id: dl.dealer_id,
      profile: dl.profile,
      dealer_name: dl.dealer_name,
      reporting_period: PERIOD,
      captured_at: dashD.received_at,
      bundle: { appointments, crm, dashboard },
      lineage: {
        appointments: {
          filename: appD.filename,
          sha256: appD.sha256,
          captured_at: appD.received_at,
          sales_only_proof:
            'one-rooftop Dealer ID; Appt Reason=Sales Appointment; zero Service/Parts tokens in data rows',
        },
        crm_sales_gross: {
          filename: crmD.filename,
          sha256: crmD.sha256,
          captured_at: crmD.received_at,
          sales_only_proof:
            'one-rooftop Dealer ID; Sales user groups; zero Service/Parts tokens in data rows',
        },
        dealership_performance: {
          filename: dashD.filename,
          sha256: dashD.sha256,
          captured_at: dashD.received_at,
          sales_only_proof: dashboard.salesOnlyProof,
        },
      },
    }
  })

  return buildSpine({ catalog, dealers, registry, evaluableBaselineIds })
}
