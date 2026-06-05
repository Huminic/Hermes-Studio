#!/usr/bin/env tsx
/**
 * Stand up a dealer profile to serra-honda's level — repeatable + idempotent.
 *
 * Templates off the serra-honda profile (the reference storefront): copies its
 * company-wiki, agent roster (governance/agents), and knowledge tree (widgets,
 * operating-manuals, inbox/drafts/published), token-replacing the brand + slug,
 * then writes a dealer-specific studio.yaml and an admin auth.yaml.
 *
 * Notification format per group (NEXXUS_FIT_SPEC §5):
 *   - Serra group  -> notifications.lead_format: adf-xml
 *   - Columbia      -> notifications.lead_format: email
 *
 * Usage:
 *   pnpm tsx scripts/standup-dealer.ts [--dry-run] [--force] [--only=<slug>]
 *
 * Honors $BRAIN_PROFILES_ROOT (defaults to ~/.hermes/profiles). Idempotent:
 * existing files are skipped unless --force. Lead recipient defaults to the
 * test inbox; the operator points it at the dealership BDC list at cutover.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { hashPassword } from '../src/server/password-hash'

const TEMPLATE = 'serra-honda'
const LAUNCH_PASSWORD = 'De@l$ucce$'
const TEST_LEAD_RECIPIENT = 'neoweaver@gmail.com'
const COPY_DIRS = ['company-wiki', 'governance/agents', 'knowledge']
const TEXT_EXT = new Set(['.md', '.yaml', '.yml', '.json', '.txt'])

type Group = 'serra' | 'columbia'
type Dealer = { slug: string; brand: string; accent: string; group: Group; orgId: string }

// Nexxus org UUIDs (the orgId VIN calls require) — verified from the Nexxus
// Supabase DB 2026-06-03, recorded in memory reference-store-org-uuid-map.
const DEALERS: Array<Dealer> = [
  { slug: 'serra-nissan', brand: 'Serra Nissan', accent: '#c3002f', group: 'serra', orgId: '4a23d5ad-38ff-4016-8af5-f4cfc9fd88cd' },
  { slug: 'tony-serra-ford', brand: 'Tony Serra Ford', accent: '#1c3f94', group: 'serra', orgId: '2cbf687f-7cd5-480c-b81c-220cb632cd91' },
  { slug: 'hyundai-of-columbia', brand: 'Hyundai of Columbia', accent: '#002c5f', group: 'columbia', orgId: 'f18cbf4e-bcbd-46fe-bf54-33bcee4afec8' },
  { slug: 'ford-of-columbia', brand: 'Ford of Columbia', accent: '#1c3f94', group: 'columbia', orgId: '6ae2548b-f6ec-4b1e-8d8b-ae565123f0df' },
]

function profilesRoot(): string {
  return process.env.BRAIN_PROFILES_ROOT ?? path.join(os.homedir(), '.hermes', 'profiles')
}

function applyTokens(text: string, d: Dealer): string {
  return text.replace(/serra-honda/g, d.slug).replace(/Serra Honda/g, d.brand)
}

function copyTree(src: string, dst: string, d: Dealer, force: boolean, dryRun: boolean, log: (s: string) => void): void {
  if (!fs.existsSync(src)) return
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name)
    // Rename serra-honda-* widget files to <slug>-*.
    const to = path.join(dst, applyTokens(entry.name, d))
    if (entry.isDirectory()) {
      if (!dryRun) fs.mkdirSync(to, { recursive: true })
      copyTree(from, to, d, force, dryRun, log)
    } else if (entry.isFile()) {
      if (fs.existsSync(to) && !force) {
        continue
      }
      const ext = path.extname(entry.name).toLowerCase()
      if (!dryRun) {
        fs.mkdirSync(path.dirname(to), { recursive: true })
        if (TEXT_EXT.has(ext)) {
          fs.writeFileSync(to, applyTokens(fs.readFileSync(from, 'utf8'), d), 'utf8')
        } else {
          fs.copyFileSync(from, to)
        }
      }
    }
  }
}

function studioYaml(d: Dealer): string {
  const leadFormat = d.group === 'serra' ? 'adf-xml' : 'email'
  return [
    `# ${d.brand} storefront profile — provisioned via scripts/standup-dealer.ts.`,
    `# Notification format: ${leadFormat} (${d.group} group, NEXXUS_FIT_SPEC §5).`,
    'branding:',
    `  persona_name: ${JSON.stringify(d.brand)}`,
    `  accent_color: ${JSON.stringify(d.accent)}`,
    'menu:',
    '  chat: true',
    '  knowledge: true',
    '  tools: true',
    '  data: true',
    '  comms: true',
    '  campaigns: true',
    'agent_picker:',
    '  visible_agents:',
    '    - caroline',
    '    - nancy-gaston',
    '    - crm-guru',
    '    - semantic-guardian',
    '  default_agent: caroline',
    'tools_widget:',
    '  show_embed_snippet: true',
    '  show_live_demo: true',
    '  consult: false',
    'widgets:',
    `  - slug: ${d.slug}-sales-chat`,
    '    mode: chat',
    '    agent: caroline',
    `  - slug: ${d.slug}-service`,
    '    mode: chat',
    '    agent: nancy-gaston',
    `  - slug: ${d.slug}-contact`,
    '    mode: form',
    '    agent: caroline',
    'autonomous_reply_defaults:',
    '  enabled: false',
    '  business_hours_only: false',
    '  max_agent_turns: 3',
    '  channels: []',
    'federation:',
    '  read_scopes:',
    '    - vin            # VinSolutions live source (federated_search)',
    '    - databrain      # per-profile DuckDB/Brain analytics',
    'vin:',
    `  org_id: ${d.orgId}   # Nexxus org UUID — required by vin_query_leads/vin_get_contact`,
    '  name_resolve_cap: 10',
    '  watcher:',
    '    enabled: false   # operator master gate for lead follow-up (off until cutover)',
    'notifications:',
    `  lead_format: ${leadFormat}`,
    `  lead_recipient: ${TEST_LEAD_RECIPIENT}   # TEST inbox; operator points at the BDC list at cutover`,
    'lead_notifications:',
    `  adf_email: ${TEST_LEAD_RECIPIENT}`,
    `  sender_name: ${JSON.stringify(d.brand + ' new lead')}`,
    '  resend_token_var: CENTRAL_MCP_TOKEN',
    '',
  ].join('\n')
}

async function standup(d: Dealer, force: boolean, dryRun: boolean): Promise<void> {
  const root = profilesRoot()
  const src = path.join(root, TEMPLATE)
  const dst = path.join(root, d.slug)
  const log = (s: string) => console.log(`  ${s}`)
  console.log(`\n=== ${d.slug} (${d.brand}, ${d.group}) ===`)
  if (!fs.existsSync(src)) {
    console.log(`  SKIP — template ${TEMPLATE} not found at ${src}`)
    return
  }
  if (!dryRun) fs.mkdirSync(dst, { recursive: true })

  for (const dir of COPY_DIRS) {
    copyTree(path.join(src, dir), path.join(dst, applyTokens(dir, d)), d, force, dryRun, log)
    log(`copied ${dir}/ (token-replaced)`) // dryRun also logs intent
  }

  // studio.yaml — always (re)generated; it is operator-controlled config (the
  // customer never hand-edits it), so regenerating keeps org IDs/flags current.
  const studioPath = path.join(dst, 'studio.yaml')
  if (!dryRun) {
    fs.writeFileSync(studioPath, studioYaml(d), 'utf8')
    log('wrote studio.yaml (org_id wired)')
  } else {
    log('[dry-run] write studio.yaml')
  }

  // auth.yaml (admin)
  const authPath = path.join(dst, 'auth.yaml')
  if (fs.existsSync(authPath) && !force) {
    log('auth.yaml exists — skip')
  } else if (!dryRun) {
    const hash = await hashPassword(LAUNCH_PASSWORD)
    fs.writeFileSync(
      authPath,
      [
        `# ${d.brand} customer-admin — provisioned by scripts/standup-dealer.ts on ${new Date().toISOString()}`,
        '# Operator MUST direct the customer to reset this password on first login.',
        `username: ${d.slug}@huminic.app`,
        `password_hash: ${hash}`,
        'is_admin: false',
        'is_customer_admin: true',
        '',
      ].join('\n'),
      { mode: 0o600 },
    )
    fs.chmodSync(authPath, 0o600)
    log(`wrote auth.yaml (username=${d.slug}@huminic.app)`)
  } else {
    log('[dry-run] write auth.yaml')
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')
  const force = process.argv.includes('--force')
  const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1]
  const targets = only ? DEALERS.filter((d) => d.slug === only) : DEALERS
  console.log(`standup-dealer — root=${profilesRoot()} dryRun=${dryRun} force=${force} targets=${targets.length}`)
  for (const d of targets) await standup(d, force, dryRun)
  console.log('\ndone.')
}

void main()
