/**
 * POST /api/customer/report-generate  { profile, report, window_days? }
 *
 * Generate a customer report and persist it as a `report`-type artifact with an
 * HTML output (exportable / publishable / sendable via the artifacts surface).
 * Generic dispatcher — one case per report type; add future reports here.
 *
 *   report: 'missed-opportunities'  → buildMissedOpportunities + HTML
 *
 * Auth: customer session must be authorized for the profile.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireJsonContentType } from '../../../server/rate-limit'
import { isAuthorizedForProfile, resolveSession } from '../../../server/customer-auth'
import { createArtifact } from '../../../server/artifact-store'
import {
  buildMissedOpportunities,
  renderMissedOpportunitiesHtml,
} from '../../../server/reports/missed-opportunities'
import {
  buildLeadSourceDetail,
  renderLeadSourceDetailHtml,
} from '../../../server/reports/lead-source-detail'
import {
  buildSalespersonEffectiveness,
  renderSalespersonEffectivenessHtml,
} from '../../../server/reports/salesperson-effectiveness'
import {
  buildAiConversationInsights,
  renderAiConversationInsightsHtml,
} from '../../../server/reports/ai-conversation-insights'
import { buildDataIssues, renderDataIssuesHtml } from '../../../server/reports/data-issues'
import {
  buildStorePerformanceTrend,
  renderStorePerformanceTrendHtml,
} from '../../../server/reports/store-performance-trend'
import {
  buildCompetitorReport,
  renderCompetitorReportHtml,
  type CompetitorInput,
  type CompetitorSelf,
} from '../../../server/reports/competitor'

const REPORTS = new Set([
  'missed-opportunities',
  'lead-source-detail',
  'salesperson-effectiveness',
  'ai-conversation-insights',
  'data-issues',
  'store-performance-trend',
  'competitor',
])

/** Per-report artifact description (metadata blurb shown in the artifacts list). */
const REPORT_DESCRIPTIONS: Record<string, string> = {
  'missed-opportunities': 'Prospects lost to an AI/automation gap (rep takeovers excluded).',
  'lead-source-detail': 'Per-source funnel and ROI, deeper than the dashboard table.',
  'salesperson-effectiveness': 'Per-rep internet-lead funnel from the ingested KPI report.',
  'ai-conversation-insights': 'Themes, objections, and knowledge gaps from recent conversations.',
  'data-issues': 'Data-hygiene scan: undeliverable contacts, unowned threads, stuck holds.',
  'store-performance-trend': 'Pipeline characteristics trended across report periods.',
  competitor: 'Area-competitor comparison: listings, pricing, specials, and lead presence.',
}

export const Route = createFileRoute('/api/customer/report-generate')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
        const profile = typeof body.profile === 'string' ? body.profile.trim() : ''
        const report = typeof body.report === 'string' ? body.report : ''
        const windowDays =
          typeof body.window_days === 'number' && body.window_days > 0
            ? Math.min(365, Math.floor(body.window_days))
            : 30
        if (!profile || !report) {
          return json({ ok: false, error: 'profile and report are required' }, { status: 400 })
        }
        if (!REPORTS.has(report)) {
          return json({ ok: false, error: `unknown report '${report}'` }, { status: 400 })
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }

        try {
          let title = ''
          let html = ''
          if (report === 'missed-opportunities') {
            const data = buildMissedOpportunities(profile, { windowDays })
            title = `Missed Opportunities — ${profile} (${windowDays}d)`
            html = renderMissedOpportunitiesHtml(data)
          } else if (report === 'lead-source-detail') {
            const data = buildLeadSourceDetail(profile)
            title = `Lead-Source Detail — ${profile}`
            html = renderLeadSourceDetailHtml(data)
          } else if (report === 'salesperson-effectiveness') {
            const data = buildSalespersonEffectiveness(profile)
            title = `Salesperson Effectiveness — ${profile}`
            html = renderSalespersonEffectivenessHtml(data)
          } else if (report === 'ai-conversation-insights') {
            const data = await buildAiConversationInsights(profile, { windowDays })
            title = `AI Conversation Insights — ${profile}`
            html = renderAiConversationInsightsHtml(data)
          } else if (report === 'data-issues') {
            const data = buildDataIssues(profile, { windowDays })
            title = `Data Issues — ${profile}`
            html = renderDataIssuesHtml(data)
          } else if (report === 'store-performance-trend') {
            const data = buildStorePerformanceTrend(profile)
            title = `Store Performance Over Time — ${profile}`
            html = renderStorePerformanceTrendHtml(data)
          } else if (report === 'competitor') {
            // Competitor data arrives from the federated-search source (or the
            // request body). Empty → honest "connect the source" state.
            const competitors = Array.isArray(body.competitors)
              ? (body.competitors as Array<CompetitorInput>)
              : []
            const us =
              body.us && typeof body.us === 'object' ? (body.us as CompetitorSelf) : undefined
            const data = buildCompetitorReport(profile, {
              competitors,
              us,
              dataSource: typeof body.data_source === 'string' ? body.data_source : undefined,
            })
            title = `Competitor Report — ${profile}`
            html = renderCompetitorReportHtml(data)
          }
          const artifact = createArtifact({
            profile,
            title,
            description: REPORT_DESCRIPTIONS[report] ?? `${report} report`,
            type: 'report',
            createdBy: session?.username ?? 'report-generate',
            outputs: [
              {
                format: 'html',
                filename: `${report}-${profile}.html`,
                contentType: 'text/html; charset=utf-8',
                content: html,
              },
            ],
          })
          return json({ ok: true, artifact })
        } catch (err) {
          return json(
            { ok: false, error: err instanceof Error ? err.message : 'report generation failed' },
            { status: 500 },
          )
        }
      },
    },
  },
})
