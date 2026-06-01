import { test } from '@playwright/test'

/**
 * Phase 8 workflow-surface suite — Runtime agents (WF-RT-*).
 * Per-dealer agents (Elliott, Caroline, lead-follow-up, lead-response, service, crm-data-guru).
 * Only Elliott is enabled live at launch (huminic-motors / CZ-003). All others .fixme until enabled.
 */

test.describe('Runtime agent workflows', () => {
  test.fixme('WF-RT-001 — Elliott handles inbound Vapi call + emits ADF email', async () => {
    // Requires: live Vapi call inbound, Vapi credentials in huminic-motors/.env (OP-002 + OP-004).
    // ADF emit path validated via vitest (adf-xml.test.ts AC.6.7/6.8) at Phase C.6.
    // End-to-end live call requires manual dispatch + cannot be CI-driven without a SIP gateway.
  })

  test.fixme('WF-RT-002 — Caroline replies to inbound SMS with persona', async () => {
    // OP-002 — per-dealer TextMagic credentials. All dealer Caroline templates ship enabled:false.
  })

  test.fixme('WF-RT-003 — lead-follow-up picks stalled lead + nudges', async () => {
    // Cron-triggered; per-dealer rules. Template ships enabled:false.
  })

  test.fixme('WF-RT-004 — service agent handles inbound service request', async () => {
    // OP-002 + per-dealer service vocabulary. Template ships enabled:false.
  })

  test.fixme('WF-RT-005 — crm-data-guru nightly CRM reconciliation', async () => {
    // VinSolutions MCP not in launch scope per AC.12.3. Template ships enabled:false.
  })
})
