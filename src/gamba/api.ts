export class GambaError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function gambaFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body != null && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(url, { ...init, credentials: 'include', headers })
  const body = await response.json().catch(() => null) as { error?: string } | null
  if (!response.ok) throw new GambaError(response.status, body?.error || 'Something went wrong.')
  return body as T
}

export type Runner = { number: number; name: string; ageSex: string; jockey: string; odds: number }
export type Phase = 'open' | 'closed' | 'scheduled' | 'settled'
export type Race = {
  id: string
  name: string
  phase: Phase
  startsAt: string | null
  endsAt: string | null
  winner: number | null
  winnerName: string | null
  entries: Runner[]
}
export type OpenTicket = {
  ticketId?: string
  eventId: string
  eventName: string
  entryNumber: number
  entryName: string
  amount: number
  oddsAtBet: number
}
export type ParlayLeg = {
  eventId: string
  eventName: string
  entryNumber: number
  entryName: string
  oddsAtBet: number
  status?: string
}
export type Parlay = {
  parlayId: string
  chainId: string | null
  chainName: string | null
  stake: number
  combinedOdds: number
  payoutIfHit: number
  placedAt?: string
  legs: ParlayLeg[]
}
export type HistoryRow = {
  kind: string
  eventName: string
  entryNumber: number | null
  entryName: string
  amount: number
  payout: number
  result: string | null
  oddsAtBet: number | null
  legs: ParlayLeg[] | null
}
export type Trainer = {
  discordId: string
  name: string
  carrots: number
  wins: number
  losses: number
  record: string | null
  openTickets: OpenTicket[]
  openParlays: Parlay[]
  history: HistoryRow[]
}
export type Me = Trainer & {
  authenticated: true
  username: string
  globalName: string | null
  avatar: string | null
}
export type BoardRow = {
  rank: number
  discordId: string
  name: string
  carrots: number
  wins: number
  losses: number
  record: string | null
}
export type ChainSummary = { id: string; name: string; stages: Array<{ id: string; label: string; eventIds: string[] }> }
export type ChainDetail = {
  id: string
  name: string
  stages: Array<{ id: string; label: string; eventIds: string[]; events: Race[] }>
}

export const gambaApi = {
  me: () => gambaFetch<Me>('/api/gamba/me'),
  events: () => gambaFetch<{ events: Race[] }>('/api/gamba/events'),
  leaderboard: () => gambaFetch<{ rows: BoardRow[] }>('/api/gamba/leaderboard'),
  trainer: (discordId: string) => gambaFetch<Trainer>(`/api/gamba/trainers/${encodeURIComponent(discordId)}`),
  chains: () => gambaFetch<{ chains: ChainSummary[] }>('/api/gamba/chains'),
  chain: (id: string) => gambaFetch<{ chain: ChainDetail }>(`/api/gamba/chains/${encodeURIComponent(id)}`),
  bet: (body: { eventId: string; entryNumber: number; amount: number }) =>
    gambaFetch<{ carrots: number }>('/api/gamba/bets', { method: 'POST', body: JSON.stringify(body) }),
  parlay: (body: { stake: number; chainId?: string | null; legs: Array<{ eventId: string; entryNumber: number }> }) =>
    gambaFetch<{ carrots: number }>('/api/gamba/parlays', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => fetch('/api/auth/me', { method: 'POST', credentials: 'include' }),
}

export const SILKS = [
  '#F4C7D8', '#F6D98A', '#9FD7C8', '#A9C8F5', '#E7B4F0', '#F6B48A',
  '#C9E59A', '#F3A8A8', '#B7E0F2', '#E6D3A3', '#C9B6F2', '#F7C6A4',
]

export function silkColor(number: number) {
  const n = Math.abs(Math.trunc(number) || 1)
  return SILKS[(n - 1) % SILKS.length]
}

export function oddsLabel(value: number | null | undefined) {
  const n = Math.round(Number(value) * 100) / 100
  if (!Number.isFinite(n)) return '—'
  return `×${n}`
}

export const coins = new Intl.NumberFormat('en-US')
