const DEFAULT_PORTAL_HOSTS = ['portal.huminic.app']

function envPortalHosts(): Array<string> {
  const raw =
    (typeof process !== 'undefined' && process.env?.PORTAL_HOST) || ''
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function portalHosts(): Array<string> {
  const fromEnv = envPortalHosts()
  return fromEnv.length > 0 ? fromEnv : DEFAULT_PORTAL_HOSTS
}

export function isPortalHost(hostname: string | null | undefined): boolean {
  if (!hostname) return false
  return portalHosts().includes(hostname.toLowerCase())
}
