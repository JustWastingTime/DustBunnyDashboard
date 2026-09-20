// Paths that can never be a network slug; the bot reserves them for pages and APIs.
const RESERVED_SEGMENTS = new Set([
  'api', 'assets', 'g', 'staff', 'apply', 'tourney', 'interactions',
])

/**
 * The network a URL belongs to. Supports both the prefixed form
 * `/g/<slug>` and the root form `/<slug>`, e.g. `/bunny`.
 */
export function tenantFromPath(path = typeof window === 'undefined' ? '' : window.location.pathname) {
  const raw = String(path)
  const prefixed = raw.match(/^\/g\/([^/]+)/)
  if (prefixed) return decodeURIComponent(prefixed[1])
  const segments = raw.split('/').filter(Boolean)
  if (segments.length >= 1 && !RESERVED_SEGMENTS.has(segments[0].toLowerCase())) {
    return decodeURIComponent(segments[0])
  }
  return ''
}

export function tenantPrefix(path?: string) {
  const tenant = tenantFromPath(path)
  return tenant ? `/g/${tenant}` : ''
}

export function restPath(path: string) {
  const raw = String(path)
  const withoutPrefix = raw.replace(/^\/g\/[^/]+/, '')
  if (withoutPrefix !== raw) return withoutPrefix || '/'
  const withoutSlug = raw.replace(/^\/[^/]+/, '')
  return withoutSlug || '/'
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
