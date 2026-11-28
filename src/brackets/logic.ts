// Same rules as the bot's scripts/gambaBrackets.js, so picks propagate in the
// browser exactly as the server will save them.

export type SlotSource =
  | { type: 'team'; teamId: string }
  | { type: 'winner'; matchId: string }
  | { type: 'loser'; matchId: string }

export type BracketMatch = {
  id: string
  number: number
  side: 'upper' | 'lower' | 'final'
  round: number
  label: string
  slots: SlotSource[]
  points: number
  carrots: number
}

export type BracketTeam = { id: string; name: string; seed: number }

export type BracketShape = { matches: BracketMatch[] }

export type Winners = Record<string, string>

function index(bracket: BracketShape) {
  return new Map(bracket.matches.map((match) => [match.id, match]))
}

export function slotTeams(
  bracket: BracketShape,
  winners: Winners,
  matchId: string,
  byId = index(bracket),
): [string | null, string | null] {
  const match = byId.get(matchId)
  if (!match) return [null, null]
  return [resolve(bracket, winners, match.slots[0], byId), resolve(bracket, winners, match.slots[1], byId)]
}

function resolve(bracket: BracketShape, winners: Winners, slot: SlotSource | undefined, byId: Map<string, BracketMatch>): string | null {
  if (!slot) return null
  if (slot.type === 'team') return slot.teamId || null
  const won = winners[slot.matchId] || null
  if (slot.type === 'winner') return won
  if (!won) return null
  const [a, b] = slotTeams(bracket, winners, slot.matchId, byId)
  if (won === a) return b
  if (won === b) return a
  return null
}

/** Drop picks whose team is no longer in that match (in play order). */
export function cleanWinners(bracket: BracketShape, winners: Winners): Winners {
  const byId = index(bracket)
  const clean: Winners = {}
  for (const match of [...bracket.matches].sort((a, b) => a.number - b.number)) {
    const pick = winners[match.id]
    if (!pick) continue
    if (slotTeams(bracket, clean, match.id, byId).includes(pick)) clean[match.id] = pick
  }
  return clean
}

/** Set (or toggle off) a pick and clear anything downstream that no longer fits. */
export function choose(bracket: BracketShape, winners: Winners, matchId: string, teamId: string): Winners {
  const next = { ...winners }
  if (next[matchId] === teamId) delete next[matchId]
  else next[matchId] = teamId
  return cleanWinners(bracket, next)
}

/** Where a match's winner and loser go next, for the little routing notes. */
export function routes(bracket: BracketShape) {
  const out: Record<string, { winnerTo: number | null; loserTo: number | null }> = {}
  for (const match of bracket.matches) out[match.id] = { winnerTo: null, loserTo: null }
  for (const match of bracket.matches) {
    for (const slot of match.slots) {
      if (slot.type === 'winner' && out[slot.matchId]) out[slot.matchId].winnerTo = match.number
      if (slot.type === 'loser' && out[slot.matchId]) out[slot.matchId].loserTo = match.number
    }
  }
  return out
}

/** "Loser of 8" / "Winner of 5" placeholder for an empty slot. */
export function slotHint(bracket: BracketShape, slot: SlotSource) {
  if (slot.type === 'team') return 'TBD'
  const number = bracket.matches.find((match) => match.id === slot.matchId)?.number ?? '?'
  return slot.type === 'winner' ? `Winner of ${number}` : `Loser of ${number}`
}

/** Group matches into on-screen columns per side, in round order. */
export function columns(bracket: BracketShape) {
  const group = (side: BracketMatch['side']) => {
    const rounds = new Map<number, BracketMatch[]>()
    for (const match of bracket.matches.filter((item) => item.side === side)) {
      rounds.set(match.round, [...(rounds.get(match.round) || []), match])
    }
    return [...rounds.entries()].sort((a, b) => a[0] - b[0]).map(([, list]) => list.sort((a, b) => a.number - b.number))
  }
  return { upper: group('upper'), lower: group('lower'), final: group('final') }
}

/**
 * The same layout the bot builds, for the points table before the bracket exists.
 * Only number, label and default points matter here.
 */
export function previewMatches(size: number): BracketMatch[] {
  const k = Math.log2(size)
  const out: BracketMatch[] = []
  const upperSizes = Array.from({ length: k }, (_, i) => size / 2 ** (i + 1))
  const lowerRounds = 2 * (k - 1)
  const lowerSize = (round: number) => size / 2 ** (Math.floor((round + 1) / 2) + 1)
  const push = (side: BracketMatch['side'], round: number, count: number) => {
    for (let i = 0; i < count; i += 1) {
      out.push({ id: `m${out.length + 1}`, number: out.length + 1, side, round, label: '', slots: [], points: 1, carrots: 0 })
    }
  }
  push('upper', 1, upperSizes[0])
  push('lower', 1, lowerSize(1))
  for (let r = 2; r <= k; r += 1) {
    push('upper', r, upperSizes[r - 1])
    if (r > 2) push('lower', 2 * r - 3, lowerSize(2 * r - 3))
    push('lower', 2 * r - 2, lowerSize(2 * r - 2))
  }
  push('final', 1, 1)
  return out.map((match) => {
    const upperFinal = match.side === 'upper' && match.round === k
    const lowerFinal = match.side === 'lower' && match.round === lowerRounds
    const label = match.side === 'final' ? 'Grand final'
      : upperFinal ? 'Upper final'
        : lowerFinal ? 'Lower final'
          : `${match.side === 'upper' ? 'Upper' : 'Lower'} round ${match.round}`
    return { ...match, label, points: match.side === 'final' ? 3 : upperFinal || lowerFinal ? 2 : 1 }
  })
}

