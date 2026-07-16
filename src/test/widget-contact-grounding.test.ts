import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Regression for the P1 widget address/hours fabrication (2026-07-15):
 * the canonical dealership contact node was out-ranked by verbose sales-play
 * pages and dropped from the widget's top-3 keyword recall, after which the
 * model invented an address. recallWidgetGrounding must PIN the canonical
 * contact node on hours/address/phone/location questions.
 *
 * customer-wiki's profile root is the real home dir (not env-overridable), so
 * we mock the tree/read layer to drive deterministic fixtures. The store name
 * avoids the substring "is" so keyword scores stay predictable.
 */

const store = vi.hoisted(() => ({
  tree: [] as Array<{ type: string; path: string }>,
  files: {} as Record<string, string>,
}))

vi.mock('@/server/customer-wiki', () => ({
  WIKI_ROOT: 'company-wiki',
  listCustomerWikiTree: () => ({ ok: true, root_exists: true, tree: store.tree }),
  readCustomerWikiFile: (_profile: string, p: string) =>
    store.files[p]
      ? { ok: true, content: store.files[p] }
      : { ok: false, content: '' },
}))

// Four verbose sales-play pages that each contain the query verbatim, so under
// plain keyword recall they all out-rank the single fact node and crowd it out
// of the top-3 (the exact production mechanism).
const PLAY_PATHS = [
  'company-wiki/sales/trade-in-process.md',
  'company-wiki/sales/prologue-sourcing-play.md',
  'company-wiki/sales/test-drive-and-appointment-scheduling.md',
  'company-wiki/00-start-here/welcome.md',
]
function playPage(name: string): string {
  return `---\ntitle: ${name}\nstatus: canonical\ndomain: sales\n---\n# ${name}\nWhat is your address and what are your hours? Tell us where you are located and your phone so we can reach you and contact you. What is your address again?`
}

// Store name deliberately has no "is"/"address" collisions so the fact node
// scores LOW on the address query and would be dropped without the pin.
const CONTACT_CANONICAL = `---\nid: serra-motors/dealership/hours-location-contact\ntitle: Serra Motors Contact\nstatus: canonical\ndomain: sales\ncanonical_name: dealership-hours-location-contact\n---\n# Serra Motors Contact\n80 James Payton Blvd, Sylacauga AL. Sales Monday to Saturday 9 to 7.`
const CONTACT_DRAFT = CONTACT_CANONICAL.replace('status: canonical', 'status: draft')
const CONTACT_PATH = 'company-wiki/dealership/hours-location-contact.md'

function seedPlays(): Record<string, string> {
  return Object.fromEntries(PLAY_PATHS.map((p, i) => [p, playPage(`Play ${i}`)]))
}

async function load() {
  return await import('@/server/knowledge-mcp-handlers')
}

afterEach(() => {
  vi.resetModules()
  store.tree = []
  store.files = {}
})

describe('widget contact-intent grounding pin', () => {
  it('detects contact intent for hours/address/phone/location asks only', async () => {
    const { isContactIntent } = await load()
    for (const q of [
      'what is your address?',
      'What are your hours?',
      'where are you located?',
      'can I get your phone number?',
      'how do I reach you?',
    ]) {
      expect(isContactIntent(q), q).toBe(true)
    }
    for (const q of [
      'do you have a Prologue in stock?',
      'what does a trade-in involve?',
      'tell me about financing',
      // False positives the tightened regex must NOT match (reviewer-found):
      'where can I test drive the Civic?',
      'open recalls on this VIN?',
      'call me a price',
      'what number of miles does it have?',
      'can we reach a decision this week?',
    ]) {
      expect(isContactIntent(q), q).toBe(false)
    }
  })

  it('plain recall DROPS the canonical contact node from the top-3 (the bug)', async () => {
    store.tree = [
      ...PLAY_PATHS.map((path) => ({ type: 'file', path })),
      { type: 'file', path: CONTACT_PATH },
    ]
    store.files = { ...seedPlays(), [CONTACT_PATH]: CONTACT_CANONICAL }
    const { recallCompanyWikiTop } = await load()
    const top3 = recallCompanyWikiTop('serra-motors', 'what is your address?', 3)
      .filter((h) => h.score >= 3)
      .map((h) => h.path)
    // The verbose play pages fill the top-3; the fact node is crowded out.
    expect(top3).not.toContain(CONTACT_PATH)
    expect(top3.length).toBe(3)
  })

  it('PINS the canonical contact node first on a contact-intent ask', async () => {
    store.tree = [
      ...PLAY_PATHS.map((path) => ({ type: 'file', path })),
      { type: 'file', path: CONTACT_PATH },
    ]
    store.files = { ...seedPlays(), [CONTACT_PATH]: CONTACT_CANONICAL }
    const { recallWidgetGrounding } = await load()
    const g = recallWidgetGrounding('serra-motors', 'what is your address?')
    expect(g.contactPinned).toBe(true)
    expect(g.contactNoGround).toBe(false)
    expect(g.hits[0].path).toBe(CONTACT_PATH)
    expect(g.hits[0].content).toContain('80 James Payton Blvd')
    expect(g.hits.filter((h) => h.path === CONTACT_PATH)).toHaveLength(1)
  })

  it('does NOT pin for a non-contact question', async () => {
    store.tree = [
      ...PLAY_PATHS.map((path) => ({ type: 'file', path })),
      { type: 'file', path: CONTACT_PATH },
    ]
    store.files = { ...seedPlays(), [CONTACT_PATH]: CONTACT_CANONICAL }
    const { recallWidgetGrounding } = await load()
    const g = recallWidgetGrounding('serra-motors', 'do you have a Prologue in stock?')
    expect(g.contactPinned).toBe(false)
    expect(g.contactNoGround).toBe(false)
  })

  it('never grounds a DRAFT contact node (anti-fabrication) and flags no-ground', async () => {
    store.tree = [{ type: 'file', path: CONTACT_PATH }]
    store.files = { [CONTACT_PATH]: CONTACT_DRAFT }
    const { findCanonicalContactNode, recallWidgetGrounding } = await load()
    expect(findCanonicalContactNode('serra-motors')).toBeNull()
    const g = recallWidgetGrounding('serra-motors', 'what is your address?')
    expect(g.contactPinned).toBe(false)
    expect(g.contactNoGround).toBe(true) // caller forbids inventing
    // Even though keyword recall could surface it, a draft contact node is
    // filtered out so its unverified address never reaches the customer.
    expect(g.hits.some((h) => h.path === CONTACT_PATH)).toBe(false)
  })

  it('flags no-ground when a store has no contact node at all', async () => {
    store.tree = PLAY_PATHS.map((path) => ({ type: 'file', path }))
    store.files = seedPlays()
    const { recallWidgetGrounding } = await load()
    const g = recallWidgetGrounding('serra-motors', 'where are you located?')
    expect(g.contactPinned).toBe(false)
    expect(g.contactNoGround).toBe(true)
  })
})
