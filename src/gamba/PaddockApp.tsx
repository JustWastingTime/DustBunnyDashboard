import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  coins,
  gambaApi,
  GambaError,
  oddsLabel,
  silkColor,
  type BoardRow,
  type HistoryRow,
  type Me,
  type OpenTicket,
  type Parlay,
  type Race,
  type TournamentDetail,
  type TournamentSummary,
  type Trainer,
} from './api'
import { adminApi, type GambaTournament } from '../admin/api'
import { NewRace } from './NewRace'
import './gamba.css'

type Pick = {
  eventId: string
  eventName: string
  entryNumber: number
  entryName: string
  odds: number
  kind?: 'match' | 'advance'
  slotId?: string
}

const loginHref = `/api/auth/login?returnTo=${encodeURIComponent('/gamba')}`

function SlipTabs({
  label,
  value,
  onChange,
  tabs,
}: {
  label: string
  value: string
  onChange: (id: string) => void
  tabs: { id: string; label: ReactNode; count?: number }[]
}) {
  const tabRef = useRef<HTMLDivElement>(null)
  const [slider, setSlider] = useState({ x: 0, width: 0, on: false })
  const mark = tabs.map((tab) => `${tab.id}:${tab.count ?? ''}`).join('|')
  useLayoutEffect(() => {
    const root = tabRef.current
    const current = root?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!root || !current) {
      setSlider((item) => ({ ...item, on: false }))
      return
    }
    setSlider({ x: current.offsetLeft, width: current.offsetWidth, on: true })
  }, [value, mark])
  return (
    <div className="slip-tabs" role="tablist" aria-label={label} ref={tabRef}>
      <span className={slider.on ? 'slip-slider on' : 'slip-slider'} style={{ transform: `translateX(${slider.x}px)`, width: slider.width }} />
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          className={value === tab.id ? 'slip-tab on' : 'slip-tab'}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.count != null && <span>{tab.count}</span>}
        </button>
      ))}
    </div>
  )
}

function Carrot({ size = 22 }: { size?: number }) {
  return <span className="carrot" style={{ fontSize: size }} aria-hidden="true">🥕</span>
}

function shownName(name: string) {
  const value = name.trim()
  if (!value || value.toLowerCase() === 'trainer') return 'Anonymous Trainer'
  return value
}

function when(iso: string | null) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function statusLabel(phase: Race['phase']) {
  if (phase === 'open') return 'Open'
  if (phase === 'closed') return 'Expired'
  if (phase === 'scheduled') return 'Soon'
  return 'Settled'
}

function raceNote(race: Race) {
  if (race.phase === 'open') return when(race.endsAt) ? `Closes ${when(race.endsAt)}` : 'Still open'
  if (race.phase === 'scheduled') return when(race.startsAt) ? `Opens ${when(race.startsAt)}` : 'Not open yet'
  if (race.phase === 'closed') return when(race.endsAt) ? `Expired ${when(race.endsAt)}` : 'Expired'
  if (race.winnerName) return `Winner #${race.winner} ${race.winnerName}${race.winnerOdds != null ? ` ${oddsLabel(race.winnerOdds)}` : ''}`
  return 'Settled'
}

function previewPay(stake: number, picks: Pick[]) {
  if (!picks.length || !Number.isFinite(stake) || stake <= 0) return 0
  return Math.floor(picks.reduce((product, pick) => product * pick.odds, stake))
}

export function PaddockApp({ path, navigate }: { path: string; navigate: (to: string) => void }) {
  const clean = path.split('?')[0]
  const failedLogin = path.includes('error=login_failed')
  const [me, setMe] = useState<Me | null>(null)
  const [gate, setGate] = useState<'loading' | 'in' | 'out'>('loading')
  const [problem, setProblem] = useState('')
  const [picks, setPicks] = useState<Pick[]>([])
  const navRef = useRef<HTMLElement>(null)
  const [slider, setSlider] = useState({ x: 0, width: 0, on: false })
  const racesOn = clean === '/gamba' || clean.startsWith('/gamba/race/') || clean.startsWith('/gamba/meet/')
  const tournamentsOn = clean === '/gamba/tournaments' || clean.startsWith('/gamba/tournament/')
  const boardOn = clean === '/gamba/board'
  useLayoutEffect(() => {
    const nav = navRef.current
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !current) {
      setSlider((item) => ({ ...item, on: false }))
      return
    }
    setSlider({ x: current.offsetLeft, width: current.offsetWidth, on: true })
  }, [clean, gate])

  useEffect(() => {
    document.title = 'Tazuna Paddock'
    const root = document.documentElement
    const previous = root.style.background
    root.style.background = '#121526'
    return () => { root.style.background = previous }
  }, [])

  const reload = () => gambaApi.me().then((next) => {
    setMe(next)
    setGate('in')
  })

  useEffect(() => {
    let cancel = false
    gambaApi.me().then((next) => {
      if (cancel) return
      setMe(next)
      setGate('in')
    }).catch((reason) => {
      if (cancel) return
      if (reason instanceof GambaError && reason.status === 401) setGate('out')
      else {
        setGate('out')
        setProblem(reason instanceof Error ? reason.message : 'The paddock could not load.')
      }
    })
    return () => { cancel = true }
  }, [])

  const go = (href: string) => (event: { preventDefault: () => void }) => {
    event.preventDefault()
    navigate(href)
  }

  if (gate === 'loading') {
    return <div className="paddock"><p className="gate">Loading the card.</p></div>
  }
  if (gate === 'out' || !me) {
    return <div className="paddock">
      <main className="gate">
        <h1>Tazuna Paddock</h1>
        <p>Log in with Discord. Your carrots are the same ones on /profile.</p>
        <a className="login place" href={loginHref}>Log in with Discord</a>
        {failedLogin && <p className="problem">Discord login did not finish. Try again.</p>}
        {problem && <p className="problem">{problem}</p>}
      </main>
    </div>
  }

  const placePicks = async (stake: number) => {
    const pick = picks[0]
    if (!pick) return me.carrots
    const result = await gambaApi.bet({ eventId: pick.eventId, entryNumber: pick.entryNumber, amount: stake })
    setPicks([])
    await reload()
    return result.carrots
  }

  let body: ReactNode = <CardPage me={me} picks={picks} setPicks={setPicks} onPlace={placePicks} navigate={navigate} />
  if (clean === '/gamba/board') body = <BoardPage me={me} navigate={navigate} />
  else if (clean.startsWith('/gamba/trainer/')) body = <TrainerPage discordId={decodeURIComponent(clean.slice('/gamba/trainer/'.length))} navigate={navigate} />
  else if (clean === '/gamba/new') {
    const params = new URLSearchParams(path.includes('?') ? path.slice(path.indexOf('?') + 1) : '')
    body = <NewRace key={`${params.get('race') || ''}-${params.get('tournament') || ''}-${params.get('round') || ''}`} owner={Boolean(me.owner)} eventId={params.get('race')} tournamentId={params.get('tournament')} roundId={params.get('round')} navigate={navigate} />
  }
  else if (clean === '/gamba/tournaments') body = <TournamentsPage owner={Boolean(me.owner)} navigate={navigate} />
  else if (clean.startsWith('/gamba/tournament/')) body = <TournamentPage tournamentId={decodeURIComponent(clean.slice('/gamba/tournament/'.length))} me={me} reload={reload} navigate={navigate} />
  else if (clean.startsWith('/gamba/race/')) {
    body = <RacePage
      eventId={decodeURIComponent(clean.slice('/gamba/race/'.length))}
      me={me}
      picks={picks}
      setPicks={setPicks}
      onPlace={placePicks}
      navigate={navigate}
    />
  }

  return <div className="paddock">
    <header className="top">
      <div className="top-bar">
        <div className="top-lead">
          <a className="brand" href="/gamba" onClick={go('/gamba')}>
            <span className="logo-mark" aria-hidden="true">🥕</span>
            <span>Tazuna Paddock</span>
          </a>
          <nav className="links" aria-label="Paddock" ref={navRef}>
            <span className={slider.on ? 'nav-slider on' : 'nav-slider'} style={{ transform: `translateX(${slider.x}px)`, width: slider.width }} />
            <a href="/gamba" aria-current={racesOn ? 'page' : undefined} onClick={go('/gamba')}><span aria-hidden="true">🍀</span> Races</a>
            <a href="/gamba/tournaments" aria-current={tournamentsOn ? 'page' : undefined} onClick={go('/gamba/tournaments')}><span aria-hidden="true">🏁</span> Tournaments</a>
            <a href="/gamba/board" aria-current={boardOn ? 'page' : undefined} onClick={go('/gamba/board')}><span aria-hidden="true">🏆</span> Leaderboard</a>
          </nav>
          {me.owner && <a className="host-race" href="/gamba/new" aria-current={clean === '/gamba/new' ? 'page' : undefined} onClick={go('/gamba/new')}>Host race</a>}
        </div>
        <div className="top-end">
          <p className="purse">
            <span className="carrot-bounce" aria-hidden="true">🥕</span>
            <strong className="odds-num">{coins.format(me.carrots)}</strong>
            <span>Carrots</span>
          </p>
          <div className="trainer-pill">
            <a className="trainer-id" href={`/gamba/trainer/${me.discordId}`} onClick={go(`/gamba/trainer/${me.discordId}`)}>
              <span className="trainer-name">{shownName(me.name)}</span>
              <span className="trainer-sub">{me.wins} hit · {me.losses} missed</span>
            </a>
            <span className="avatar" aria-hidden="true">🐴</span>
            <button type="button" className="gear" aria-label="Log out" onClick={() => { void gambaApi.logout().then(() => window.location.assign('/gamba')) }}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.2 7.2 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.4.31.64.22l2.39-.96c.5.38 1.04.7 1.63.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.59-.24 1.13-.56 1.63-.94l2.39.96c.23.09.5 0 .64-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </header>
    <main className="paddock-body">{body}</main>
    <footer className="pad-foot">
      <div>
        <span className="foot-brand">🥕 Tazuna Paddock</span>
        <span>Same carrots as Discord.</span>
      </div>
      <nav aria-label="Paddock footer">
        <a href="/gamba" onClick={go('/gamba')}>Board</a>
        <a href="/gamba/board" onClick={go('/gamba/board')}>Leaderboard</a>
      </nav>
    </footer>
  </div>
}

function favorite(race: Race) {
  if (!race.entries.length) return null
  return [...race.entries].sort((a, b) => a.odds - b.odds || a.number - b.number)[0]
}

function markOdds(value: number | null | undefined) {
  const n = Math.round(Number(value) * 100) / 100
  if (!Number.isFinite(n)) return ''
  return `x${n}`
}

function clockTime(iso: string | null) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function openDay(iso: string | null) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function finishStamp(race: Race) {
  const stamp = Date.parse(race.settledAt || race.endsAt || '')
  return Number.isFinite(stamp) ? stamp : 0
}

function horseCount(count: number, word: 'runners' | 'horses') {
  return `${count} ${count === 1 ? word.replace(/s$/, '') : word}`
}

function CardPage({ me, picks, setPicks, onPlace, navigate }: {
  me: Me
  picks: Pick[]
  setPicks: (next: Pick[]) => void
  onPlace: (stake: number) => Promise<number>
  navigate: (to: string) => void
}) {
  const [events, setEvents] = useState<Race[]>([])
  const [problem, setProblem] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [toast, setToast] = useState('')
  const [showSettled, setShowSettled] = useState(false)
  const blocked = blockedEvents(me)
  useEffect(() => {
    gambaApi.events()
      .then((payload) => setEvents(payload.events))
      .catch((reason) => setProblem(reason instanceof Error ? reason.message : 'The board could not load.'))
      .finally(() => setLoaded(true))
  }, [])
  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(''), 2600)
    return () => window.clearTimeout(id)
  }, [toast])
  const go = (href: string) => (event: { preventDefault: () => void }) => {
    event.preventDefault()
    navigate(href)
  }
  const offerFavorite = (race: Race) => {
    const fav = favorite(race)
    if (!fav || blocked.get(race.id)) return
    setPicks([{
      eventId: race.id,
      eventName: race.name,
      entryNumber: fav.number,
      entryName: fav.name,
      odds: fav.odds,
    }])
    setToast(`Quick bet on #${fav.number} ${fav.name}`)
  }
  const open = events.filter((race) => race.phase === 'open')
  const soon = events.filter((race) => race.phase === 'scheduled')
  const expired = events.filter((race) => race.phase === 'closed')
  const settled = events
    .filter((race) => race.phase === 'settled')
    .sort((a, b) => finishStamp(b) - finishStamp(a) || a.name.localeCompare(b.name))
  const settledShown = showSettled ? settled : settled.slice(0, 4)
  return <div className={picks.length ? 'paddock-main with-slip' : 'paddock-main'}>
    <div className="board-stack">
      {problem && <p className="problem">{problem}</p>}
      <section className="race-lane">
        <div className="race-lane-head">
          <div className="race-lane-title">
            <span aria-hidden="true">✨</span>
            <h2>Open for Wagering</h2>
            <span className="count mint">{open.length} {open.length === 1 ? 'track' : 'tracks'}</span>
          </div>
          {open.length > 0 && <p className="live"><span className="live-dot" /> Live paddock</p>}
        </div>
        {loaded && !open.length && !problem && <p className="empty">No races are open. Check back when a card is posted.</p>}
        <div className="open-grid">
          {open.map((race) => {
            const fav = favorite(race)
            const reason = blocked.get(race.id) || ''
            return <article className="open-card" key={race.id}>
              <div className="open-body">
                <div className="open-meta">
                  <span className="meta-left">
                    <span className="pill open">Open</span>
                    <span>🐴 {horseCount(race.entries.length, 'runners')}</span>
                  </span>
                  <span className="closes">{race.endsAt ? `Closes ${clockTime(race.endsAt)}` : 'Still open'}</span>
                </div>
                <h3><a href={`/gamba/race/${race.id}`} onClick={go(`/gamba/race/${race.id}`)}>{race.name}</a></h3>
                {fav && <div className="favored">
                  <span className="star">Top favored</span>
                  <span>#{fav.number} {fav.name}</span>
                  <span className="odds-pill mint">{markOdds(fav.odds)}</span>
                </div>}
                {reason && <p className="when">{reason}</p>}
              </div>
              <div className="open-actions">
                <button type="button" className="quick" disabled={!fav || Boolean(reason)} onClick={() => offerFavorite(race)}>
                  <span aria-hidden="true">🥕</span> Quick Bet
                </button>
              </div>
            </article>
          })}
        </div>
      </section>
      {soon.length > 0 && <section className="race-lane">
        <div className="race-lane-head">
          <div className="race-lane-title">
            <span aria-hidden="true">⏰</span>
            <h2>Starting Soon</h2>
            <span className="count amber">{soon.length} scheduled</span>
          </div>
          <p className="live">Gate draws in progress</p>
        </div>
        {soon.map((race) => (
          <article className="soon-card" key={race.id}>
            <div>
              <div className="soon-meta">
                <span className="pill soon">Soon</span>
                <span>🐴 {horseCount(race.entries.length, 'horses')}</span>
                {race.startsAt && <span className="soon-when">Opens {openDay(race.startsAt)}</span>}
              </div>
              <h3><a href={`/gamba/race/${race.id}`} onClick={go(`/gamba/race/${race.id}`)}>{race.name}</a></h3>
            </div>
            {me.owner
              ? <a className="edit-view" href={`/gamba/new?race=${encodeURIComponent(race.id)}`} onClick={go(`/gamba/new?race=${encodeURIComponent(race.id)}`)}>Edit / View</a>
              : <a className="edit-view" href={`/gamba/race/${race.id}`} onClick={go(`/gamba/race/${race.id}`)}>View</a>}
          </article>
        ))}
      </section>}
      {expired.length > 0 && <section className="race-lane">
        <div className="race-lane-head">
          <div className="race-lane-title">
            <span aria-hidden="true">🎀</span>
            <h2>Expired</h2>
            <span className="count">{expired.length}</span>
          </div>
        </div>
        {expired.map((race) => (
          <article className="soon-card" key={race.id}>
            <div>
              <div className="soon-meta">
                <span className="pill closed">Expired</span>
                <span>🐴 {horseCount(race.entries.length, 'horses')}</span>
                {race.endsAt && <span className="soon-when">Closed {openDay(race.endsAt)}</span>}
              </div>
              <h3><a href={`/gamba/race/${race.id}`} onClick={go(`/gamba/race/${race.id}`)}>{race.name}</a></h3>
            </div>
            {me.owner
              ? <a className="edit-view" href={`/gamba/new?race=${encodeURIComponent(race.id)}`} onClick={go(`/gamba/new?race=${encodeURIComponent(race.id)}`)}>Edit / View</a>
              : <a className="edit-view" href={`/gamba/race/${race.id}`} onClick={go(`/gamba/race/${race.id}`)}>View</a>}
          </article>
        ))}
      </section>}
      {settled.length > 0 && <section className="race-lane">
        <div className="race-lane-head">
          <div className="race-lane-title">
            <span aria-hidden="true">🏆</span>
            <h2>Settled Races</h2>
            <span className="count">{settled.length} archived</span>
          </div>
          {settled.length > 4 && <button type="button" className="view-all" onClick={() => setShowSettled((current) => !current)}>
            {showSettled ? 'Show fewer' : 'View all replays'}
          </button>}
        </div>
        <div className="settled-grid">
          {settledShown.map((race) => (
            <a className="settled-card" key={race.id} href={`/gamba/race/${race.id}`} onClick={go(`/gamba/race/${race.id}`)}>
              <div>
                <div className="settled-meta">
                  <span className="pill settled">Settled</span>
                  <span>🐴 {horseCount(race.entries.length, 'horses')}</span>
                </div>
                <h3>{race.name}</h3>
              </div>
              <div className="winner-line">
                <span>Winner</span>
                <span>{race.winnerName ? `#${race.winner} ${race.winnerName} ${markOdds(race.winnerOdds)}` : 'No winner posted'}</span>
              </div>
            </a>
          ))}
        </div>
      </section>}
      <OpenSlips me={me} navigate={navigate} />
    </div>
    {picks.length > 0 && <TicketSlip
      title="Your ticket"
      picks={picks}
      hint="One horse. Win only."
      ready
      onRemove={(pick) => setPicks(picks.filter((item) => item !== pick))}
      onPlace={onPlace}
    />}
    <div className={toast ? 'toast show' : 'toast'} role="status">
      <span aria-hidden="true">✨</span>
      <span>
        <strong>{toast || 'Ticket ready'}</strong>
        <span>Stake it on the ticket.</span>
      </span>
    </div>
  </div>
}

function RacePage({ eventId, me, picks, setPicks, onPlace, navigate }: {
  eventId: string
  me: Me
  picks: Pick[]
  setPicks: (next: Pick[]) => void
  onPlace: (stake: number) => Promise<number>
  navigate: (to: string) => void
}) {
  const [race, setRace] = useState<Race | null>(null)
  const [problem, setProblem] = useState('')
  useEffect(() => {
    setRace(null)
    gambaApi.event(eventId).then((payload) => setRace(payload.event)).catch((reason) => setProblem(reason instanceof Error ? reason.message : 'That race is gone.'))
  }, [eventId])
  const go = (href: string) => (event: { preventDefault: () => void }) => {
    event.preventDefault()
    navigate(href)
  }
  const blocked = blockedEvents(me).get(eventId) || ''
  const open = race?.phase === 'open'
  const showTicket = Boolean(open || picks.length)
  if (!race && !problem) return <p className="paddock-main">Loading this race.</p>
  return <div className={showTicket ? 'paddock-main with-slip' : 'paddock-main'}>
    <div>
      <p><a href="/gamba" onClick={go('/gamba')}>All races</a></p>
      {problem && <p className="problem">{problem}</p>}
      {race && <>
        <div className="race-head">
          <div className="race-tools">
            <span className={`status ${race.phase}`}>{statusLabel(race.phase)}</span>
            {me.owner && race.phase !== 'settled' && (
              <a className="edit-race" href={`/gamba/new?race=${encodeURIComponent(race.id)}`} onClick={go(`/gamba/new?race=${encodeURIComponent(race.id)}`)}>Edit race</a>
            )}
          </div>
          <h1>{race.name}</h1>
          <p className="when">{raceNote(race)}</p>
        </div>
        <RaceCard
          race={race}
          picks={picks}
          titled={false}
          blockedReason={blocked}
          onToggle={(pick) => setPicks(picks.some((item) => item.eventId === pick.eventId && item.entryNumber === pick.entryNumber) ? [] : [pick])}
        />
        {race.phase === 'settled' && <Results race={race} />}
      </>}
    </div>
    {showTicket && <TicketSlip
      title="Your ticket"
      picks={picks}
      hint="Add one horse. Win only."
      ready={picks.length > 0}
      onRemove={(pick) => setPicks(picks.filter((item) => pickKey(item) !== pickKey(pick)))}
      onPlace={onPlace}
    />}
  </div>
}

function Results({ race }: { race: Race }) {
  const winners = (race.results || []).filter((row) => row.won)
  const losers = (race.results || []).filter((row) => !row.won)
  if (!winners.length && !losers.length) return <p>No tickets on this race.</p>
  return <div className="results">
    <section>
      <h2 className="cashed">Cashed</h2>
      <ResultList rows={winners} empty="Nobody cashed." />
    </section>
    <section>
      <h2 className="missed">Missed</h2>
      <ResultList rows={losers} empty="Nobody missed." />
    </section>
  </div>
}

function ResultList({ rows, empty }: { rows: Race['results']; empty: string }) {
  if (!rows.length) return <p className="when">{empty}</p>
  return <ul className="purse-list">
    {rows.map((row) => (
      <li key={`${row.name}-${row.entryNumber}`}>
        <span>
          <strong>{shownName(row.name)}</strong>
          <span className="meta">#{row.entryNumber} {row.entryName}</span>
        </span>
        <span className={row.won ? 'gain num' : 'loss num'}>
          <Carrot size={18} />
          {row.won ? `+${coins.format(row.netGain)}` : `−${coins.format(row.wagered)}`}
        </span>
      </li>
    ))}
  </ul>
}

function TournamentsPage({ owner, navigate }: { owner: boolean; navigate: (to: string) => void }) {
  const [rows, setRows] = useState<TournamentSummary[]>([])
  const [name, setName] = useState('')
  const [rounds, setRounds] = useState(['Groups', 'Final'])
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => {
    gambaApi.tournaments().then((payload) => setRows(payload.tournaments)).catch((reason) => setProblem(reason instanceof Error ? reason.message : 'Tournaments could not load.'))
  }
  useEffect(() => { load() }, [])
  const go = (href: string) => (event: { preventDefault: () => void }) => {
    event.preventDefault()
    navigate(href)
  }
  const save = async () => {
    const labels = rounds.map((label) => label.trim()).filter(Boolean)
    if (!name.trim() || labels.length < 1) {
      setProblem('Name the tournament and at least one round.')
      return
    }
    setBusy(true)
    setProblem('')
    try {
      const draft: GambaTournament = {
        id: '',
        name: name.trim(),
        rounds: labels.map((label) => ({ label, eventIds: [], pickemPayouts: [0] })),
      }
      await adminApi.saveGambaTournament(draft)
      setName('')
      setRounds(['Groups', 'Final'])
      load()
    } catch (reason) {
      setProblem(reason instanceof Error ? reason.message : 'The tournament was not saved.')
    } finally {
      setBusy(false)
    }
  }
  return <div className="paddock-main">
    <div className="board-stack">
      {problem && <p className="problem">{problem}</p>}
      <section className="race-lane">
        <div className="race-lane-head">
          <div className="race-lane-title">
            <span aria-hidden="true">🏁</span>
            <h2>Tournaments</h2>
          </div>
        </div>
        {!rows.length && <p className="empty">No tournament is posted.</p>}
        <div className="open-grid">
          {rows.map((tournament) => (
            <article className="meet-card" key={tournament.id}>
              <a href={`/gamba/tournament/${tournament.id}`} onClick={go(`/gamba/tournament/${tournament.id}`)}>
                <span className="pill open">Tournament</span>
                <h3>{tournament.name}</h3>
              </a>
              <ul className="round-list">
                {tournament.rounds.map((round) => (
                  <li key={round.id}>
                    <span>{round.label}</span>
                    {owner && <a href={`/gamba/new?tournament=${encodeURIComponent(tournament.id)}&round=${encodeURIComponent(round.id)}`} onClick={go(`/gamba/new?tournament=${encodeURIComponent(tournament.id)}&round=${encodeURIComponent(round.id)}`)}>Add race</a>}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
      {owner && <section className="race-form">
        <h2>New tournament</h2>
        <p className="when">Save the rounds first. Then add a race to each round. Those races stay off the Races page.</p>
        <label>Name
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        {rounds.map((label, index) => (
          <label key={index}>Round {index + 1}
            <input value={label} onChange={(event) => setRounds((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} />
          </label>
        ))}
        <div className="form-actions">
          {rounds.length < 8 && <button type="button" className="quiet" onClick={() => setRounds((current) => [...current, ''])}>Add round</button>}
          {rounds.length > 1 && <button type="button" className="quiet" onClick={() => setRounds((current) => current.slice(0, -1))}>Remove round</button>}
          <button type="button" className="place" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save tournament'}</button>
        </div>
      </section>}
    </div>
  </div>
}

function pickKey(pick: Pick) {
  return `${pick.kind || 'match'}:${pick.slotId || ''}:${pick.eventId}:${pick.entryNumber}`
}

function sheetReady(round: TournamentDetail['rounds'][number], picks: Pick[]) {
  const slots = round.advanceSlots || []
  const matches = round.events.every((race) => picks.some((pick) => pick.kind !== 'advance' && pick.eventId === race.id))
  const advances = slots.every((slot) => picks.some((pick) => pick.kind === 'advance' && pick.slotId === slot.id))
  return round.events.length > 0 && matches && advances
}

function PickemSheet({ round, picks, setPicks, blocked }: {
  round: TournamentDetail['rounds'][number]
  picks: Pick[]
  setPicks: (next: Pick[] | ((current: Pick[]) => Pick[])) => void
  blocked: Map<string, string>
}) {
  const slots = round.advanceSlots || []
  return <div className="pick-sheet">
    <section className="pick-block">
      <h3>Matches</h3>
      {round.events.map((race) => (
        <RaceCard
          key={race.id}
          race={race}
          picks={picks.filter((pick) => pick.kind !== 'advance')}
          blockedReason={blocked.get(race.id) || ''}
          onToggle={(pick) => {
            if (blocked.get(race.id)) return
            setPicks((current) => {
              const rest = current.filter((item) => item.kind === 'advance' || item.eventId !== pick.eventId)
              const same = current.some((item) => item.kind !== 'advance' && item.eventId === pick.eventId && item.entryNumber === pick.entryNumber)
              return same ? rest : [...rest, { ...pick, kind: 'match' }]
            })
          }}
        />
      ))}
    </section>
    {slots.length > 0 && <section className="pick-block">
      <h3>Advances</h3>
      {slots.map((slot) => (
        <div className="pick-row" key={slot.id}>
          <strong>{slot.label}</strong>
          {slot.hint && <span className="pick-hint">{slot.hint}</span>}
          {round.events.filter((race) => slot.eventIds.includes(race.id)).map((race) => (
            <div key={race.id}>
              <span className="pick-hint">{race.name}</span>
              <div className="chip-pool">
                {race.entries.map((entry) => {
                  const on = picks.some((pick) => pick.kind === 'advance' && pick.slotId === slot.id && pick.eventId === race.id && pick.entryNumber === entry.number)
                  return <button
                    key={entry.number}
                    type="button"
                    className={on ? 'horse-chip on' : 'horse-chip'}
                    onClick={() => setPicks((current) => {
                      const rest = current.filter((item) => !(item.kind === 'advance' && item.slotId === slot.id))
                      if (on) return rest
                      return [...rest, {
                        kind: 'advance',
                        slotId: slot.id,
                        eventId: race.id,
                        eventName: slot.label,
                        entryNumber: entry.number,
                        entryName: entry.name,
                        odds: 0,
                      }]
                    })}
                  >
                    <span className="silk" style={{ background: silkColor(entry.number) }}>{entry.number}</span>
                    {entry.name}
                  </button>
                })}
              </div>
            </div>
          ))}
        </div>
      ))}
    </section>}
  </div>
}

function AdvanceConfirm({ tournamentId, round, onSaved }: {
  tournamentId: string
  round: TournamentDetail['rounds'][number]
  onSaved: (tournament: TournamentDetail) => void
}) {
  const slots = round.advanceSlots || []
  const filled = slots.length > 0 && slots.every((slot) => round.advanceResults?.[slot.id])
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  if (!slots.length || round.state !== 'settled') return null
  if (filled) {
    return <section className="pick-block">
      <h3>{round.label} advances</h3>
      {slots.map((slot) => {
        const result = round.advanceResults[slot.id]
        return <p key={slot.id}>{slot.label}: #{result?.entryNumber} {result?.entryName}</p>
      })}
    </section>
  }
  const ready = slots.every((slot) => choices[slot.id])
  return <section className="pick-block advance-confirm">
    <h3>Confirm {round.label} advances</h3>
    <p className="pick-hint">Pick the horse that actually filled each slot. This grades open pick&apos;em cards.</p>
    {slots.map((slot) => (
      <label key={slot.id}>{slot.label}
        <select value={choices[slot.id] || ''} onChange={(event) => setChoices((current) => ({ ...current, [slot.id]: event.target.value }))}>
          <option value="">Choose a horse</option>
          {round.events.filter((race) => slot.eventIds.includes(race.id)).map((race) => race.entries.map((entry) => (
            <option key={`${race.id}-${entry.number}`} value={`${race.id}:${entry.number}`}>#{entry.number} {entry.name} · {race.name}</option>
          )))}
        </select>
      </label>
    ))}
    {problem && <p className="problem">{problem}</p>}
    <button type="button" className="place" disabled={!ready || busy} onClick={() => {
      const results: Record<string, { eventId: string; entryNumber: number }> = {}
      for (const slot of slots) {
        const [eventId, number] = (choices[slot.id] || '').split(':')
        results[slot.id] = { eventId, entryNumber: Number(number) }
      }
      setBusy(true)
      setProblem('')
      gambaApi.confirmAdvances(tournamentId, { roundId: round.id, results })
        .then((payload) => onSaved(payload.tournament))
        .catch((reason) => setProblem(reason instanceof Error ? reason.message : 'Those advances were not saved.'))
        .finally(() => setBusy(false))
    }}>{busy ? 'Saving…' : 'Save advances'}</button>
  </section>
}

function TournamentPage({ tournamentId, me, reload, navigate }: {
  tournamentId: string
  me: Me
  reload: () => Promise<void>
  navigate: (to: string) => void
}) {
  const [tournament, setTournament] = useState<TournamentDetail | null>(null)
  const [mode, setMode] = useState<'single' | 'pickem'>('single')
  const [picks, setPicks] = useState<Pick[]>([])
  const [problem, setProblem] = useState('')
  useEffect(() => {
    setTournament(null)
    setPicks([])
    gambaApi.tournament(tournamentId)
      .then((payload) => setTournament(payload.tournament))
      .catch((reason) => setProblem(reason instanceof Error ? reason.message : 'That tournament is gone.'))
  }, [tournamentId])
  const rounds = tournament?.rounds || []
  const pickemRound = rounds.find((round) => round.events.length > 0 && round.events.every((race) => race.phase === 'open')) || null
  const blocked = blockedEvents(me)
  const pickemReady = Boolean(pickemRound && sheetReady(pickemRound, picks))
  const ready = mode === 'single' ? picks.length === 1 : pickemReady
  const slotTotal = pickemRound ? pickemRound.events.length + (pickemRound.advanceSlots || []).length : 0
  const perfect = pickemRound ? pickemRound.pickemPayouts[slotTotal] || 0 : 0
  const go = (href: string) => (event: { preventDefault: () => void }) => {
    event.preventDefault()
    navigate(href)
  }
  if (!tournament && !problem) return <p className="paddock-main">Loading the tournament.</p>
  return <div className="paddock-main with-slip">
    <div>
      <p><a href="/gamba" onClick={go('/gamba')}>Back to the board</a></p>
      {problem && <p className="problem">{problem}</p>}
      {tournament && <>
        <h1>{tournament.name}</h1>
        <div className="round-strip">
          {rounds.map((round) => (
            <article className={`round-chip ${round.state}`} key={round.id}>
              <span>{round.label}</span>
              <strong>{round.state === 'open' ? 'Pick now' : round.state === 'settled' ? 'Settled' : 'Waiting'}</strong>
            </article>
          ))}
        </div>
        <SlipTabs
          label="Bet mode"
          value={mode}
          onChange={(id) => { setMode(id as typeof mode); setPicks([]) }}
          tabs={[
            { id: 'single', label: 'Single' },
            { id: 'pickem', label: 'Pick\'em' },
          ]}
        />
        <p className="when">
          {mode === 'single' && 'One horse to win one match.'}
          {mode === 'pickem' && (pickemRound ? `Fill every line in ${pickemRound.label}. A miss can still pay.` : 'Pick\'em opens when every match in a round is open.')}
        </p>
        {mode === 'pickem' && pickemRound && <p className="when">Perfect card pays x{perfect}. Other scores use the round table, capped at x20.</p>}
        {mode === 'single' && rounds.map((round) => (
          <section className="stage" key={round.id}>
            <h2>{round.label}</h2>
            {round.events.map((race) => (
              <RaceCard
                key={race.id}
                race={race}
                picks={picks}
                blockedReason={blocked.get(race.id) || ''}
                onToggle={(pick) => {
                  if (blocked.get(race.id)) return
                  setPicks((current) => current.some((item) => item.eventId === pick.eventId && item.entryNumber === pick.entryNumber) ? [] : [pick])
                }}
              />
            ))}
          </section>
        ))}
        {mode === 'pickem' && pickemRound && (
          <PickemSheet round={pickemRound} picks={picks} setPicks={setPicks} blocked={blocked} />
        )}
        {me.owner && rounds.map((round) => (
          <AdvanceConfirm key={round.id} tournamentId={tournament.id} round={round} onSaved={setTournament} />
        ))}
      </>}
    </div>
    {tournament && <TicketSlip
      title={mode === 'single' ? 'Single' : 'Pick\'em'}
      picks={picks}
      hint={mode === 'pickem' ? 'Fill every match and every advance slot.' : 'Win only.'}
      ready={ready}
      payNote={mode === 'pickem' ? `A perfect card pays x${perfect}.` : ''}
      onRemove={(pick) => setPicks((current) => current.filter((item) => pickKey(item) !== pickKey(pick)))}
      onPlace={async (stake) => {
        if (mode === 'single') {
          const pick = picks[0]
          const result = await gambaApi.bet({ eventId: pick.eventId, entryNumber: pick.entryNumber, amount: stake })
          setPicks([])
          await reload()
          return result.carrots
        }
        const legs = picks.map((pick) => (
          pick.kind === 'advance'
            ? { kind: 'advance', slotId: pick.slotId, eventId: pick.eventId, entryNumber: pick.entryNumber }
            : { kind: 'match', eventId: pick.eventId, entryNumber: pick.entryNumber }
        ))
        const result = await gambaApi.tournamentPickem(tournament.id, { roundId: pickemRound?.id || '', stake, legs })
        setPicks([])
        await reload()
        return result.carrots
      }}
    />}
  </div>
}

function RaceCard({ race, picks, blockedReason, onToggle, titled = true }: {
  race: Race
  picks: Pick[]
  blockedReason: string
  onToggle: (pick: Pick) => void
  titled?: boolean
}) {
  return <article className="race">
    {titled && <h2>{race.name}</h2>}
    {titled && <p className="when">{raceNote(race)}</p>}
    {blockedReason && <p className="when">{blockedReason}</p>}
    {[...race.entries].sort((a, b) => a.number - b.number).map((entry) => {
      const selected = picks.some((pick) => pick.eventId === race.id && pick.entryNumber === entry.number)
      const open = race.phase === 'open' && !blockedReason
      const won = race.phase === 'settled' && race.winner === entry.number
      return <button
        key={entry.number}
        type="button"
        className={won ? 'runner winner' : 'runner'}
        disabled={!open}
        aria-pressed={selected}
        onClick={() => onToggle({
          eventId: race.id,
          eventName: race.name,
          entryNumber: entry.number,
          entryName: entry.name,
          odds: entry.odds,
        })}
      >
        <span className="silk" style={{ background: silkColor(entry.number) }}>{entry.number}</span>
        <span>
          <span className="name">{entry.name}{won && <span className="tag">Winner</span>}</span>
          {(entry.ageSex || entry.jockey) && <span className="meta">{[entry.ageSex, entry.jockey].filter(Boolean).join(' ')}</span>}
        </span>
        <span className="odds num">{oddsLabel(entry.odds)}</span>
      </button>
    })}
    {!race.entries.length && <p>That race is gone.</p>}
  </article>
}

function TicketSlip({ title, picks, hint, ready, onRemove, onPlace, payNote = '' }: {
  title: string
  picks: Pick[]
  hint: string
  ready: boolean
  onRemove: (pick: Pick) => void
  onPlace: (stake: number) => Promise<number>
  payNote?: string
}) {
  const [stakeText, setStakeText] = useState('100')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [stamp, setStamp] = useState(false)
  const [open, setOpen] = useState(false)
  const stake = Math.trunc(Number(stakeText))
  const pay = previewPay(stake, picks)
  const place = async () => {
    setError('')
    setBusy(true)
    try {
      await onPlace(stake)
      setStamp(true)
      window.setTimeout(() => setStamp(false), 1600)
      setOpen(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The ticket was not placed.')
    } finally {
      setBusy(false)
    }
  }
  const slip = <div className="ticket" aria-label={title}>
    {stamp && <p className="stamp">Placed</p>}
    <h2>{title}</h2>
    {picks.length === 0 && <p className="hint">{hint}</p>}
    {picks.length > 0 && <ol>
      {picks.map((pick) => (
        <li key={pickKey(pick)}>
          <span>{pick.kind === 'advance' ? pick.eventName : pick.eventName} · #{pick.entryNumber} {pick.entryName}</span>
          <button type="button" className="quiet" onClick={() => onRemove(pick)}>Remove</button>
        </li>
      ))}
    </ol>}
    {picks.length > 1 && <p className="hint">{hint}</p>}
    <label className="stake">Carrots on this ticket
      <input inputMode="numeric" value={stakeText} onChange={(event) => setStakeText(event.target.value.replace(/[^\d]/g, ''))} />
    </label>
    {payNote && <p className="payline">{payNote}</p>}
    {!payNote && picks.length > 0 && Number.isFinite(pay) && pay > 0 && <p className="payline"><Carrot size={18} /> Pays {coins.format(pay)} if they win</p>}
    {error && <p className="problem">{error}</p>}
    <button type="button" className="place" disabled={!ready || busy || stake < 10} onClick={() => void place()}>
      {busy ? 'Placing ticket…' : 'Place ticket'}
    </button>
    {open && <button type="button" className="quiet" onClick={() => setOpen(false)}>Close ticket</button>}
  </div>
  return <div className="slip-slot">
    {open && <button type="button" className="sheet-back" aria-label="Close ticket" onClick={() => setOpen(false)} />}
    <aside className={open ? 'ticket-dock open' : 'ticket-dock'}>{slip}</aside>
    <button type="button" className="ticket-tab" onClick={() => setOpen(true)}>
      <span>Ticket</span>
      <span>{picks.length} {picks.length === 1 ? 'horse' : 'horses'}</span>
    </button>
  </div>
}

function OpenSlips({ me, navigate }: { me: Me; navigate: (to: string) => void }) {
  const singles = useMemo(() => groupSingles(me.openTickets), [me.openTickets])
  const go = (href: string) => (event: { preventDefault: () => void }) => {
    event.preventDefault()
    navigate(href)
  }
  if (!singles.length && !me.openParlays.length) return null
  return <section>
    <h2>Your tickets</h2>
    <div className="mosaic">
      {singles.map((ticket) => (
        <a className="tile press" key={`${ticket.eventId}-${ticket.entryNumber}`} href={`/gamba/race/${ticket.eventId}`} onClick={go(`/gamba/race/${ticket.eventId}`)}>
          <header>{ticket.eventName}</header>
          <p>#{ticket.entryNumber} {ticket.entryName}</p>
          <p className="num"><Carrot size={16} /> {coins.format(ticket.amount)}</p>
          <p>Still running</p>
        </a>
      ))}
      {me.openParlays.map((parlay) => <ParlaySlip key={parlay.parlayId} parlay={parlay} />)}
    </div>
  </section>
}

function ParlaySlip({ parlay }: { parlay: Parlay }) {
  const title = parlay.chainName || `${parlay.legs.length}-pick ticket`
  const extra = parlay.legs.length - 2
  return <article className="tile">
    <header>{title}</header>
    {parlay.legs.slice(0, 2).map((leg) => <p key={leg.eventId}>#{leg.entryNumber} {leg.entryName}{leg.status === 'won' ? ' hit' : ''}</p>)}
    {extra > 0 && <p>+{extra} more</p>}
    <p className="num"><Carrot size={16} /> {coins.format(parlay.stake)}</p>
  </article>
}

function BoardPage({ me, navigate }: { me: Me; navigate: (to: string) => void }) {
  const [rows, setRows] = useState<BoardRow[]>([])
  const [problem, setProblem] = useState('')
  const [page, setPage] = useState(0)
  useEffect(() => {
    gambaApi.leaderboard().then((payload) => setRows(payload.rows)).catch((reason) => setProblem(reason instanceof Error ? reason.message : 'The board could not load.'))
  }, [])
  const go = (href: string) => (event: { preventDefault: () => void }) => {
    event.preventDefault()
    navigate(href)
  }
  const first = rows[0]
  const second = rows[1]
  const third = rows[2]
  const rest = rows.slice(3)
  const pageSize = 12
  const pages = Math.max(1, Math.ceil(rest.length / pageSize))
  const shown = rest.slice(page * pageSize, page * pageSize + pageSize)
  const tenth = rows.find((row) => row.rank === 10)
  const mine = (row: BoardRow) => row.discordId === me.discordId
  const chase = (row: BoardRow) => {
    if (!mine(row) || !tenth || row.rank <= 10) return ''
    const gap = tenth.carrots - row.carrots
    return gap > 0 ? `Chasing top 10 (+${coins.format(gap)})` : ''
  }
  return <div className="paddock-main">
    <div className="standings">
      <div>
        <p className="standings-kicker">Live standings</p>
        <h1>Paddock Board</h1>
        <p className="when">Trainers ranked by carrots.</p>
      </div>
      {problem && <p className="problem">{problem}</p>}
      {!rows.length && !problem && <p>Nobody has carrots yet.</p>}
      {(second || first || third) && <div className="podium-grid">
        {[second, first, third].filter((row): row is BoardRow => Boolean(row)).map((row) => (
          <a key={row.discordId} className={`podium-card place-${row.rank}${mine(row) ? ' mine' : ''}`} href={`/gamba/trainer/${row.discordId}`} onClick={go(`/gamba/trainer/${row.discordId}`)}>
            <span className="podium-rank">{row.rank === 1 ? '1st' : row.rank === 2 ? '2nd' : '3rd'}</span>
            <span className="podium-mark" style={{ background: markColor(row.discordId) }}>{markOf(row.name)}</span>
            <strong>{shownName(row.name)}</strong>
            {row.wins > 0 && row.losses === 0 && <span className="podium-tag">No misses</span>}
            <span className="podium-purse">{coins.format(row.carrots)} 🥕</span>
            <span className="podium-stats">
              <span><b>{row.wins}</b> hit</span>
              <span><b>{row.losses}</b> missed</span>
              <span><b>{rateLabel(row.wins, row.losses)}</b> win rate</span>
            </span>
          </a>
        ))}
      </div>}
      {rest.length > 0 && <div className="standings-table">
        <div className="standings-head">
          <span>Position</span>
          <span>Trainer</span>
          <span>Carrots</span>
          <span>Record</span>
          <span />
        </div>
        {shown.map((row) => (
          <a key={row.discordId} className={mine(row) ? 'standings-row mine' : 'standings-row'} href={`/gamba/trainer/${row.discordId}`} onClick={go(`/gamba/trainer/${row.discordId}`)}>
            <span className="standings-pos">{row.rank}</span>
            <span className="standings-who">
              <span className="podium-mark sm" style={{ background: markColor(row.discordId) }}>{markOf(row.name)}</span>
              <span>{shownName(row.name)}</span>
            </span>
            <span className="standings-carrots">{coins.format(row.carrots)} 🥕</span>
            <span className={chase(row) ? 'standings-record standings-note' : 'standings-record'}>{chase(row) || `${row.wins} hit · ${row.losses} missed`}</span>
            <span className="standings-go">{mine(row) ? 'Your card' : 'Profile'}</span>
          </a>
        ))}
        <div className="standings-pager">
          <span>Showing {page * pageSize + 1}–{page * pageSize + shown.length} of {rest.length}</span>
          <span className="standings-pages">
            <button type="button" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>Prev</button>
            <span>Page {page + 1} / {pages}</span>
            <button type="button" disabled={page + 1 >= pages} onClick={() => setPage((current) => current + 1)}>Next</button>
          </span>
        </div>
      </div>}
    </div>
  </div>
}

function rateLabel(wins: number, losses: number) {
  const rate = winRate(wins, losses)
  return rate == null ? '—' : `${rate}%`
}

function markOf(name: string) {
  const parts = shownName(name).split(/\s+/).filter(Boolean)
  const letters = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : (parts[0]?.slice(0, 1) || '?')
  return letters.toUpperCase()
}

function markColor(id: string) {
  const colors = ['#4edea3', '#ffb690', '#cbd5e1', '#f9a8d4', '#93c5fd', '#fde68a']
  let total = 0
  for (const char of id) total += char.charCodeAt(0)
  return colors[total % colors.length]
}

function TrainerPage({ discordId, navigate }: { discordId: string; navigate: (to: string) => void }) {
  const [trainer, setTrainer] = useState<Trainer | null>(null)
  const [problem, setProblem] = useState('')
  const [filter, setFilter] = useState<'all' | 'running' | 'settled'>('all')
  const [more, setMore] = useState(false)
  useEffect(() => {
    setTrainer(null)
    setFilter('all')
    setMore(false)
    gambaApi.trainer(discordId).then(setTrainer).catch((reason) => setProblem(reason instanceof Error ? reason.message : 'That trainer has no carrots yet.'))
  }, [discordId])
  const go = (href: string) => (event: { preventDefault: () => void }) => {
    event.preventDefault()
    navigate(href)
  }
  if (!trainer && !problem) return <p className="paddock-main">Loading this trainer.</p>
  const singles = trainer ? groupSingles(trainer.openTickets) : []
  const parlays = trainer?.openParlays || []
  const pickems = trainer?.openPickems || []
  const settled = trainer ? groupHistory(trainer.history) : []
  const showRunning = filter === 'all' || filter === 'running'
  const shownSettled = settled
  const showSettled = filter === 'all' || filter === 'settled'
  const visibleSettled = more ? shownSettled : shownSettled.slice(0, 6)
  const hidden = shownSettled.length - visibleSettled.length
  const rate = trainer ? winRate(trainer.wins, trainer.losses) : null
  const net = trainer ? trainer.history.reduce((sum, row) => sum + row.payout - row.amount, 0) : 0
  const peak = trainer ? maxOdds(trainer) : null
  const name = trainer ? shownName(trainer.name) : ''
  return <div className="paddock-main">
    <div className="slipbook">
      {problem && <p className="problem">{problem}</p>}
      {trainer && <>
        <section className="vault">
          <div className="vault-id">
            <span className="vault-mark" aria-hidden="true">{name.slice(0, 1)}</span>
            <div>
              <h1>{name}</h1>
              <div className="vault-pills">
                <span className="vault-hit">{trainer.wins} hit</span>
                <span className="vault-miss">{trainer.losses} missed</span>
                {rate != null && <span>{rate}% win rate</span>}
                {peak != null && <span>Max {markOdds(peak)}</span>}
              </div>
            </div>
          </div>
          <div className="vault-balance">
            <div>
              <span>Carrot balance</span>
              <strong>{coins.format(trainer.carrots)} 🥕</strong>
            </div>
            <div>
              <span>Net return</span>
              <strong className={net > 0 ? 'up' : net < 0 ? 'down' : ''}>{net > 0 ? '+' : ''}{coins.format(net)} 🥕</strong>
            </div>
          </div>
        </section>
        <SlipTabs
          label="Tickets"
          value={filter}
          onChange={(id) => { setFilter(id as typeof filter); setMore(false) }}
          tabs={[
            { id: 'all', label: 'All slips', count: singles.length + parlays.length + pickems.length + settled.length },
            { id: 'running', label: 'In play', count: singles.length + parlays.length + pickems.length },
            { id: 'settled', label: 'Settled slips', count: settled.length },
          ]}
        />
        {showRunning && (singles.length + parlays.length + pickems.length) > 0 && <section className="slip-block">
          <h2>Active ticket</h2>
          {singles.map((ticket) => (
            <a key={`${ticket.eventId}-${ticket.entryNumber}`} className="live-slip" href={`/gamba/race/${ticket.eventId}`} onClick={go(`/gamba/race/${ticket.eventId}`)}>
              <span className="gate-num" style={{ background: silkColor(ticket.entryNumber) }}>
                <span>Gate</span>{ticket.entryNumber}
              </span>
              <span className="live-copy">
                <span>Single win</span>
                <strong>{ticket.eventName}</strong>
                <span>#{ticket.entryNumber} {ticket.entryName}</span>
              </span>
              <span className="live-math">
                <span><span>Staked</span><strong>{coins.format(ticket.amount)} 🥕</strong></span>
                <span><span>Multiplier</span><strong>{markOdds(ticket.oddsAtBet)}</strong></span>
                <span><span>Potential payout</span><strong>{coins.format(Math.floor(ticket.amount * ticket.oddsAtBet))} 🥕</strong></span>
              </span>
            </a>
          ))}
          {pickems.map((card) => (
            <article className="live-slip parlay" key={card.pickemId}>
              <span className="gate-num chain"><span>Picks</span>{card.legs.length}</span>
              <span className="live-copy">
                <span>Pick&apos;em</span>
                <strong>{card.tournamentName || 'Tournament'} · {card.roundLabel}</strong>
                <span>{card.legs.map((leg) => `#${leg.entryNumber} ${leg.entryName}`).join(' · ')}</span>
              </span>
              <span className="live-math">
                <span><span>Staked</span><strong>{coins.format(card.stake)} 🥕</strong></span>
                <span><span>Perfect card</span><strong>{coins.format(card.payoutIfPerfect)} 🥕</strong></span>
              </span>
            </article>
          ))}
          {parlays.map((parlay) => (
            <article className="live-slip parlay" key={parlay.parlayId}>
              <span className="gate-num chain"><span>Legs</span>{parlay.legs.length}</span>
              <span className="live-copy">
                <span>{parlay.chainName || 'Chained parlay'}</span>
                <strong>{parlay.chainName || `${parlay.legs.length}-pick ticket`}</strong>
                <span>{parlay.legs.map((leg) => `#${leg.entryNumber} ${leg.entryName}`).join(' · ')}</span>
              </span>
              <span className="live-math">
                <span><span>Staked</span><strong>{coins.format(parlay.stake)} 🥕</strong></span>
                <span><span>Multiplier</span><strong>{markOdds(parlay.combinedOdds)}</strong></span>
                <span><span>Potential payout</span><strong>{coins.format(parlay.payoutIfHit)} 🥕</strong></span>
              </span>
            </article>
          ))}
        </section>}
        {showRunning && !singles.length && !parlays.length && !pickems.length && <p className="empty">No tickets are still running.</p>}
        {showSettled && <section className="slip-block">
          <h2>Settled betting slips</h2>
          {!shownSettled.length && <p className="empty">No settled slips yet.</p>}
          <div className="slip-grid">
            {visibleSettled.map((row) => <SettledSlip key={`${row.kind}-${row.eventId}-${row.entryNumber}-${row.result}`} row={row} navigate={navigate} />)}
          </div>
          {hidden > 0 && <button type="button" className="slip-more" onClick={() => setMore(true)}>Load {hidden} archived slips</button>}
          {more && shownSettled.length > 6 && <button type="button" className="slip-more" onClick={() => setMore(false)}>Show fewer</button>}
        </section>}
      </>}
    </div>
  </div>
}

function SettledSlip({ row, navigate }: { row: HistoryRow & { count?: number }; navigate: (to: string) => void }) {
  const hit = row.result === 'win'
  const parlay = row.kind === 'parlay'
  const stacked = parlay || row.kind === 'pickem'
  const mega = hit && parlay && (row.oddsAtBet || 0) >= 10
  const href = !stacked && row.eventId && !row.eventId.startsWith('parlay:') && !row.eventId.startsWith('pickem:')
    ? `/gamba/race/${encodeURIComponent(row.eventId)}`
    : ''
  const body = <>
    <span className={mega ? 'slip-stamp mega' : hit ? 'slip-stamp hit' : 'slip-stamp miss'}>{mega ? 'Mega hit' : hit ? 'Hit' : 'Missed'}</span>
    <span className="slip-kicker">{row.kind === 'pickem' ? 'Pick\'em' : parlay ? `${row.legs?.length || 0}-leg chained parlay` : 'Single win'}{(row.count || 0) > 1 ? ` · ${row.count} tickets` : ''}</span>
    <strong>{row.eventName}</strong>
    {stacked && row.legs?.length
      ? <ul>{row.legs.map((leg) => <li key={leg.eventId}>#{leg.entryNumber} {leg.entryName}{leg.status === 'won' ? ' hit' : ''}</li>)}</ul>
      : <span className="slip-runner">
        {row.entryNumber != null && <span className="gate-mini" style={{ background: silkColor(row.entryNumber) }}>{row.entryNumber}</span>}
        <span>{row.entryNumber != null ? `#${row.entryNumber} ${row.entryName}` : row.entryName}</span>
        {row.oddsAtBet != null && <span className="odds-pill mint">{markOdds(row.oddsAtBet)}</span>}
      </span>}
    <span className="slip-cut" />
    <span className="slip-pay">
      <span><span>Staked{row.oddsAtBet != null && parlay ? ` · ${markOdds(row.oddsAtBet)}` : ''}</span><strong>{coins.format(row.amount)} 🥕</strong></span>
      <span><span>{hit ? 'Payout credited' : 'Loss'}</span><strong className={hit ? 'up' : 'down'}>{hit ? `+${coins.format(row.payout)}` : `−${coins.format(row.amount)}`} 🥕</strong></span>
    </span>
  </>
  if (!href) return <article className={hit ? 'slip-card hit' : 'slip-card miss'}>{body}</article>
  return <a className={hit ? 'slip-card hit' : 'slip-card miss'} href={href} onClick={(event) => { event.preventDefault(); navigate(href) }}>{body}</a>
}

function winRate(wins: number, losses: number) {
  const total = wins + losses
  if (!total) return null
  return Math.round((wins / total) * 100)
}

function maxOdds(trainer: Trainer) {
  const values = [
    ...trainer.history.map((row) => row.oddsAtBet),
    ...trainer.openTickets.map((ticket) => ticket.oddsAtBet),
    ...trainer.openParlays.map((parlay) => parlay.combinedOdds),
  ].filter((value): value is number => value != null && Number.isFinite(value))
  return values.length ? Math.max(...values) : null
}

function blockedEvents(me: Me) {
  const reasons = new Map<string, string>()
  for (const ticket of me.openTickets) reasons.set(ticket.eventId, 'Already on a single ticket')
  for (const parlay of me.openParlays) {
    for (const leg of parlay.legs) {
      if (leg.status === 'skipped') continue
      reasons.set(leg.eventId, 'Already on another ticket')
    }
  }
  for (const card of me.openPickems || []) {
    for (const leg of card.legs) {
      if (leg.kind === 'advance') continue
      if (leg.status && leg.status !== 'open') continue
      reasons.set(leg.eventId, 'Already on a pick\'em card')
    }
  }
  return reasons
}

function groupSingles(tickets: OpenTicket[]) {
  const groups = new Map<string, OpenTicket>()
  for (const ticket of tickets) {
    const key = `${ticket.eventId}:${ticket.entryNumber}`
    const current = groups.get(key)
    if (!current) groups.set(key, { ...ticket })
    else current.amount += ticket.amount
  }
  return [...groups.values()]
}

function groupHistory(rows: HistoryRow[]) {
  const groups = new Map<string, HistoryRow & { count: number }>()
  for (const row of rows) {
    const key = [row.kind, row.eventId || row.eventName, row.entryNumber ?? row.entryName, row.result].join('|')
    const current = groups.get(key)
    if (!current) groups.set(key, { ...row, count: 1 })
    else {
      current.amount += row.amount
      current.payout += row.payout
      current.count += 1
      if (current.oddsAtBet !== row.oddsAtBet) current.oddsAtBet = null
    }
  }
  return [...groups.values()]
}
