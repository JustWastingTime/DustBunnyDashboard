import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PickStatus } from './api'
import { columns, routes, slotHint, slotTeams, type BracketMatch, type BracketShape, type BracketTeam, type Winners } from './logic'

type Props = {
  bracket: BracketShape & { teams: BracketTeam[] }
  /** Winners used to fill the slots: a player's picks, or the real results. */
  winners: Winners
  /** Real results, to show who actually won next to a missed pick. */
  results?: Winners
  /** Per-match pick status once results come in. */
  status?: Record<string, PickStatus>
  /** How the highlighted team reads: a pick, or a result. */
  tone: 'pick' | 'result'
  onChoose?: (matchId: string, teamId: string) => void
  /** Extra control under a match (the owner's "clear result"). */
  matchFooter?: (match: BracketMatch) => React.ReactNode
}

type Line = { key: string; d: string }

const STATUS_MARK: Record<PickStatus, { text: string; label: string } | null> = {
  correct: { text: '✓', label: 'Correct pick' },
  wrong: { text: '✗', label: 'Missed pick' },
  dead: { text: '–', label: 'Your pick is out of this match' },
  open: null,
  none: null,
}

export function BracketView({ bracket, winners, results, status, tone, onChoose, matchFooter }: Props) {
  const cols = useMemo(() => columns(bracket), [bracket])
  const route = useMemo(() => routes(bracket), [bracket])
  const teamById = useMemo(() => new Map(bracket.teams.map((team) => [team.id, team])), [bracket.teams])
  const upperCount = cols.upper.length
  const lowerCount = cols.lower.length
  const total = Math.max(upperCount + 1, lowerCount)

  const upperCols: BracketMatch[][] = Array.from({ length: total }, (_, i) => cols.upper[i] || [])
  upperCols[total - 1] = [...upperCols[total - 1], ...cols.final.flat()]
  const lowerCols: BracketMatch[][] = Array.from({ length: total }, (_, i) => cols.lower[i] || [])

  return <div className="bx-scroll">
    <div className="bx-board" style={{ ['--bx-cols' as string]: total }}>
      <Section
        title="Upper bracket"
        hint="Win to move right. Lose once and you drop to the lower bracket."
        cols={upperCols}
        {...{ bracket, winners, results, status, tone, onChoose, matchFooter, teamById, route }}
      />
      <Section
        title="Lower bracket"
        hint="One more loss here and you're out."
        cols={lowerCols}
        {...{ bracket, winners, results, status, tone, onChoose, matchFooter, teamById, route }}
      />
    </div>
  </div>
}

function columnTitle(list: BracketMatch[]) {
  if (!list.length) return ''
  const labels = [...new Set(list.map((match) => match.label))]
  return labels.join(' · ')
}

function Section({
  title,
  hint,
  cols,
  bracket,
  winners,
  results,
  status,
  tone,
  onChoose,
  matchFooter,
  teamById,
  route,
}: Omit<Props, 'bracket'> & {
  bracket: Props['bracket']
  title: string
  hint: string
  cols: BracketMatch[][]
  teamById: Map<string, BracketTeam>
  route: ReturnType<typeof routes>
}) {
  const gridRef = useRef<HTMLDivElement>(null)
  const cards = useRef(new Map<string, HTMLElement>())
  const rows = useRef(new Map<string, HTMLElement>())
  const [lines, setLines] = useState<Line[]>([])
  const [size, setSize] = useState({ w: 0, h: 0 })
  const here = useMemo(() => new Set(cols.flat().map((match) => match.id)), [cols])

  const measure = useCallback(() => {
    const grid = gridRef.current
    if (!grid) return
    const box = grid.getBoundingClientRect()
    const next: Line[] = []
    for (const match of cols.flat()) {
      match.slots.forEach((slot, index) => {
        if (slot.type !== 'winner' || !here.has(slot.matchId)) return
        const from = cards.current.get(slot.matchId)?.getBoundingClientRect()
        const to = rows.current.get(`${match.id}:${index}`)?.getBoundingClientRect()
        if (!from || !to) return
        const x1 = from.right - box.left
        const y1 = from.top + from.height / 2 - box.top
        const x2 = to.left - box.left
        const y2 = to.top + to.height / 2 - box.top
        const xm = x2 - Math.min(24, (x2 - x1) / 2)
        next.push({ key: `${slot.matchId}-${match.id}-${index}`, d: `M${x1} ${y1}H${xm}V${y2}H${x2}` })
      })
    }
    setLines(next)
    setSize({ w: grid.scrollWidth, h: grid.scrollHeight })
  }, [cols, here])

  useLayoutEffect(() => {
    measure()
    const grid = gridRef.current
    if (!grid || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => measure())
    observer.observe(grid)
    return () => observer.disconnect()
  }, [measure, winners, results])

  return <section className="bx-section">
    <header className="bx-section-head">
      <h3>{title}</h3>
      <p>{hint}</p>
    </header>
    <div className="bx-grid" ref={gridRef}>
      <svg className="bx-lines" width={size.w} height={size.h} aria-hidden="true">
        {lines.map((line) => <path key={line.key} d={line.d} />)}
      </svg>
      {cols.map((list, colIndex) => (
        <div className="bx-col" key={colIndex}>
          <p className="bx-col-title">{columnTitle(list)}</p>
          <div className="bx-col-body">
            {list.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                bracket={bracket}
                winners={winners}
                results={results}
                status={status?.[match.id]}
                tone={tone}
                onChoose={onChoose}
                footer={matchFooter?.(match)}
                teamById={teamById}
                route={route[match.id]}
                cardRef={(el) => { if (el) cards.current.set(match.id, el); else cards.current.delete(match.id) }}
                rowRef={(index, el) => {
                  const key = `${match.id}:${index}`
                  if (el) rows.current.set(key, el)
                  else rows.current.delete(key)
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  </section>
}

function MatchCard({
  match,
  bracket,
  winners,
  results,
  status,
  tone,
  onChoose,
  footer,
  teamById,
  route,
  cardRef,
  rowRef,
}: {
  match: BracketMatch
  bracket: Props['bracket']
  winners: Winners
  results?: Winners
  status?: PickStatus
  tone: Props['tone']
  onChoose?: Props['onChoose']
  footer?: React.ReactNode
  teamById: Map<string, BracketTeam>
  route: { winnerTo: number | null; loserTo: number | null }
  cardRef: (el: HTMLElement | null) => void
  rowRef: (index: number, el: HTMLElement | null) => void
}) {
  const teams = slotTeams(bracket, winners, match.id)
  const chosen = winners[match.id] || null
  const ready = Boolean(teams[0] && teams[1])
  const actual = results?.[match.id] || null
  const mark = status ? STATUS_MARK[status] : null
  const where = [
    route.winnerTo ? `Winner goes to ${route.winnerTo}` : match.side === 'final' ? 'Winner takes the title' : null,
    route.loserTo ? `loser goes to ${route.loserTo}` : null,
  ].filter(Boolean).join(', ')
  const missed = tone === 'pick' && actual && chosen && actual !== chosen
  const className = [
    'bx-match',
    match.side === 'final' ? 'final' : '',
    status ? `is-${status}` : '',
  ].filter(Boolean).join(' ')

  return <div className="bx-match-wrap">
    <span className="bx-num" aria-hidden="true">{match.number}</span>
    <article className={className} ref={cardRef} title={where || undefined} aria-label={`Match ${match.number}, ${match.label}`}>
      {teams.map((teamId, index) => {
        const team = teamId ? teamById.get(teamId) : null
        const isChosen = Boolean(teamId && chosen === teamId)
        const lost = Boolean(chosen && teamId && chosen !== teamId && tone === 'result')
        const canClick = Boolean(onChoose && teamId && ready)
        const rowClass = [
          'bx-row',
          isChosen ? (tone === 'pick' ? 'picked' : 'won') : '',
          lost ? 'lost' : '',
          !team ? 'empty' : '',
          canClick ? 'clickable' : '',
        ].filter(Boolean).join(' ')
        const content = <>
          <span className="bx-seed">{team ? team.seed : ''}</span>
          <span className="bx-name">{team ? team.name : slotHint(bracket, match.slots[index])}</span>
          {isChosen && (mark
            ? <span className={`bx-tick mark ${status}`} title={mark.label} aria-label={mark.label}>{mark.text}</span>
            : <span className="bx-tick" aria-hidden="true">{tone === 'pick' ? '★' : '✓'}</span>)}
        </>
        return canClick
          ? <button
            key={index}
            type="button"
            className={rowClass}
            ref={(el) => rowRef(index, el)}
            aria-pressed={isChosen}
            onClick={() => onChoose?.(match.id, teamId!)}
          >{content}</button>
          : <div key={index} className={rowClass} ref={(el) => rowRef(index, el)}>{content}</div>
      })}
    </article>
    <p className="bx-meta">
      {missed
        ? <span className="bx-actual">Won by {teamById.get(actual)?.name || 'someone else'}</span>
        : <span>{match.points} {match.points === 1 ? 'pt' : 'pts'}{match.carrots ? ` · ${match.carrots.toLocaleString('en-US')} 🥕` : ''}</span>}
      {footer}
    </p>
  </div>
}
