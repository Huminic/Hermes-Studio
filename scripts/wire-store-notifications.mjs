/**
 * Wire per-store lead-notification routing into each profile's runtime
 * studio.yaml (operator-directed 2026-06-19). Serra sales stores get the human
 * recipients on the styled-email template PLUS the dealer's ADF/XML intake
 * address on the adf-xml template; Columbia stores are left untouched (already
 * correct, email-only). serra-service is intentionally skipped.
 *
 * Recipients + ADF addresses sourced from the Nexxus org settings/users
 * (leads@serrahonda.co / leads@serranissanofsylacauga.net / leads@tonyserraford.net)
 * and confirmed with the operator.
 *
 * Uses the YAML Document API so existing comments and unrelated keys are
 * preserved (no silent rewrite).
 *
 * ENV: HERMES_BASE (default ~/.hermes), DRYRUN=1 (print, no write).
 * Run with the studio repo's node_modules on the path (yaml package).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import YAML from 'yaml'

const BASE =
  process.env.HERMES_BASE ?? path.join(os.homedir(), '.hermes')
const DRYRUN = process.env.DRYRUN === '1'

const HUMANS = [
  ['Victoria Whitley', 'victoria@misscommunicationconsulting.com'],
  ['Don Wood', 'dwood@serrahonda.net'],
  ['Durran Cage', 'durran@cageautomotive.com'],
  ['Duane Wells', 'duane.wells@huminic.ai'],
]

const STORES = {
  'serra-honda': {
    label: 'Serra Honda',
    adfBrand: 'Honda',
    adfLeadSource: 'Dealers WebSite',
    adfTo: 'leads@serrahonda.co',
  },
  'serra-nissan': {
    label: 'Serra Nissan',
    adfBrand: 'Nissan',
    adfLeadSource: 'Dealers WebSite',
    adfTo: 'leads@serranissanofsylacauga.net',
  },
  'tony-serra-ford': {
    label: 'Tony Serra Ford',
    adfBrand: 'Ford',
    adfLeadSource: 'Dealers WebSite',
    adfTo: 'leads@tonyserraford.net',
  },
}

function buildRouting(store) {
  const rules = HUMANS.map(([label, to]) => ({
    event: 'all',
    to,
    channel: 'email',
    label,
    enabled: true,
  }))
  rules.push({
    event: 'all',
    to: store.adfTo,
    channel: 'email',
    format: 'adf-xml',
    label: `${store.label} DMS (ADF)`,
    enabled: true,
  })
  return rules
}

let changed = 0
for (const [slug, store] of Object.entries(STORES)) {
  const file = path.join(BASE, 'profiles', slug, 'studio.yaml')
  if (!fs.existsSync(file)) {
    console.log(`SKIP ${slug}: ${file} not found`)
    continue
  }
  const raw = fs.readFileSync(file, 'utf8')
  const doc = YAML.parseDocument(raw)
  doc.setIn(['notifications', 'lead_format'], 'email')
  doc.setIn(['notifications', 'lead_recipient'], 'duane.wells@huminic.ai')
  doc.setIn(['notifications', 'adf_brand'], store.adfBrand)
  doc.setIn(['notifications', 'adf_lead_source'], store.adfLeadSource)
  doc.setIn(['notifications', 'notify_cooldown_hours'], 4)
  doc.setIn(['notifications', 'routing'], buildRouting(store))
  const out = String(doc)
  if (DRYRUN) {
    console.log(`\n===== ${slug} (DRYRUN) =====`)
    console.log(YAML.stringify(YAML.parseDocument(out).get('notifications')))
  } else {
    fs.writeFileSync(file, out)
    console.log(`WROTE ${slug} (${buildRouting(store).length} rules, ADF ${store.adfTo})`)
    changed++
  }
}
console.log(DRYRUN ? '\n(DRYRUN — no files written)' : `\nDone. ${changed} store(s) updated under ${BASE}.`)
