/**
 * GET /api/customer/halo-report?profile=X[&window_days=30]
 *
 * Halo Data report card for one Sales profile: every catalog slug with current /
 * industry / baseline states, provenance/period/unit, coverage, explicit
 * limitations, and a grounded deterministic narrative. Read-only; no send/action.
 * Auth: Studio admin or customer-admin scoped to the profile. Sales-only — Service/
 * Parts never appear (enforced in the assembler).
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { buildHaloReportCard } from '../../../server/reports/halo-report-card'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../server/customer-auth'

export const Route = createFileRoute('/api/customer/halo-report')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const profile = url.searchParams.get('profile') ?? ''
        if (!profile) {
          return json({ ok: false, error: 'Missing profile query parameter.' }, { status: 400 })
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Unauthorized for this profile.' }, { status: 403 })
        }
        const windowDays = Number(url.searchParams.get('window_days') ?? '30') || 30
        try {
          return json({ ok: true, report: buildHaloReportCard(profile, windowDays) })
        } catch (error) {
          return json(
            {
              ok: false,
              error: error instanceof Error ? error.message : 'Failed to build Halo report',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
