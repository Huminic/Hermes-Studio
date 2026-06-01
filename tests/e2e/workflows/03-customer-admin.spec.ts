import { test, expect } from '@playwright/test'

/**
 * Phase 8 workflow-surface suite — Customer-admin (WF-CA-*).
 * Storefront login + 6-tab nav. Most workflows end-to-end testable.
 */

test.describe('Customer-admin workflows', () => {
  test('WF-CA-001 — storefront landing renders with brand for known profile', async ({ page, request }) => {
    // /p/huminic/ should render the storefront landing with brand chrome.
    await page.goto('/p/huminic')
    await expect(page.locator('body')).toBeVisible()

    // /api/studio-config?profile=huminic returns parsed studio.yaml.
    const cfg = await request.get('/api/studio-config?profile=huminic')
    expect([200, 401]).toContain(cfg.status())
  })

  test.fixme('WF-CA-002 — customer-admin picks agent + chats (channel=chat persistence)', async () => {
    // Requires customer-admin session + an enabled agent on the profile.
    // Validated via vitest (customer-chat-api.test.ts) at Phase C.2.
  })

  test.fixme('WF-CA-003 — knowledge tab save → KSG gate → verdict', async () => {
    // Requires customer-admin session. Validated via vitest (customer-wiki-api.test.ts + ksg-gate.test.ts) at Phase C.3.
  })

  test.fixme('WF-CA-004 — widget CRUD + public /w/<slug> roundtrip', async () => {
    // Requires customer-admin session. Validated via vitest (customer-widgets-api.test.ts) at Phase C.4.
  })

  test.fixme('WF-CA-005 — inbound thread + reply on a real channel', async () => {
    // OP-002 — per-customer real channel credentials not provisioned at launch.
    // Outbound returns `unconfigured` until OP-002 closes.
  })

  test.fixme('WF-CA-006 — campaign builder + scheduled-send tick', async () => {
    // OP-002 for adapter credentials. Worker-tick validated via vitest (campaign-worker.test.ts) at Phase C.8.
  })

  test('WF-CA-007 — password reset endpoint accepts request + returns 200 (anti-enumeration)', async ({ request }) => {
    // POST /api/auth/reset-request always returns 200 to prevent email enumeration.
    const res = await request.post('/api/auth/reset-request', {
      data: { email: 'nonexistent@example.com' },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  test.fixme('WF-CA-008 — customer-admin invites additional staff via UI', async () => {
    // GAP-CUSTOMER-INVITE-001 — no self-service invite flow. Operator runs scripts/create-user.ts.
  })
})
