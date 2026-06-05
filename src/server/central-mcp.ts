/**
 * Thin client for calling a tool on the central-mcp broker (JSON-RPC over the
 * SSE-framed /mcp endpoint). central-mcp holds the united provider credentials
 * (TextMagic / Vapi / Tavus / Resend / VinSolutions); the Studio reaches live
 * VIN + the shared channels through here. Mirrors the SSE parse in
 * notifications.ts. Never throws — returns a tagged result.
 */

export type CentralMcpResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string; unconfigured?: boolean }

export function centralMcpToken(): string | undefined {
  return process.env.CENTRAL_MCP_TOKEN || undefined
}

export function centralMcpUrl(): string {
  return process.env.CENTRAL_MCP_URL || 'http://localhost:4002/mcp'
}

export async function callCentralMcpTool(
  toolName: string,
  args: Record<string, unknown>,
  opts: { token?: string; url?: string; timeoutMs?: number } = {},
): Promise<CentralMcpResult> {
  const token = opts.token ?? centralMcpToken()
  const url = opts.url ?? centralMcpUrl()
  if (!token) return { ok: false, unconfigured: true, error: 'central-mcp token missing' }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // The broker uses the MCP streamable-HTTP transport, which requires the
        // client to accept BOTH json and the SSE stream — omitting this yields
        // "Not Acceptable: Client must accept both application/json and text/event-stream".
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    })
    const text = await res.text()
    if (!res.ok) return { ok: false, error: text.slice(0, 300) }
    const m = text.match(/data: ({[\s\S]*?})\n/)
    if (!m) return { ok: true, data: null }
    const obj = JSON.parse(m[1]) as {
      error?: unknown
      result?: { isError?: boolean; content?: Array<{ text?: string }> }
    }
    if (obj.error) return { ok: false, error: JSON.stringify(obj.error).slice(0, 300) }
    if (obj.result?.isError)
      return { ok: false, error: (obj.result.content?.[0]?.text ?? 'tool error').slice(0, 300) }
    const inner = obj.result?.content?.[0]?.text
    let data: unknown = null
    if (inner) {
      try {
        data = JSON.parse(inner)
      } catch {
        data = inner // non-JSON tool text
      }
    }
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'network error' }
  }
}
