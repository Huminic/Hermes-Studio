/**
 * Server-side engagement state aggregator.
 *
 * Walks each ~/.hermes/profiles/<customer>/engagement-state.yaml, parses,
 * and returns the aggregated set. Used by /api/engagements and the
 * engagement-tracker Studio surface.
 *
 * Profiles without an engagement-state.yaml are simply omitted — only
 * profiles that have been seeded as customer engagements show up here.
 * The data-governor and consultative-agent profiles do NOT have
 * engagement-state.yaml files; they're listed elsewhere.
 */

import fs from 'node:fs'
import path from 'node:path'
import { getProfilesRoot } from './profiles-browser'
import {
  parseEngagementState,
  type EngagementState,
} from '../lib/engagement-state'

export type EngagementEntry = {
  customer: string
  state?: EngagementState
  parseErrors?: Array<string>
  fileMissing?: boolean
}

export type EngagementsResult = {
  customers: Array<EngagementEntry>
}

export function listEngagements(): EngagementsResult {
  const root = getProfilesRoot()
  if (!fs.existsSync(root)) return { customers: [] }

  const entries = fs.readdirSync(root, { withFileTypes: true })
  const customers: Array<EngagementEntry> = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const profileDir = path.join(root, entry.name)
    const stateFile = path.join(profileDir, 'engagement-state.yaml')
    if (!fs.existsSync(stateFile)) continue

    let text: string
    try {
      text = fs.readFileSync(stateFile, 'utf8')
    } catch (err) {
      customers.push({
        customer: entry.name,
        parseErrors: [
          `read error: ${err instanceof Error ? err.message : String(err)}`,
        ],
      })
      continue
    }

    const result = parseEngagementState(text)
    if (result.ok) {
      customers.push({ customer: entry.name, state: result.state })
    } else {
      customers.push({ customer: entry.name, parseErrors: result.errors })
    }
  }

  customers.sort((a, b) => a.customer.localeCompare(b.customer))
  return { customers }
}
