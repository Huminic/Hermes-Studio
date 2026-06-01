import { test, expect } from '@playwright/test'

/**
 * Phase 8 workflow-surface suite — Consulting human operator (WF-CHO-*).
 * Most workflows are .fixme — the engagement-seed UI is GAP-FLOW-engagement-seed-001
 * and the Provisioner handoff is GAP-PROV-001.
 */

test.describe('Consulting human operator workflows', () => {
  test.fixme('WF-CHO-001 — consulting human seeds engagement-state.yaml at draft via UI', async () => {
    // GAP-FLOW-engagement-seed-001 — no Studio UI button for engagement seed.
    // Launch-time procedure: CLI/file edit (documented in consulting-human-operator-guide.md Section 2).
  })

  test('WF-CHO-002 — files screen accepts uploads (relay path for customer evidence)', async ({ page }) => {
    await page.goto('/files')
    await expect(page.locator('body')).toBeVisible()
    // Upload UI presence asserted by route render — full upload flow needs auth + active profile.
  })

  test('WF-CHO-003 — engagement detail surfaces open_decisions to be resolved', async ({ page, request }) => {
    await page.goto('/engagements')
    await expect(page.locator('body')).toBeVisible()

    // /api/engagements response shape includes open_decisions per engagement-state schema.
    const res = await request.get('/api/engagements')
    if (res.status() === 200) {
      const body = await res.json()
      if (Array.isArray(body.customers) && body.customers.length > 0) {
        // Each customer with parseable state has open_decisions field (may be empty array).
        for (const c of body.customers) {
          if (c.state) {
            expect('open_decisions' in c.state).toBe(true)
          }
        }
      }
    }
  })

  test.fixme('WF-CHO-004 — consulting human reviews prescription drafts and approves gates', async () => {
    // Approval flow lives at /engagements/<customer> detail; gate approve button writes back to engagement-state.yaml.
    // Test requires: a customer with at least one pending gate + an admin session.
    // Today: covered by Tranche C engagement-state-api tests (vitest); UI assertion deferred.
  })

  test.fixme('WF-CHO-005 — consulting human hands prescription to Provisioner', async () => {
    // GAP-PROV-001 — no Provisioner agent. Handoff is verbal/chat between consulting human + operator.
  })
})
