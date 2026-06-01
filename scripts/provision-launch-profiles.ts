#!/usr/bin/env tsx
/**
 * Provision launch-scope profiles + auth.yaml.
 *
 * Closes P-CZ-002 (6 dealer auth.yaml placeholders) + P-CZ-003 (huminic-motors
 * full setup: profile dir + studio.yaml + auth.yaml + Elliott agent SOUL +
 * lead_notifications.yaml).
 *
 * Usage:
 *   pnpm tsx scripts/provision-launch-profiles.ts [--dry-run] [--force]
 *
 * --dry-run: print what would happen without writing
 * --force:   overwrite existing auth.yaml (NOT recommended; password reset
 *            is the canonical way for customers to change their own creds)
 *
 * Runs inside the production hermes-agent container against
 * /root/.hermes/profiles/. Honors $BRAIN_PROFILES_ROOT for test isolation.
 *
 * Idempotent. Re-running with no flags skips any auth.yaml that already exists.
 *
 * SECURITY NOTE: every account is provisioned with the same launch password
 * `De@l$ucce$`. Operator must request customers run the password reset flow
 * (CZ-004/005) on first login. Documented in
 * docs/launch/DECISIONS.log + docs/cutover-ritual.md.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { hashPassword } from '../src/server/password-hash'

const LAUNCH_PASSWORD = 'De@l$ucce$'

type ProfileSpec = {
  slug: string
  username: string
  password: string
  is_admin?: boolean
  is_customer_admin?: boolean
  // Optional: extra files to write for full provisioning (CZ-003).
  studio_yaml?: string
  soul_md?: string
  agents?: Record<string, string> // path under profile/governance/agents/ → content
  lead_notifications?: Record<string, unknown>
  description?: string
}

const SPECS: Array<ProfileSpec> = [
  // CZ-002: 6 dealer placeholders. <slug>@huminic.app / De@l$ucce$.
  {
    slug: 'serra-automotive',
    username: 'serra-automotive@huminic.app',
    password: LAUNCH_PASSWORD,
    is_customer_admin: true,
    description: 'CZ-002 Serra Automotive (parent dealer group)',
  },
  {
    slug: 'serra-nissan',
    username: 'serra-nissan@huminic.app',
    password: LAUNCH_PASSWORD,
    is_customer_admin: true,
    description: 'CZ-002 Serra Nissan',
  },
  {
    slug: 'serra-service',
    username: 'serra-service@huminic.app',
    password: LAUNCH_PASSWORD,
    is_customer_admin: true,
    description: 'CZ-002 Serra Service',
  },
  {
    slug: 'tony-serra-ford',
    username: 'tony-serra-ford@huminic.app',
    password: LAUNCH_PASSWORD,
    is_customer_admin: true,
    description: 'CZ-002 Tony Serra Ford',
  },
  {
    slug: 'ford-of-columbia',
    username: 'ford-of-columbia@huminic.app',
    password: LAUNCH_PASSWORD,
    is_customer_admin: true,
    description: 'CZ-002 Ford of Columbia',
  },
  {
    slug: 'hyundai-of-columbia',
    username: 'hyundai-of-columbia@huminic.app',
    password: LAUNCH_PASSWORD,
    is_customer_admin: true,
    description: 'CZ-002 Hyundai of Columbia',
  },
  // CZ-003: huminic-motors test profile.
  {
    slug: 'huminic-motors',
    username: 'neoweaver@gmail.com',
    password: LAUNCH_PASSWORD,
    is_customer_admin: true,
    description: 'CZ-003 Huminic Motors canary (Elliott→ADF round-trip)',
    // P-FIX-003: schema-correct studio.yaml. Original draft used `brand:` /
    // `display_name:` which the StudioConfigSchema rejects, causing the
    // storefront to fall back to defaults (slug name, no DISABLED tag on
    // Data). Caught during operator-directed Playwright sweep.
    studio_yaml: [
      '# Huminic Motors canary profile (CZ-003).',
      'branding:',
      '  persona_name: Huminic Motors',
      '  accent_color: "#0d9488"',
      'menu:',
      '  chat: true',
      '  knowledge: true',
      '  tools: true',
      '  data: false',
      '  comms: true',
      '  campaigns: true',
      'agent_picker:',
      '  visible_agents: []',
      '  default_agent: elliott',
      'tools_widget:',
      '  show_embed_snippet: true',
      '  show_live_demo: true',
      '  consult: false',
      'autonomous_reply_defaults:',
      '  enabled: false',
      '  business_hours_only: false',
      '  max_agent_turns: 3',
      '  channels: []',
      'federation:',
      '  read_scopes: []',
      'lead_notifications:',
      '  adf_email: neoweaver@gmail.com',
      '',
    ].join('\n'),
    soul_md: [
      '# Huminic Motors',
      '',
      'Huminic Motors is the canary test dealer for the Elliott voice agent →',
      'Vapi webhook → ADF email round-trip. All actual lead notifications route',
      'to neoweaver@gmail.com per `lead_notifications.adf_email` in',
      '`studio.yaml`.',
      '',
      'Active agents:',
      '- elliott (sales voice agent; enabled at launch)',
      '',
      'Disabled agents (per operator decision; opt-in post-launch):',
      '- caroline (SMS responder)',
      '- lead-follow-up',
      '- lead-response',
      '- service',
      '- crm-data-guru',
      '',
    ].join('\n'),
    agents: {
      'elliott.md': [
        '---',
        'id: elliott',
        'name: Elliott',
        'role: sales voice agent',
        'channels:',
        '  - vapi',
        '  - chat',
        'enabled: true',
        'scope_contract: governance/scope-contract.md',
        'approval_matrix: governance/approval-matrix.md',
        'workflow: knowledge/workflows/lead-intake-workflow.md',
        'kanban_lane: sales-intake',
        '---',
        '',
        '# Elliott — Huminic Motors sales voice agent',
        '',
        '## Persona',
        '',
        'Friendly, concise, helpful. Greets the caller, captures vehicle of',
        'interest + contact details + timeline, hands off to the ADF webhook',
        'at end-of-call.',
        '',
        '## Capabilities',
        '',
        '- Conduct natural sales conversations on Vapi',
        '- Collect: customer name, phone, email, vehicle of interest,',
        '  trade-in (if applicable), timeline, comments',
        '- End-of-call webhook posts to',
        '  https://studio.huminic.app/api/webhooks/vapi/huminic-motors',
        '',
        '## Workflow reference',
        '',
        'See `knowledge/workflows/lead-intake-workflow.md` for the full',
        'intake script and ADF emit pipeline.',
        '',
      ].join('\n'),
    },
    lead_notifications: { adf_email: 'neoweaver@gmail.com' },
  },
]

function getProfilesRoot(): string {
  // Mirror src/server/brain-store.ts BRAIN_PROFILES_ROOT precedence.
  const override = process.env.BRAIN_PROFILES_ROOT
  if (override) return override
  const home = os.homedir()
  return path.join(home, '.hermes', 'profiles')
}

async function writeAuthYaml(spec: ProfileSpec, force: boolean, dryRun: boolean) {
  const root = getProfilesRoot()
  const profileDir = path.join(root, spec.slug)
  const authPath = path.join(profileDir, 'auth.yaml')

  // Ensure profile dir exists (CZ-003 needs to create it for huminic-motors;
  // CZ-002 dealers all already have profile dirs from prior Brain provisioning).
  if (!fs.existsSync(profileDir)) {
    if (dryRun) {
      console.log(`[dry-run] mkdir -p ${profileDir}`)
    } else {
      fs.mkdirSync(profileDir, { recursive: true })
    }
  }

  // auth.yaml
  if (fs.existsSync(authPath) && !force) {
    console.log(`[skip] ${spec.slug}/auth.yaml already exists`)
  } else {
    const hash = await hashPassword(spec.password)
    const yamlBody = [
      `# ${spec.description ?? spec.slug}`,
      `# Provisioned by scripts/provision-launch-profiles.ts on ${new Date().toISOString()}`,
      `# Operator MUST direct user to run /reset on first login to set their own password.`,
      `username: ${spec.username}`,
      `password_hash: ${hash}`,
      `is_admin: ${spec.is_admin ?? false}`,
      `is_customer_admin: ${spec.is_customer_admin ?? false}`,
      '',
    ].join('\n')
    if (dryRun) {
      console.log(`[dry-run] write ${authPath} (${yamlBody.length} bytes)`)
    } else {
      fs.writeFileSync(authPath, yamlBody, { mode: 0o600 })
      fs.chmodSync(authPath, 0o600)
      console.log(`[wrote] ${spec.slug}/auth.yaml (username=${spec.username})`)
    }
  }

  // studio.yaml (only for CZ-003 huminic-motors; dealers already have one)
  if (spec.studio_yaml) {
    const studioPath = path.join(profileDir, 'studio.yaml')
    if (fs.existsSync(studioPath) && !force) {
      console.log(`[skip] ${spec.slug}/studio.yaml already exists`)
    } else {
      if (dryRun) {
        console.log(`[dry-run] write ${studioPath}`)
      } else {
        fs.writeFileSync(studioPath, spec.studio_yaml, 'utf8')
        console.log(`[wrote] ${spec.slug}/studio.yaml`)
      }
    }
  }

  // SOUL.md
  if (spec.soul_md) {
    const soulPath = path.join(profileDir, 'SOUL.md')
    if (fs.existsSync(soulPath) && !force) {
      console.log(`[skip] ${spec.slug}/SOUL.md already exists`)
    } else {
      if (dryRun) {
        console.log(`[dry-run] write ${soulPath}`)
      } else {
        fs.writeFileSync(soulPath, spec.soul_md, 'utf8')
        console.log(`[wrote] ${spec.slug}/SOUL.md`)
      }
    }
  }

  // agents/<id>.md
  if (spec.agents) {
    const agentsDir = path.join(profileDir, 'governance', 'agents')
    if (!fs.existsSync(agentsDir)) {
      if (dryRun) console.log(`[dry-run] mkdir -p ${agentsDir}`)
      else fs.mkdirSync(agentsDir, { recursive: true })
    }
    for (const [filename, body] of Object.entries(spec.agents)) {
      const agentPath = path.join(agentsDir, filename)
      if (fs.existsSync(agentPath) && !force) {
        console.log(`[skip] ${spec.slug}/governance/agents/${filename} exists`)
      } else {
        if (dryRun) {
          console.log(`[dry-run] write ${agentPath}`)
        } else {
          fs.writeFileSync(agentPath, body, 'utf8')
          console.log(`[wrote] ${spec.slug}/governance/agents/${filename}`)
        }
      }
    }
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const force = process.argv.includes('--force')

  console.log(`provision-launch-profiles starting`)
  console.log(`  profilesRoot = ${getProfilesRoot()}`)
  console.log(`  dryRun       = ${dryRun}`)
  console.log(`  force        = ${force}`)
  console.log(`  specs        = ${SPECS.length}`)
  console.log('')

  let okCount = 0
  let failedCount = 0
  for (const spec of SPECS) {
    try {
      await writeAuthYaml(spec, force, dryRun)
      okCount++
    } catch (e) {
      console.error(`[FAIL] ${spec.slug}:`, (e as Error).message)
      failedCount++
    }
  }

  console.log('')
  console.log(`done: ${okCount} ok, ${failedCount} failed`)
  if (failedCount > 0) process.exit(1)
}

main()
