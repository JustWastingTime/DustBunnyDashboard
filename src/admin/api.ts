export class AdminError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function adminFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body != null && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const method = (init?.method || 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') headers.set('X-Tazuna-Admin', '1')
  const response = await fetch(url, { ...init, credentials: 'include', headers })
  if (response.status === 204) return undefined as T
  const body = await response.json().catch(() => null) as { error?: string } | null
  if (!response.ok) {
    throw new AdminError(response.status, body?.error || response.statusText || 'Request failed')
  }
  return body as T
}

export type Summary = Record<string, string>
export type GitEntry = { entry: Record<string, unknown>; blobSha: string; commitSha: string }
export type SaveResult = { commitSha: string; blobSha: string; key?: string; warnings?: string[] }

export type AdminMe = {
  authenticated: boolean
  isOwner: boolean
  user?: { discordId: string; username: string; globalName: string | null; avatar: string | null }
}

export const adminApi = {
  me: () => adminFetch<AdminMe>('/api/admin/me'),
  publicList: (dataset: string, q = '', limit = 5000) =>
    adminFetch<{ total: number; entries: Summary[] }>(`/api/admin/public/${dataset}?q=${encodeURIComponent(q)}&limit=${limit}`),
  publicEntry: (dataset: string, key: string) =>
    adminFetch<{ entry: Record<string, unknown> }>(`/api/admin/public/${dataset}/entry?key=${encodeURIComponent(key)}`),
  gitEntry: (dataset: string, key: string) =>
    adminFetch<GitEntry>(`/api/admin/data/${dataset}/entry?key=${encodeURIComponent(key)}`),
  head: (dataset: string) =>
    adminFetch<{ blobSha: string; commitSha: string; file: string }>(`/api/admin/data/${dataset}/meta`),
  create: (dataset: string, body: { entry: unknown; message: string; baseBlobSha: string; afterKey?: string }) =>
    adminFetch<SaveResult>(`/api/admin/data/${dataset}/entry`, { method: 'POST', body: JSON.stringify(body) }),
  update: (dataset: string, key: string, body: { entry: unknown; message: string; baseBlobSha: string }) =>
    adminFetch<SaveResult>(`/api/admin/data/${dataset}/entry?key=${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify(body) }),
  remove: (dataset: string, key: string, baseBlobSha: string, message: string) =>
    adminFetch<SaveResult>(`/api/admin/data/${dataset}/entry?key=${encodeURIComponent(key)}&baseBlobSha=${encodeURIComponent(baseBlobSha)}&message=${encodeURIComponent(message)}`, { method: 'DELETE' }),
  raw: (dataset: string) => adminFetch<{ text: string; blobSha: string; file: string }>(`/api/admin/data/${dataset}/raw`),
  saveRaw: (dataset: string, body: { text: string; message: string; baseBlobSha: string }) =>
    adminFetch<SaveResult>(`/api/admin/data/${dataset}/raw`, { method: 'PUT', body: JSON.stringify(body) }),
  datasets: () => adminFetch<{ datasets: Array<{ name: string; mode: string; public: boolean; file: string; count: number }> }>('/api/admin/datasets'),
  catalog: () => adminFetch<{ maps: Array<{ name: string }>; meets: Array<{ number: string; name: string }> }>('/api/admin/public/catalog/maps'),
  preview: (body: { skill?: unknown; skillName?: string; cmNumber?: string; mapQuery?: string }) =>
    adminFetch<{ label: string; shouldShowChart: boolean; doesNotWork: boolean; reasons: string[]; pngBase64: string | null }>(
      '/api/admin/public/skill-preview',
      { method: 'POST', body: JSON.stringify(body) },
    ),
  premium: () => adminFetch<{ guilds: Array<{ guildId: string; premium: boolean; fromEnv: boolean; stored: boolean }> }>('/api/admin/premium'),
  setPremium: (guildId: string, enabled: boolean) =>
    adminFetch<{ guildId: string; premium: boolean }>(`/api/admin/premium/${guildId}`, { method: 'PUT', body: JSON.stringify({ enabled }) }),
  clubs: () => adminFetch<{ guilds: Array<{ guildId: string; slug: string | null; siteName: string | null; premium: boolean; clubs: Array<{ circleId: string; circleName: string | null }> }> }>('/api/admin/clubs'),
  refreshCache: () => adminFetch<{ ok: true }>('/api/admin/cache/refresh', { method: 'POST', body: '{}' }),
  audit: () => adminFetch<{ entries: Array<{ at: string; username: string | null; file: string; summary: string; commitSha: string }> }>('/api/admin/audit'),
}
