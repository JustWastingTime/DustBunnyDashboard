export function tenantFromPath(path = typeof window === 'undefined' ? '' : window.location.pathname) {
  const match = String(path).match(/^\/g\/([^/]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

export function tenantPrefix(path?: string) {
  const tenant = tenantFromPath(path)
  return tenant ? `/g/${tenant}` : ''
}

export function restPath(path: string) {
  const stripped = path.replace(/^\/g\/[^/]+/, '')
  return stripped || '/'
}

export function withGuildQuery(url: string) {
  const guild = tenantFromPath()
  if (!guild) return url
  const joiner = url.includes('?') ? '&' : '?'
  return `${url}${joiner}guild=${encodeURIComponent(guild)}`
}

export function authLoginHref(returnTo: string) {
  const prefix = tenantPrefix()
  const dest = returnTo.startsWith('/g/') ? returnTo : `${prefix}${returnTo.startsWith('/') ? returnTo : `/${returnTo}`}`
  return `/api/auth/login?returnTo=${encodeURIComponent(dest)}`
}
