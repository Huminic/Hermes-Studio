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
  // Tag filter is provisional — contacts don't carry tags yet, so this
  // filter is a no-op until a tagging table lands. Kept in the DSL so
  // audience definitions are forwards-compatible.
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
