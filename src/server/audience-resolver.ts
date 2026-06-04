/**
 * Audience resolver — Phase C.8.
 *
 * Audience.query is a tiny DSL the customer-admin can write through the
 * audience builder UI. Shape:
 *
 *   { channel: 'sms', tags?: ['service'], last_contacted_before?: number, last_contacted_after?: number }
 *
 * The resolver runs this query against the messaging-hub contacts table
 * (and the contact's threads to compute last_contacted_at) and returns
 * matching contact ids.
 */

import {
  listContacts,
  listThreads,
  type Contact,
} from './messaging-hub-store'

export type AudienceQuery = {
  channel?: string
  // Explicit contact-id list, set when an audience is built from an uploaded
  // CSV. When present it takes precedence over the channel/filter keys and the
  // audience resolves to exactly those contacts (still validated against the
  // hub so a deleted contact drops out honestly).
  contact_ids?: Array<string>
  // Tag filter is provisional — the Contact row carries no `tags`/`metadata`
  // column (only id/profile/display_name/identifiers/channels/timestamps), so
  // there is no honest source to match against. Confirmed no-op as of WS-5;
  // kept in the DSL so audience definitions stay forwards-compatible and so a
  // future tagging table can light it up without a query migration.
  tags?: Array<string>
  last_contacted_before?: number
  last_contacted_after?: number
}

export function resolveAudience(input: {
  profile: string
  query: AudienceQuery | Record<string, unknown>
}): Array<Contact> {
  const q = input.query as AudienceQuery
  const contacts = listContacts(input.profile)

  // Explicit contact-id audience (CSV upload): resolve to exactly the listed
  // contacts that still exist for this profile.
  if (Array.isArray(q.contact_ids) && q.contact_ids.length > 0) {
    const wanted = new Set(q.contact_ids)
    return contacts.filter((c) => wanted.has(c.id))
  }

  const lastContactedByContact = new Map<string, number>()
  if (q.last_contacted_before || q.last_contacted_after) {
    const threads = listThreads({ profile: input.profile, limit: 500 })
    for (const t of threads) {
      const handle = t.contact_handle
      const matchContact = contacts.find((c) =>
        Object.values(c.identifiers).includes(handle),
      )
      if (matchContact) {
        const cur = lastContactedByContact.get(matchContact.id) ?? 0
        if (t.updated_at > cur) {
          lastContactedByContact.set(matchContact.id, t.updated_at)
        }
      }
    }
  }
  return contacts.filter((c) => {
    if (q.channel && !c.channels.includes(q.channel)) return false
    if (q.last_contacted_before !== undefined) {
      const last = lastContactedByContact.get(c.id) ?? 0
      if (last === 0) return true // never contacted is always "before"
      if (last >= q.last_contacted_before) return false
    }
    if (q.last_contacted_after !== undefined) {
      const last = lastContactedByContact.get(c.id) ?? 0
      if (last < q.last_contacted_after) return false
    }
    return true
  })
}
