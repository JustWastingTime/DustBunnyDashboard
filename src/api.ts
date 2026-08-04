async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(body.error || `Request failed with ${response.status}`)
  }
  return response.status === 204 ? undefined as T : response.json()
}

export type SessionUser = {
  discordId: string
  username: string
  globalName: string | null
  avatar: string | null
  clubIds: string[]
  label: string | null
}

export const api = {
  // Online (Vercel) endpoints
  publicDashboard: () => request<import('./types').PublicData>('/api/public/dashboard'),
  applyClubs: () => request<{ clubs: Array<{ circleId: string; name: string }> }>('/api/apply'),
  submitApplication: (body: unknown) => request<{ ok: true }>('/api/apply', { method: 'POST', body: JSON.stringify(body) }),
  me: () => request<{ authenticated: boolean; user?: SessionUser }>('/api/auth/me'),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  staffApplicants: () => request<{ applicants: import('./types').Applicant[]; user: SessionUser }>('/api/applicants'),
  staffClubs: () => request<{ clubs: import('./types').Club[]; user: SessionUser }>('/api/clubs'),
  staffUpdateClub: (circleId: string, body: unknown) =>
    request<import('./types').Club>(`/api/clubs?circleId=${encodeURIComponent(circleId)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  staffPlan: () =>
    request<{
      board: { status: string; updatedAt?: string | null; confirmedAt?: string | null }
      assignments: import('./types').Assignment[]
      clubs: import('./types').Club[]
      user: SessionUser
    }>('/api/planning'),
  staffSavePlan: (assignments: import('./types').Assignment[]) =>
    request<{
      board: { status: string; updatedAt?: string | null; confirmedAt?: string | null }
      assignments: import('./types').Assignment[]
    }>('/api/planning', { method: 'PUT', body: JSON.stringify({ assignments }) }),
  staffConfirmPlan: () =>
    request<{
      board: { status: string; updatedAt?: string | null; confirmedAt?: string | null }
      assignments: import('./types').Assignment[]
    }>('/api/planning?action=confirm', { method: 'POST' }),
  staffAddApplicant: (body: unknown) => request('/api/applicants', { method: 'POST', body: JSON.stringify(body) }),
  staffUpdateApplicant: (umaId: string, body: unknown) =>
    request(`/api/applicants?umaId=${encodeURIComponent(umaId)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  staffDeleteApplicant: (umaId: string) =>
    request<void>(`/api/applicants?umaId=${encodeURIComponent(umaId)}`, { method: 'DELETE' }),

  // Local SQLite workspace endpoints
  state: () => request<import('./types').DashboardState>('/api/state'),
  sync: () => request<import('./types').DashboardState>('/api/sync', { method: 'POST' }),
  addClub: (body: unknown) => request('/api/clubs', { method: 'POST', body: JSON.stringify(body) }),
  updateClub: (id: string, body: unknown) => request(`/api/clubs/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteClub: (id: string) => request(`/api/clubs/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  addApplicant: (body: unknown) => request('/api/applicants', { method: 'POST', body: JSON.stringify(body) }),
  updateApplicant: (id: string, body: unknown) => request(`/api/applicants/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteApplicant: (id: string) => request(`/api/applicants/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  savePlan: (assignments: import('./types').Assignment[]) => request('/api/planning', { method: 'PUT', body: JSON.stringify({ assignments }) }),
  confirmPlan: () => request('/api/planning/confirm', { method: 'POST' }),
  preview: () => request<{ previous: unknown; next: unknown }>('/api/publication/preview'),
  publish: () => request<{ destination: string }>('/api/publication/publish', { method: 'POST' }),
}
