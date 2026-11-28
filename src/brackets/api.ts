import type { BracketMatch, BracketTeam, Winners } from './logic'

export class BracketError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function bracketFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body != null && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(url, { ...init, credentials: 'include', headers })
  const body = await response.json().catch(() => null) as { error?: string } | null
  if (!response.ok) throw new BracketError(response.status, body?.error || 'Something went wrong.')
  return body as T
}

export type BracketStatus = 'open' | 'locked' | 'finished'

export type BracketSummary = {
  id: string
  name: string
  status: BracketStatus
  locksAt: string | null
  teamCount: number
  matchCount: number
  entryCount: number
  resultCount: number
  carrotsPerfect: number
  pointsPerfect: number
  champion: { id: string; name: string | null } | null
  createdAt: string | null
  joined?: boolean
}

export type Viewer = { loggedIn: boolean; discordId: string | null; name: string | null; owner: boolean }

export type Bracket = BracketSummary & {
  teams: BracketTeam[]
  matches: BracketMatch[]
  results: Winners
}

export type PickStatus = 'correct' | 'wrong' | 'dead' | 'open' | 'none'

export type Entry = {
  discordId: string
  name: string
  picks: Winners
  updatedAt: string | null
  carrots: number
  points: number
  correct: number
  wrong: number
  maxPoints: number
  status: Record<string, PickStatus>
}

export type Standing = {
  rank: number
  discordId: string
  name: string
  points: number
  correct: number
  wrong: number
  maxPoints: number
  carrots: number
  picked: number
  complete: boolean
  champion: string | null
  updatedAt: string | null
}

export type BracketDetail = {
  bracket: Bracket
  viewer: Viewer
  mine: Entry | null
  standings: Standing[]
}

export type BracketInput = {
  name: string
  teams: string[]
  locksAt: string | null
  points: Record<string, number>
  carrots: Record<string, number>
}

const base = '/api/brackets'
const one = (id: string) => `${base}/${encodeURIComponent(id)}`

export const bracketApi = {
  list: () => bracketFetch<{ brackets: BracketSummary[]; viewer: Viewer }>(base),
  get: (id: string) => bracketFetch<BracketDetail>(one(id)),
  entry: (id: string, discordId: string) => bracketFetch<{ entry: Entry }>(`${one(id)}/entries/${encodeURIComponent(discordId)}`),
  savePicks: (id: string, picks: Winners) => bracketFetch<BracketDetail>(`${one(id)}/picks`, { method: 'PUT', body: JSON.stringify({ picks }) }),
  create: (input: BracketInput) => bracketFetch<BracketDetail>(base, { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: BracketInput) => bracketFetch<BracketDetail>(one(id), { method: 'PUT', body: JSON.stringify(input) }),
  remove: (id: string) => bracketFetch<{ ok: true }>(one(id), { method: 'DELETE' }),
  lock: (id: string, locked: boolean) => bracketFetch<BracketDetail>(`${one(id)}/lock`, { method: 'POST', body: JSON.stringify({ locked }) }),
  result: (id: string, matchId: string, teamId: string | null) =>
    bracketFetch<BracketDetail & { changed: string[] }>(`${one(id)}/results`, { method: 'POST', body: JSON.stringify({ matchId, teamId }) }),
}

export const loginHref = (returnTo: string) => `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`
