#!/usr/bin/env npx tsx
/**
 * Guarded LIVE comms test — sends controlled messages through the REAL
 * dispatchOutbound path (CommGate + the live central-mcp broker) to a SINGLE
 * explicit recipient you own. This is the artifact-on-the-far-side proof a mock
 * can never give.
 *
 * SAFETY:
 *  - Sends ONLY to the recipient passed in env (no roster, no broadcast).
 *  - Refuses to run unless OUTBOUND_LIVE_ENABLED=true AND --confirm is passed.
 *  - Goes through dispatchOutbound, so every CommGate layer applies.
 *
 * Usage (inside the studio container, after deploy + creds):
 *   OUTBOUND_LIVE_ENABLED=true SIGNALWIRE_FROM=+1XXXXXXXXXX \
 *   TEST_PROFILE=serra-honda TEST_PHONE=+14126546500 TEST_EMAIL=you@example.com \
 *   npx tsx scripts/live-comms-test.ts --confirm
 *
 * Channels attempted: email (resend), sms (signalwire). Voice/video are left
 * out until the provider decision is made.
 */
import { dispatchOutbound } from '../src/server/messaging-adapters'

async function main() {
  const confirmed = process.argv.includes('--confirm')
  const profile = process.env.TEST_PROFILE || 'serra-honda'
  const phone = process.env.TEST_PHONE || ''
  const email = process.env.TEST_EMAIL || ''

  if (process.env.OUTBOUND_LIVE_ENABLED !== 'true') {
    console.error('[live-test] OUTBOUND_LIVE_ENABLED is not "true" — refusing (gate is fail-closed).')
    process.exit(1)
  }
  if (!confirmed) {
    console.error('[live-test] pass --confirm to actually send. Aborting.')
    process.exit(1)
  }
  if (!phone && !email) {
    console.error('[live-test] set TEST_PHONE and/or TEST_EMAIL (single recipient you own).')
    process.exit(1)
  }

  const stamp = new Date().toISOString()
  const results: Array<{ channel: string; to: string; result: unknown }> = []

  if (email) {
    const thread = synthThread(profile, 'email', email, 'Huminic Studio live email test')
    const r = await dispatchOutbound({
      profile,
      channel: 'email',
      thread,
      content: `Live email test through dispatchOutbound at ${stamp}. If you received this, the gated email path works end-to-end.`,
    })
    results.push({ channel: 'email', to: email, result: r })
  }
  if (phone) {
    const thread = synthThread(profile, 'sms', phone, 'sms test')
    const r = await dispatchOutbound({
      profile,
      channel: 'sms',
      thread,
      content: `Huminic Studio live SMS test at ${stamp}. Reply STOP to opt out.`,
      options: { bypassBusinessHours: true },
    })
    results.push({ channel: 'sms', to: phone, result: r })
  }

  for (const r of results) {
    console.log(`[live-test] ${r.channel} -> ${r.to}: ${JSON.stringify(r.result)}`)
  }
}

function synthThread(profile: string, channel: string, to: string, subject: string) {
  const now = Date.now()
  return {
    id: `live-test-${channel}`,
    profile,
    domain: 'sales',
    channel,
    subject,
    contact_handle: to,
    assigned_agent_id: null,
    status: 'open' as const,
    created_at: now,
    updated_at: now,
    messages: [],
  }
}

main().catch((err) => {
  console.error('[live-test] fatal:', err)
  process.exit(1)
})
