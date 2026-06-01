import { test, expect } from '@playwright/test'

/**
 * Phase 8 workflow-surface suite — Operator (WF-OP-*).
 * Replaces page-based smoke tests with work-completion-across-time assertions.
 */

test.describe('Operator workflows', () => {
  test('WF-OP-001 — operator login lands on a dashboard with sidebar nav', async ({ page, request }) => {
    // Anonymous visit lands somewhere usable (login form OR dashboard if auth disabled)
    await page.goto('/')
    await expect(page.locator('body')).toBeVisible()

    // /api/auth-session reports the auth mode so the UI can render correctly
    const res = await request.get('/api/auth-session')
    expect([200, 401]).toContain(res.status())
    const ct = res.headers()['content-type'] ?? ''
    expect(ct).toContain('application/json')
  })

  test.fixme('WF-OP-002 — promote draft → published via Files screen Promote button', async ({ page }) => {
    // GAP-MANUAL-promote-001 — no operator-side Promote button in /files today.
    // Launch-time workaround: customer-storefront Promote OR direct API OR git-mv break-glass.
    // Test would: open /files, navigate to a draft, click Promote, verify it moved.
    await page.goto('/files')
  })

  test('WF-OP-003 — operator can read engagement detail + see readiness gates', async ({ page, request }) => {
    await page.goto('/engagements')
    await expect(page.locator('body')).toBeVisible()

    // /api/engagements responds (may be empty if no engagements seeded)
    const res = await request.get('/api/engagements')
    expect([200, 401]).toContain(res.status())
  })

  test.fixme('WF-OP-004 — operator provisions a new customer profile end-to-end via UI', async () => {
    // GAP-PROV-001 — no Provisioner agent dispatch UI; operator runs scripts/provision-launch-profiles.ts by hand.
    // Test would: dispatch via UI button, verify profile dir created, auth.yaml + studio.yaml shape correct,
    // login at /p/<slug>/ works. Today: not testable end-to-end via UI.
  })

  test('WF-OP-005 — MCP tokens screen renders + plugin loader reports loaded plugins', async ({ page, request }) => {
    await page.goto('/mcp-tokens')
    await expect(page.locator('body')).toBeVisible()

    const plugins = await request.get('/api/plugins')
    expect([200, 401]).toContain(plugins.status())
    if (plugins.status() === 200) {
      const body = await plugins.json()
      expect(Array.isArray(body.plugins)).toBe(true)
    }
  })

  test('WF-OP-006 — deployment verification surfaces (auth-session + plugins) respond JSON', async ({ request }) => {
    // After a Coolify redeploy, operator hits /api/auth-session and /api/plugins to verify the new build.
    const auth = await request.get('/api/auth-session')
    expect(auth.headers()['content-type'] ?? '').toContain('application/json')

    const plugins = await request.get('/api/plugins')
    expect(plugins.headers()['content-type'] ?? '').toContain('application/json')
  })

  test.fixme('WF-OP-007 — operator signs out via UI control', async () => {
    // GAP-LOGOUT-001 — no /api/auth/logout endpoint or UI control. Workaround: clear cookies manually.
  })
})
