import {
  getSessionMetadata,
  getSessionTokenFromCookie,
  isPasswordProtectionEnabled,
} from './auth-middleware'

export type CustomerSession = {
  username: string | null
  profile: string | null
  is_admin: boolean
  is_customer_admin: boolean
  scope_profiles?: string[]
}

/**
 * Resolve the session from a request. Returns null when password protection
 * is disabled and there's no token (no-auth mode — caller decides how to
 * treat it).
 */
export function resolveSession(request: Request): CustomerSession | null {
  if (!isPasswordProtectionEnabled()) {
    return {
      username: null,
      profile: null,
      is_admin: true,
      is_customer_admin: true,
    }
  }
  const cookieHeader = request.headers.get('cookie')
  const token = getSessionTokenFromCookie(cookieHeader)
  if (!token) return null
  const meta = getSessionMetadata(token)
  if (!meta) return null
  return {
    username: meta.username ?? null,
    profile: meta.profile ?? null,
    is_admin: meta.is_admin === true,
    is_customer_admin: meta.is_customer_admin === true,
    scope_profiles: meta.scope_profiles,
  }
}

/**
 * True if the session is authorized for the given customer profile:
 * - Studio admin (super-user) sees all profiles
 * - Partner/group admin sees only profiles in scope_profiles array
 * - Customer-admin sees only their own profile
 */
export function isAuthorizedForProfile(
  session: CustomerSession | null,
  profile: string,
): boolean {
  if (!session) return false
  if (session.is_admin) return true // super-admin sees all
  if (session.scope_profiles?.includes(profile)) return true // partner admin sees scoped profiles
  return session.is_customer_admin && session.profile === profile // store admin sees own profile
}
