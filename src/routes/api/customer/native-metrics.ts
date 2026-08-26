/**
 * GET /api/customer/native-metrics?profile=X
 *
 * Surfaces ACCEPTED native VinSolutions weekly families and the standalone
 * Response-Time readback for a profile, each labeled by source and NEVER
 * blended:
 *   - dealershipPerformance  (dealership_performance native aggregate)
 *   - appointments           (appointments native family)
 *   - responseTimes          (standalone promoted Response-Time readback)
 *
 * Absent/withheld families come back as { available:false, reason } — never as
 * fabricated zeros. Auth: Studio admin or customer-admin scoped to the profile.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  readAppointments,
  readDealershipPerformance,
  readResponseTimes,
} from '../../../server/ingest-native-metrics'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../server/customer-auth'

export const Route = createFileRoute('/api/customer/native-metrics')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const profile = url.searchParams.get('profile') ?? ''
        if (!profile) {
          return json(
            { ok: false, error: 'Missing profile query parameter.' },
            { status: 400 },
          )
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json(
            { ok: false, error: 'Unauthorized for this profile.' },
            { status: 403 },
          )
        }
        try {
          return json({
            ok: true,
            profile,
            dealershipPerformance: readDealershipPerformance(profile),
            appointments: readAppointments(profile),
            responseTimes: readResponseTimes(profile),
          })
        } catch (error) {
          return json(
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to read native metrics',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
