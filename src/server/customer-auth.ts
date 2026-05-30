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
  }
}

/**
 * True if the session is authorized for the given customer profile:
 * either Studio admin (super-user) or a customer-admin scoped to THIS
 * profile.
 */
export function isAuthorizedForProfile(
  session: CustomerSession | null,
  profile: string,
): boolean {
  if (!session) return false
  if (session.is_admin) return true
  return session.is_customer_admin && session.profile === profile
}
