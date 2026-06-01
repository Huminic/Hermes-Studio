import { test } from '@playwright/test'

/**
 * Phase 8 workflow-surface suite — Cross-actor patterns (WF-XAC-*).
 * The hardest class to test end-to-end — handoffs across actors + time.
 * Most are .fixme until Provisioner + customer-invite + concurrent-edit handling land.
 */

test.describe('Cross-actor pattern workflows', () => {
  test.fixme('WF-XAC-001 — consultative → prescription → Provisioner → customer-admin login', async () => {
    // GAP-PROV-001 — no Provisioner agent. GAP-CUSTOMER-INVITE-001 — no self-service invite.
    // Full handoff chain not testable end-to-end via UI/API today.
  })

  test.fixme('WF-XAC-002 — customer-admin promote → operator approval (today: customer-admin owns published)', async () => {
    // GAP-FLOW-operator-promote-approval-001 — operator decision needed on whether to require approval.
    // Today: customer-admin's promote call goes through /api/customer/wiki/promote directly.
  })

  test.fixme('WF-XAC-003 — runtime agent draft → DSG record → Comms rate-cap → adapter → audit', async () => {
    // Requires Caroline or Elliott live + adapter credentials (OP-002).
  })

  test.fixme('WF-XAC-004 — ADF inbound → parse → contact dedupe → assigned runtime agent → outbound', async () => {
    // ADF parse validated via vitest (adf-xml.test.ts). Full chain needs Resend inbound webhook + Caroline enabled.
  })

  test.fixme('WF-XAC-005 — KSG conflict → DSG reconcile candidate → operator approve → canon updates', async () => {
    // Requires authenticated operator session + curated conflict fixture.
  })

  test.fixme('WF-XAC-006 — concurrent edit handling between customer-admin + operator', async () => {
    // GAP-FLOW-concurrent-edit-001 — CONFIRMED silent-overwrite. No conflict-prompt UI.
    // Test would: simulate two concurrent saves, verify which wins + whether the loser sees a warning.
    // Today: loser gets no warning; both saves succeed; last wins.
  })
})
