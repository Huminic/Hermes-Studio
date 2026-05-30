import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { McpTokensScreen } from '@/screens/settings/mcp-tokens-screen'

export const Route = createFileRoute('/settings/mcp-tokens')({
  component: function SettingsMcpTokensRoute() {
    usePageTitle('MCP Tokens')
    return <McpTokensScreen />
  },
})
