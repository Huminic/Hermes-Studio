/**
 * elliott-test-huminic.ts — Place a test Vapi call using Elliott to
 * verify the NEW Huminic Studio webhook + ADF email pipeline.
 *
 * USAGE:
 *   pnpm tsx scripts/elliott-test-huminic.ts --target <profile-slug> [--phone <number>]
 *
 * Example:
 *   pnpm tsx scripts/elliott-test-huminic.ts --target serra-honda
 *
 * Flow:
 *   1. Elliott places a Vapi outbound call to a target number.
 *   2. The target Vapi assistant must already be configured (in the
 *      Vapi dashboard) to POST end-of-call-report webhooks to
 *      https://studio.huminic.app/api/webhooks/vapi/<profile>.
 *   3. The new webhook lands the call as a thread + emits ADF email
 *      to the profile's lead_notifications.adf_email.
 *
 * IMPORTANT: do NOT use Nexxus production assistant phone numbers
 * unless the operator has already added the Huminic webhook URL as a
 * SECOND webhook on that assistant. Default to a test assistant.
 *
 * Env vars:
 *   VAPI_PRIVATE_KEY — Vapi account key (defaults to the test key in
 *     Nexxus's utilities/elliott-test.ts for parity).
 *   ELLIOTT_ASSISTANT_ID — defaults to the existing test assistant id.
 *   ELLIOTT_PHONE_ID — defaults to the existing test number id.
 */

const VAPI_KEY =
  process.env.VAPI_PRIVATE_KEY || '36bbcd04-eaae-4a28-9331-e404a50e618b'
const ELLIOTT_ASSISTANT_ID =
  process.env.ELLIOTT_ASSISTANT_ID || 'c303d993-bf42-4784-a8cb-247477b1cbdd'
const ELLIOTT_PHONE_ID =
  process.env.ELLIOTT_PHONE_ID || 'a85a9397-25cb-4e35-b784-05cfa5a926b2'

// Same store/phone roster Nexxus uses, slugged for the new system.
const PROFILE_TO_PHONE: Record<string, string> = {
  'serra-honda': '+19012038267',
  'serra-service': '+19014361271',
  'serra-nissan': '+12568623318',
  'tony-serra-ford': '+12564599707',
  'ford-of-columbia': '+19313692815',
  'hyundai-of-columbia': '+19012039398',
}

type CallResult = {
  id?: string
  status?: string
  statusCode?: number
  error?: string
  message?: string
}

async function placeCall(target: string): Promise<CallResult> {
  const res = await fetch('https://api.vapi.ai/call/phone', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${VAPI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      assistantId: ELLIOTT_ASSISTANT_ID,
      phoneNumberId: ELLIOTT_PHONE_ID,
      customer: { number: target },
    }),
  })
  return (await res.json()) as CallResult
}

async function waitForCall(
  callId: string,
  maxWaitMs = 180_000,
): Promise<Record<string, unknown> | null> {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(`https://api.vapi.ai/call/${callId}`, {
      headers: { Authorization: `Bearer ${VAPI_KEY}` },
    })
    const call = (await res.json()) as Record<string, unknown>
    if (call.status === 'ended') return call
    await new Promise((r) => setTimeout(r, 5000))
    process.stdout.write('.')
  }
  return null
}

async function main() {
  const args = process.argv.slice(2)
  const targetIdx = args.indexOf('--target')
  const phoneIdx = args.indexOf('--phone')
  if (targetIdx === -1) {
    console.log(
      'Usage: pnpm tsx scripts/elliott-test-huminic.ts --target <profile-slug> [--phone <number>]',
    )
    console.log('\nAvailable profiles:')
    for (const [slug, phone] of Object.entries(PROFILE_TO_PHONE)) {
      console.log(`  ${slug.padEnd(22)} → ${phone}`)
    }
    process.exit(0)
  }
  const target = args[targetIdx + 1]
  const overridePhone = phoneIdx > -1 ? args[phoneIdx + 1] : null
  const phone =
    overridePhone ?? PROFILE_TO_PHONE[target] ?? null
  if (!phone) {
    console.error(`Unknown target profile '${target}' and no --phone supplied.`)
    process.exit(1)
  }
  console.log(`Calling target ${target} (phone ${phone}) via Elliott...`)
  console.log(
    `Expecting the answering Vapi assistant to POST end-of-call-report to`,
  )
  console.log(`  https://studio.huminic.app/api/webhooks/vapi/${target}`)
  const result = await placeCall(phone)
  if (result.statusCode || result.error) {
    console.error('Call failed:', result.message ?? result.error)
    process.exit(1)
  }
  if (!result.id) {
    console.error('No call ID returned:', result)
    process.exit(1)
  }
  console.log(`Call ID: ${result.id}`)
  console.log(`Status: ${result.status ?? 'queued'}`)
  console.log('Waiting for call to complete...')
  const completed = await waitForCall(result.id)
  if (!completed) {
    console.log('\nTimeout — call did not complete within 3 minutes')
    process.exit(2)
  }
  console.log(`\nCall ended: ${completed.endedReason ?? 'unknown'}`)
  if (completed.summary) console.log(`Summary: ${completed.summary as string}`)
  console.log('\nNext: verify in the new system')
  console.log(
    `  1. https://studio.huminic.app/p/${target}/comms — new "voice" thread should appear in Sales.`,
  )
  console.log(
    `  2. neoweaver@gmail.com — ADF XML email "Vapi lead — Elliott Test" should arrive within ~1 min if lead_notifications.adf_email points there.`,
  )
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
