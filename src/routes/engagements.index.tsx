import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { EngagementsScreen } from '@/screens/engagements/engagements-screen'

export const Route = createFileRoute('/engagements/')({
  component: EngagementsIndexRoute,
})

function EngagementsIndexRoute() {
  usePageTitle('Engagements')
  return <EngagementsScreen />
}
