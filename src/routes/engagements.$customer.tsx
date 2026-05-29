import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { EngagementDetailScreen } from '@/screens/engagements/engagement-detail-screen'

export const Route = createFileRoute('/engagements/$customer')({
  component: EngagementDetailRoute,
})

function EngagementDetailRoute() {
  const { customer } = Route.useParams()
  usePageTitle(`Engagement · ${customer}`)
  return <EngagementDetailScreen customer={customer} />
}
