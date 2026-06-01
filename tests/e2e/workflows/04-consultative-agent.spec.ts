import { test } from '@playwright/test'

/**
 * Phase 8 workflow-surface suite — Consultative agent (WF-CON-*).
 * The agent runs in production via Hermes chat against the consultative-agent profile.
 * End-to-end testing requires: live LLM, curated customer fixture, multi-turn session.
 * Most workflows are .fixme — engine behavior is validated via vitest (engagement-state + consultative-engine).
 */

test.describe('Consultative agent workflows', () => {
  test.fixme('WF-CON-001 — orient phase ingests evidence + advances stage', async () => {
    // Requires: prospect profile seeded, evidence in inbox/, consultative-agent dispatched.
    // Engine call: advanceEngagementStage(profile, phaseToStage("orient"), {...}) — validated via vitest.
  })

  test.fixme('WF-CON-002 — audit → design → author produces six prescription artifacts', async () => {
    // Requires: full multi-turn engagement. The six artifacts under <customer>/knowledge/drafts/.
  })

  test.fixme('WF-CON-003 — assumption surfaced via lookup-miss → deployment_note', async () => {
    // Validated as HTC-CA-003 in HUMAN_TESTING_SCRIPT.md; needs live LLM + curated lookup miss.
  })

  test.fixme('WF-CON-004 — validate phase challenge-loop scores artifacts', async () => {
    // Engine path validated via vitest; UI surface deferred.
  })

  test.fixme('WF-CON-005 — package phase finalizes readiness gates', async () => {
    // GAP-CONSULTATIVE-DRIFT-001 — SOUL ↔ engine drift unverified. Drift-check planned during manual write.
  })
})
