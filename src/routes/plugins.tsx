import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { PluginsScreen } from '@/screens/plugins/plugins-screen'

export const Route = createFileRoute('/plugins')({
  component: PluginsRoute,
})

function PluginsRoute() {
  usePageTitle('Plugins')
  return <PluginsScreen />
}
