/**
 * Real-data verification for the defensible lead engine (dashboard goal).
 * Runs fetchAllLeads + summarizeOpportunities against the LIVE CRM for one store,
 * read-only. Usage: CENTRAL_MCP_TOKEN=... CENTRAL_MCP_URL=... \
 *   npx tsx scripts/verify-dashboard-leads.ts <store> <days>
 */
import { fetchAllLeads, fetchLeadSources, summarizeOpportunities } from '../src/server/lead-opportunities'

const ORGS: Record<string, string> = {
  'hyundai-of-columbia': 'f18cbf4e-bcbd-46fe-bf54-33bcee4afec8',
  'ford-of-columbia': '6ae2548b-f6ec-4b1e-8d8b-ae565123f0df',
  'serra-honda': '24d64f99-ba04-4b43-af35-fd06f555ac86',
}

const store = process.argv[2] ?? 'hyundai-of-columbia'
const days = Number(process.argv[3] ?? 30)
const orgId = ORGS[store]
if (!orgId) {
  console.error(`unknown store ${store}; known: ${Object.keys(ORGS).join(', ')}`)
  process.exit(1)
}
const now = Date.now()
const startDate = new Date(now - days * 86_400_000).toISOString()
const endDate = new Date(now).toISOString()

const r = await fetchAllLeads({ orgId, startDate, endDate })
if (!r.ok) {
  console.error('FETCH FAILED:', r.reason)
  process.exit(1)
}
const sourceNames = await fetchLeadSources({ orgId })
const s = summarizeOpportunities(r.leads, sourceNames)
console.log(
  JSON.stringify(
    {
      store,
      window_days: days,
      pages: r.pages,
      capped: r.capped,
      raw_total: s.raw_total,
      defensible_opportunities: s.opportunities,
      sold: s.sold,
      dropped: s.dropped,
      top_sources: s.by_source.slice(0, 10),
    },
    null,
    2,
  ),
)
