export interface AuthStatus {
  authenticated: boolean
  authRequired: boolean
  /** Studio-admin session — may access Global Huminic Studio routes/APIs. */
  is_admin?: boolean
  /** Workspace (customer-admin) session — confined to its own /p/<profile>/*. */
  is_customer_admin?: boolean
  /** The session's profile (for routing a Workspace session to /p/<profile>/chat). */
  profile?: string | null
  /** Scoped partner admin — list of profiles this session can access. */
  scope_profiles?: string[]
  error?: string
}

export async function fetchHermesAuthStatus(
  timeoutMs = 5_000,
): Promise<AuthStatus> {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetch('/api/auth-check', { signal: controller.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timed out after 5 seconds')
    }

    throw error instanceof Error
      ? error
      : new Error('Failed to connect to Hermes Agent')
  } finally {
    globalThis.clearTimeout(timeout)
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }

  return (await res.json()) as AuthStatus
}
