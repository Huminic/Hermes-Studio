/**
 * POST /api/customer/audiences/upload
 *
 * Accepts a customer-uploaded contact list (CSV text), upserts each row as a
 * contact in the messaging hub for the profile, and creates a named audience
 * that targets exactly those imported contacts.
 *
 * Body (application/json): { profile, name, csv }
 *   - csv: the raw text of the uploaded .csv file
 *   - name: audience name (e.g. the file name minus extension)
 *
 * Returns plain-language counts so the UI can say
 *   "Imported 42 contacts; 3 rows skipped — missing phone/email".
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireJsonContentType } from '../../../../server/rate-limit'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../../server/customer-auth'
import {
  createAudience,
  upsertContact,
} from '../../../../server/messaging-hub-store'
import { parseContactCsv } from '../../../../server/contact-csv'
import { isBlacklisted } from '../../../../server/comms-blacklist'

export const Route = createFileRoute('/api/customer/audiences/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        const body = (await request.json().catch(() => ({}))) as Record<
          string,
          unknown
        >
        const profile = typeof body.profile === 'string' ? body.profile : ''
        if (!profile) {
          return json({ ok: false, error: 'profile required' }, { status: 400 })
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }
        const csv = typeof body.csv === 'string' ? body.csv : ''
        if (!csv.trim()) {
          return json(
            { ok: false, error: 'No file contents received.' },
            { status: 400 },
          )
        }
        const rawName = typeof body.name === 'string' ? body.name.trim() : ''
        const name = rawName || 'Imported list'

        const parsed = parseContactCsv(csv)
        if (
          parsed.contacts.length === 0 &&
          parsed.matchedColumns.phone === null &&
          parsed.matchedColumns.email === null
        ) {
          return json(
            {
              ok: false,
              error:
                'We could not find a phone or email column. Please include a column named phone or email.',
            },
            { status: 400 },
          )
        }

        // DNC enforcement BEFORE the list is usable: any imported row whose
        // phone/email is on the per-profile opt-out (STOP/DNC) list is dropped
        // here, so it can never be targeted by a campaign built on this list.
        // (CommGate enforces the same at send time — this is the earlier,
        // visible guard the spec requires for uploaded/imported lists.)
        const contactIds: Array<string> = []
        let dncBlocked = 0
        for (const c of parsed.contacts) {
          const handles = Object.values(c.identifiers).filter(
            (h): h is string => typeof h === 'string' && h.length > 0,
          )
          if (handles.some((h) => isBlacklisted(profile, h))) {
            dncBlocked++
            continue
          }
          const contact = upsertContact({
            profile,
            display_name: c.display_name,
            identifiers: c.identifiers,
          })
          contactIds.push(contact.id)
        }

        const uniqueIds = Array.from(new Set(contactIds))
        // The audience targets exactly the imported contacts. The resolver
        // matches on `contact_ids` when present; otherwise it falls back to
        // the channel/filter query keys.
        const audience = createAudience({
          profile,
          name,
          query: { contact_ids: uniqueIds },
        })

        return json({
          ok: true,
          audience,
          imported: uniqueIds.length,
          skipped: parsed.skipped,
          dnc_blocked: dncBlocked,
        })
      },
    },
  },
})
