#!/usr/bin/env npx tsx
/**
 * SMS FAST-FOLLOW TRIGGER — DRY-RUN PREVIEW (operator spec, 2026-06).
 *
 * Renders EXACTLY what each trigger's SMS would say, filled with SAMPLE lead
 * data, and PRINTS it. This is a PREVIEW tool so Duane can review the approved
 * copy verbatim before any live send is enabled.
 *
 * SAFETY — this script CANNOT send anything:
 *   - It calls ONLY the pure renderers in src/server/sms-triggers.ts.
 *   - It does NOT call dispatchOutbound, CommGate, TextMagic, or central-mcp.
 *   - It does NOT enable OUTBOUND_LIVE_ENABLED and does NOT enable any trigger
 *     in any profile's studio.yaml.
 *   - The destination phone is printed for context only; NO message leaves here.
 *
 * The actual test text to Duane's phone (+1 412-654-6500) is a SEPARATE, gated
 * step and is intentionally NOT performed by this script.
 *
 * Usage:
 *   npx tsx scripts/sms-trigger-dryrun.ts
 */

import { defaultStudioConfig } from '../src/lib/studio-config'
import {
  renderTrigger1,
  renderTrigger2,
  shouldFireTrigger1,
  shouldFireTrigger2,
  type TriggerLead,
} from '../src/server/sms-triggers'

/** The destination is for CONTEXT ONLY — nothing is ever sent here. */
const SAMPLE_DESTINATION = '+1 412-654-6500' // Duane's phone (preview label only)

/** Hardcoded sample leads — one with a vehicle, one without. */
const SAMPLE_LEADS: Array<{ label: string; lead: TriggerLead }> = [
  {
    label: 'Sample A — vehicle known, third-party source',
    lead: { first_name: 'Marcus', vehicle: '2024 Honda Accord', source: 'third_party' },
  },
  {
    label: 'Sample B — vehicle UNKNOWN, third-party source',
    lead: { first_name: 'Priya', vehicle: null, source: 'third_party' },
  },
  {
    label: 'Sample C — first-party (our widget) lead, vehicle known',
    lead: { first_name: 'Dana', vehicle: '2023 Honda CR-V', source: 'first_party' },
  },
]

function bar(ch = '─', n = 72): string {
  return ch.repeat(n)
}

function previewDomain(domain: 'sales' | 'service'): void {
  // Start from defaults so the printed copy is EXACTLY the approved draft.
  // We force-enable the triggers IN MEMORY ONLY so shouldFire* reports
  // eligibility for the preview — no file, no env, no profile is changed.
  const base = defaultStudioConfig('preview').sms_triggers
  const cfg = {
    ...base,
    domain,
    trigger1: { ...base.trigger1, enabled: true },
    trigger2: { ...base.trigger2, enabled: true },
  }

  console.log(bar('═'))
  console.log(`DOMAIN: ${domain.toUpperCase()}  (${domain === 'sales' ? 'Caroline / Serra Honda' : 'Nancy / Serra Service'})`)
  console.log(bar('═'))

  for (const { label, lead } of SAMPLE_LEADS) {
    console.log()
    console.log(label)
    console.log(`  destination (preview only, NOT sent): ${SAMPLE_DESTINATION}`)
    console.log(bar())

    const fire1 = shouldFireTrigger1(cfg, lead)
    console.log('  TRIGGER 1 (immediate, third-party only)')
    console.log(`    eligible: ${fire1.fire}  — ${fire1.reason}`)
    console.log(`    PREVIEW:  ${renderTrigger1(cfg, lead)}`)
    console.log()

    const fire2 = shouldFireTrigger2(cfg, { sinceFirstContactMin: 1450 })
    console.log('  TRIGGER 2 (24h check-in, all leads)')
    console.log(`    eligible: ${fire2.fire}  — ${fire2.reason}`)
    console.log(`    PREVIEW:  ${renderTrigger2(cfg, lead)}`)
  }
  console.log()
}

function main(): void {
  console.log()
  console.log('SMS FAST-FOLLOW TRIGGER — DRY-RUN PREVIEW')
  console.log('These are PREVIEWS of the rendered copy. NOTHING is sent.')
  console.log('No CommGate, no TextMagic, no central-mcp, no live outbound.')
  console.log()
  previewDomain('sales')
  previewDomain('service')
  console.log(bar('═'))
  console.log('END PREVIEW — no messages were sent. Live send remains gated.')
  console.log(bar('═'))
}

main()
