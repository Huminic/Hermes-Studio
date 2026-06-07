/**
 * register-vapi-webhooks.ts — point each Vapi store assistant's inbound
 * webhook (server.url + server.secret) at the Huminic Studio per-profile
 * endpoint (…/api/webhooks/vapi/<profile>).
 *
 * SAFETY: dry-run by DEFAULT. It prints the planned PATCH per assistant and
 * mutates nothing unless you pass --execute. Executing diverts LIVE inbound
 * voice to Studio — a cutover-moment, operator-go action.
 *
 * Auth (never committed): export VAPI_PRIVATE_KEY + VAPI_WEBHOOK_SECRET in the
 * shell before running. Keys live in nexxus2.2_replit/.env.
 *
 * Usage:
 *   pnpm tsx scripts/register-vapi-webhooks.ts                 # dry-run, all stores
 *   pnpm tsx scripts/register-vapi-webhooks.ts --only serra-honda
 *   pnpm tsx scripts/register-vapi-webhooks.ts --only-test     # only the Elliott test assistant
 *   pnpm tsx scripts/register-vapi-webhooks.ts --host https://live.huminic.app --execute
 *
 * Inventory + mapping: docs/launch/VAPI_WIRING.md (read-only audit 2026-06-07).
 */

type Target = {
  assistantId: string
  vapiName: string
  profile: string
  number: string
  isTest?: boolean
}

// Locked from the read-only Vapi account audit (VAPI_WIRING.md).
const TARGETS: Array<Target> = [
  { assistantId: '90a876c0-0f11-4424-abfe-9ac82b264d88', vapiName: 'Caroline - Serra Honda', profile: 'serra-honda', number: '+19012038267' },
  { assistantId: 'c777f029-8c4c-4a23-98e4-3adfd4112a61', vapiName: 'Nancy Serra Service', profile: 'serra-service', number: '+19014361271' },
  { assistantId: '2203b188-a549-417b-ab33-075766e1b5c1', vapiName: 'Magnolia - Serra Nissan', profile: 'serra-nissan', number: '+12568623318' },
  { assistantId: 'ad478eb2-6602-42c5-9732-3d4648013307', vapiName: 'Georgia - Tony Serra Ford', profile: 'tony-serra-ford', number: '+12564599707' },
  { assistantId: '6d12a8fa-0ed0-4ec1-bfdb-e84587ff86c0', vapiName: 'Elizabeth - Hyundai of Columbia', profile: 'hyundai-of-columbia', number: '+19012039398' },
  { assistantId: '6216451c-e0a3-43d0-aece-ae382bd8df25', vapiName: 'Savannah - Ford of Columbia', profile: 'ford-of-columbia', number: '+19313692815' },
  // Test assistant: for the safe inbound test, point at a REAL profile webhook,
  // verify, then revert. Never leave the test assistant on a store profile.
  { assistantId: 'c303d993-bf42-4784-a8cb-247477b1cbdd', vapiName: 'Elliott - Test Assistant', profile: 'serra-honda', number: '+18392729080', isTest: true },
]

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}
function has(flag: string): boolean {
  return process.argv.includes(flag)
}

async function main() {
  const execute = has('--execute')
  const onlyTest = has('--only-test')
  const only = arg('--only')
  const host = (arg('--host') ?? 'https://studio.huminic.app').replace(/\/$/, '')

  const key = process.env.VAPI_PRIVATE_KEY
  const secret = process.env.VAPI_WEBHOOK_SECRET
  if (!key) {
    console.error('FATAL: VAPI_PRIVATE_KEY not set. export it (see nexxus2.2_replit/.env) and re-run.')
    process.exit(1)
  }
  if (execute && !secret) {
    console.error('FATAL: VAPI_WEBHOOK_SECRET not set — required to sign inbound. export it and re-run.')
    process.exit(1)
  }

  let targets = TARGETS
  if (onlyTest) targets = targets.filter((t) => t.isTest)
  else if (only) targets = targets.filter((t) => t.profile === only && !t.isTest)
  else targets = targets.filter((t) => !t.isTest) // default: the 6 stores, NOT the test assistant

  if (targets.length === 0) {
    console.error('No matching assistants for the given flags.')
    process.exit(1)
  }

  console.log(`Mode: ${execute ? 'EXECUTE (live mutation)' : 'DRY-RUN (no mutation)'}`)
  console.log(`Host: ${host}`)
  console.log(`Assistants: ${targets.length}\n`)

  for (const t of targets) {
    const url = `${host}/api/webhooks/vapi/${t.profile}`
    const patch = { server: { url, secret: execute ? '<VAPI_WEBHOOK_SECRET>' : '(set on --execute)' } }
    console.log(`• ${t.vapiName}  [${t.profile}]  ${t.number}`)
    console.log(`    PATCH https://api.vapi.ai/assistant/${t.assistantId}`)
    console.log(`    server.url → ${url}`)

    if (!execute) {
      console.log('    (dry-run — not sent)\n')
      continue
    }

    const res = await fetch(`https://api.vapi.ai/assistant/${t.assistantId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ server: { url, secret } }),
    })
    if (res.ok) {
      console.log(`    ✓ updated (HTTP ${res.status})\n`)
    } else {
      const body = await res.text().catch(() => '')
      console.log(`    ✗ FAILED HTTP ${res.status}: ${body.slice(0, 300)}\n`)
    }
  }

  if (!execute) {
    console.log('Dry-run complete. Re-run with --execute (and VAPI_WEBHOOK_SECRET set) on operator go.')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
