/**
 * HUM-VIN-006 acceptance (DEV-only): write MINIMAL SYNTHETIC studio.yaml scaffolding for the three
 * governed Sales profiles into the isolated analytical root, so the dashboard renders from the
 * already-promoted brain.db + RT readbacks. Deliberately synthetic — NO production studio.yaml,
 * messaging-hub.db, credentials, tokens, customer messages, or federation read-scopes are copied
 * or created. No federation.read_scopes ⇒ NO live VinSolutions calls. Outbound explicitly disabled.
 *
 *   DEV_ANALYTICS_ROOT=/srv/ingest-dev/analytics node_modules/.bin/tsx scripts/vin006/scaffold-dev-profiles.ts
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.env.DEV_ANALYTICS_ROOT ?? '/srv/ingest-dev/analytics'
const PROD_MARKERS = ['/.hermes/profiles', '/root/.hermes']
if (!path.isAbsolute(ROOT) || PROD_MARKERS.some((m) => path.resolve(ROOT) === path.resolve(m) || path.resolve(ROOT).startsWith(path.resolve(m) + path.sep))) {
  console.error('refuse: DEV_ANALYTICS_ROOT must be an isolated non-production root'); process.exit(2)
}

const PROFILES: Array<{ profile: string; persona: string; accent: string }> = [
  { profile: 'serra-honda', persona: 'Serra Honda', accent: '#dc2626' },
  { profile: 'serra-nissan', persona: 'Serra Nissan', accent: '#c3002f' },
  { profile: 'tony-serra-ford', persona: 'Tony Serra Ford', accent: '#003478' },
]

const yaml = (persona: string, accent: string) => `# SYNTHETIC dev scaffolding — HUM-VIN-006 isolated acceptance. NOT production data.
# Governed identity only. No federation read-scopes (⇒ NO live VinSolutions calls).
# Outbound dispatch disabled (belt-and-suspenders to the OUTBOUND_LIVE_ENABLED global gate).
branding:
  persona_name: "${persona}"
  accent_color: "${accent}"
menu:
  chat: false
  knowledge: false
  tools: false
  data: true
  comms: true
  campaigns: false
comms:
  outbound_enabled: false
  channels:
    email: false
    sms: false
    voice: false
federation:
  read_scopes: []
`

for (const p of PROFILES) {
  const dir = path.join(ROOT, p.profile)
  if (!fs.existsSync(path.join(dir, 'brain', 'brain.db')) && !fs.existsSync(path.join(dir, 'response-times'))) {
    console.log(`SKIP ${p.profile}: no promoted analytics (brain.db / response-times) — not scaffolding an empty identity`); continue
  }
  fs.mkdirSync(dir, { recursive: true })
  const cfg = path.join(dir, 'studio.yaml')
  fs.writeFileSync(cfg, yaml(p.persona, p.accent))
  console.log(`WROTE ${cfg} (synthetic: ${p.persona}, no federation, outbound off)`)
}
console.log('done')
