import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { McpTokensScreen } from '@/screens/mcp-tokens/mcp-tokens-screen'

export const Route = createFileRoute('/mcp-tokens')({
  component: McpTokensRoute,
})

function McpTokensRoute() {
  usePageTitle('MCP Tokens')
  return <McpTokensScreen />
}
