import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  coins,
  gambaApi,
  GambaError,
  oddsLabel,
  silkColor,
  type ChainDetail,
  type ChainSummary,
  type HistoryRow,
  type Me,
  type OpenTicket,
  type Parlay,
  type Race,
  type Trainer,
} from './api'
import { NewRace } from './NewRace'
import './gamba.css'

type Pick = {
  eventId: string
  eventName: string
  entryNumber: number
  entryName: string
  odds: number
  stageId?: string
}

const loginHref = `/api/auth/login?returnTo=${encodeURIComponent('/gamba')}`

function Carrot({ size = 22 }: { size?: number }) {
  return <img className="carrot" src="/carrot.png" alt="" width={size} height={size} style={{ width: size, height: size }} />
}

function Crown({ rank }: { rank: number }) {
  const color = rank === 1 ? '#1e3354' : rank === 2 ? '#7f9bb4' : '#b42355'
  const size = rank === 1 ? 68 : 52
  return <svg className="crown" width={size} height={size} viewBox="0 0 64 56" aria-hidden="true">
    <path fill={color} d="M6 40 L16 18 L26 32 L32 10 L38 32 L48 18 L58 40 Z" />
    <circle cx="16" cy="16" r="3.2" fill={color} />
    <circle cx="32" cy="8" r="3.6" fill={color} />
    <circle cx="48" cy="16" r="3.2" fill={color} />
    <path fill={color} d="M6 38 h52 v8 a4 4 0 0 1 -4 4 H10 a4 4 0 0 1 -4 -4 z" />
    <circle cx="20" cy="44" r="2.3" fill="#f7fbfe" />
    <circle cx="32" cy="44" r="2.3" fill="#f7fbfe" />
    <circle cx="44" cy="44" r="2.3" fill="#f7fbfe" />
  </svg>
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

  useEffect(() => {
    document.title = 'Tazuna Paddock'
    const root = document.documentElement
    const previous = root.style.background
    root.style.background = '#d7eef8'
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
    if (picks.length === 1) {
      const pick = picks[0]
      const result = await gambaApi.bet({ eventId: pick.eventId, entryNumber: pick.entryNumber, amount: stake })
      setPicks([])
      await reload()
      return result.carrots
    }
    const result = await gambaApi.parlay({
      stake,
      legs: picks.map((pick) => ({ eventId: pick.eventId, entryNumber: pick.entryNumber })),
    })
    setPicks([])
    await reload()
    return result.carrots
  }

  let body: ReactNode = <CardPage me={me} picks={picks} setPicks={setPicks} onPlace={placePicks} navigate={navigate} />
  if (clean === '/gamba/board') body = <BoardPage navigate={navigate} />
  else if (clean.startsWith('/gamba/trainer/')) body = <TrainerPage discordId={decodeURIComponent(clean.slice('/gamba/trainer/'.length))} navigate={navigate} />
  else if (clean === '/gamba/new') body = <NewRace owner={Boolean(me.owner)} navigate={navigate} />
  else if (clean.startsWith('/gamba/meet/')) body = <MeetPage chainId={decodeURIComponent(clean.slice('/gamba/meet/'.length))} me={me} reload={reload} />
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
      <a className="brand" href="/gamba" onClick={go('/gamba')}><Carrot size={28} /> Tazuna Paddock</a>
      <nav className="links" aria-label="Paddock">
        <a href="/gamba" aria-current={clean === '/gamba' ? 'page' : undefined} onClick={go('/gamba')}>Card</a>
        <a href="/gamba/board" aria-current={clean === '/gamba/board' ? 'page' : undefined} onClick={go('/gamba/board')}>Board</a>
        {me.owner && <a href="/gamba/new" aria-current={clean === '/gamba/new' ? 'page' : undefined} onClick={go('/gamba/new')}>New race</a>}
      </nav>
      <p className="who">
        <span className="purse"><Carrot /> Your carrots <strong className="num">{coins.format(me.carrots)}</strong></span>
        <a href={`/gamba/trainer/${me.discordId}`} onClick={go(`/gamba/trainer/${me.discordId}`)}>{shownName(me.name)}</a>
        <button type="button" className="quiet" onClick={() => { void gambaApi.logout().then(() => window.location.assign('/gamba')) }}>Log out</button>
      </p>
    </header>
    {body}
  </div>
}

function CardPage({ me, picks, setPicks, onPlace, navigate }: {
  me: Me
  picks: Pick[]
  setPicks: (next: Pick[]) => void
  onPlace: (stake: number) => Promise<number>
  navigate: (to: string) => void
}) {
  const [events, setEvents] = useState<Race[]>([])
  const [chains, setChains] = useState<ChainSummary[]>([])
  const [problem, setProblem] = useState('')
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    gambaApi.events()
      .then((payload) => setEvents(payload.events))
      .catch((reason) => setProblem(reason instanceof Error ? reason.message : 'The card could not load.'))
      .finally(() => setLoaded(true))
    gambaApi.chains().then((payload) => setChains(payload.chains)).catch(() => setChains([]))
  }, [])
  const go = (href: string) => (event: { preventDefault: () => void }) => {
    event.preventDefault()
    navigate(href)
  }
  const groups: Array<{ title: string; phase: Race['phase'] }> = [
    { title: 'Open', phase: 'open' },
    { title: 'Expired', phase: 'closed' },
    { title: 'Soon', phase: 'scheduled' },
    { title: 'Settled', phase: 'settled' },
  ]
  return <div className={picks.length ? 'paddock-main' : 'paddock-main solo'}>
    <div>
      {problem && <p className="problem">{problem}</p>}
      {loaded && !events.some((race) => race.phase === 'open') && !problem && (
        <p>No races are open. Check back when Tazuna posts a card.</p>
      )}
      {groups.map((group) => {
        const rows = events.filter((race) => race.phase === group.phase)
        if (!rows.length) return null
        return <section className="catalog-section" key={group.phase}>
          <h2>{group.title}</h2>
          <div className="catalog">
            {rows.map((race) => (
              <a key={race.id} className={`poster press ${race.phase}`} href={`/gamba/race/${race.id}`} onClick={go(`/gamba/race/${race.id}`)}>
                <span className={`status ${race.phase}`}>{statusLabel(race.phase)}</span>
                <span>
                  <strong>{race.name}</strong>
                  <span className="when">{raceNote(race)}</span>
                </span>
                <span className="meta">{race.entries.length === 1 ? '1 horse' : `${race.entries.length} horses`}</span>
              </a>
            ))}
          </div>
        </section>
      })}
      {chains.length > 0 && <section className="catalog-section">
        <h2>Meets</h2>
        <div className="catalog">
          {chains.map((chain) => (
            <a key={chain.id} className="poster press meet" href={`/gamba/meet/${chain.id}`} onClick={go(`/gamba/meet/${chain.id}`)}>
              <span className="status open">Meet</span>
              <span>
                <strong>{chain.name}</strong>
                <span className="when">One horse from each stage</span>
              </span>
              <span className="meta">{chain.stages.length} stages</span>
            </a>
          ))}
        </div>
      </section>}
      <OpenSlips me={me} navigate={navigate} />
    </div>
    {picks.length > 0 && <TicketSlip
      title="Your ticket"
      picks={picks}
      hint={picks.length > 1 ? 'Every pick has to hit.' : 'Open another race to add a parlay.'}
      ready
      onRemove={(eventId) => setPicks(picks.filter((pick) => pick.eventId !== eventId))}
      onPlace={onPlace}
    />}
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
  if (!race && !problem) return <p className="paddock-main solo">Loading this race.</p>
  return <div className={showTicket ? 'paddock-main' : 'paddock-main solo'}>
    <div>
      <p><a href="/gamba" onClick={go('/gamba')}>All races</a></p>
      {problem && <p className="problem">{problem}</p>}
      {race && <>
        <div className="race-head">
          <span className={`status ${race.phase}`}>{statusLabel(race.phase)}</span>
          <h1>{race.name}</h1>
          <p className="when">{raceNote(race)}</p>
        </div>
        <RaceCard
          race={race}
          picks={picks}
          titled={false}
          blockedReason={blocked}
          onToggle={(pick) => setPicks(togglePick(picks, pick))}
        />
        {race.phase === 'settled' && <Results race={race} />}
      </>}
    </div>
    {showTicket && <TicketSlip
      title="Your ticket"
      picks={picks}
      hint={picks.length > 1 ? 'Every pick has to hit.' : 'Add a horse. Open another race to build a parlay.'}
      ready={picks.length > 0}
      onRemove={(id) => setPicks(picks.filter((pick) => pick.eventId !== id))}
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

function MeetPage({ chainId, me, reload }: { chainId: string; me: Me; reload: () => Promise<void> }) {
  const [chain, setChain] = useState<ChainDetail | null>(null)
  const [picks, setPicks] = useState<Pick[]>([])
  const [problem, setProblem] = useState('')
  useEffect(() => {
    gambaApi.chain(chainId).then((payload) => setChain(payload.chain)).catch((reason) => setProblem(reason instanceof Error ? reason.message : 'That meet is gone.'))
  }, [chainId])
  const blocked = blockedEvents(me)
  const ready = Boolean(chain && chain.stages.every((stage) => picks.some((pick) => pick.stageId === stage.id)))
  if (!chain && !problem) return <p className="paddock-main solo">Loading the meet.</p>
  return <div className="paddock-main">
    <div>
      {problem && <p className="problem">{problem}</p>}
      {chain && <>
        <h1>{chain.name}</h1>
        <p>One horse from one race in each stage. Every pick has to hit.</p>
        <div className="stages">
          {chain.stages.map((stage) => (
            <section className="stage" key={stage.id}>
              <h2>{stage.label}</h2>
              {stage.events.map((race) => (
                <RaceCard
                  key={race.id}
                  race={race}
                  picks={picks}
                  blockedReason={blocked.get(race.id) || ''}
                  onToggle={(pick) => setPicks((current) => togglePick(current.filter((item) => item.stageId !== stage.id), { ...pick, stageId: stage.id }))}
                />
              ))}
            </section>
          ))}
        </div>
      </>}
    </div>
    {chain && <TicketSlip
      title={chain.name}
      picks={chain.stages.map((stage) => picks.find((pick) => pick.stageId === stage.id)).filter((pick): pick is Pick => Boolean(pick))}
      hint="Every pick has to hit."
      ready={ready}
      onRemove={(eventId) => setPicks((current) => current.filter((pick) => pick.eventId !== eventId))}
      onPlace={async (stake) => {
        const ordered = chain.stages.map((stage) => picks.find((pick) => pick.stageId === stage.id)).filter((pick): pick is Pick => Boolean(pick))
        const result = await gambaApi.parlay({
          stake,
          chainId: chain.id,
          legs: ordered.map((pick) => ({ eventId: pick.eventId, entryNumber: pick.entryNumber })),
        })
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
    {race.entries.map((entry) => {
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

function TicketSlip({ title, picks, hint, ready, onRemove, onPlace }: {
  title: string
  picks: Pick[]
  hint: string
  ready: boolean
  onRemove: (eventId: string) => void
  onPlace: (stake: number) => Promise<number>
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
        <li key={pick.eventId}>
          <span>#{pick.entryNumber} {pick.entryName}</span>
          <button type="button" className="quiet" onClick={() => onRemove(pick.eventId)}>Remove</button>
        </li>
      ))}
    </ol>}
    {picks.length > 1 && <p className="hint">{hint}</p>}
    <label className="stake">Carrots on this ticket
      <input inputMode="numeric" value={stakeText} onChange={(event) => setStakeText(event.target.value.replace(/[^\d]/g, ''))} />
    </label>
    {picks.length > 0 && Number.isFinite(pay) && pay > 0 && <p className="payline"><Carrot size={18} /> Pays {coins.format(pay)} if they win</p>}
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

function BoardPage({ navigate }: { navigate: (to: string) => void }) {
  const [rows, setRows] = useState<Array<{ rank: number; discordId: string; name: string; carrots: number; wins: number; losses: number }>>([])
  const [problem, setProblem] = useState('')
  useEffect(() => {
    gambaApi.leaderboard().then((payload) => setRows(payload.rows)).catch((reason) => setProblem(reason instanceof Error ? reason.message : 'The board could not load.'))
  }, [])
  const go = (href: string) => (event: { preventDefault: () => void }) => {
    event.preventDefault()
    navigate(href)
  }
  const top = rows.slice(0, 3)
  const order = [top[1], top[0], top[2]].filter(Boolean)
  return <div className="paddock-main solo">
    <div>
      <h1>Most carrots</h1>
      {problem && <p className="problem">{problem}</p>}
      {!rows.length && !problem && <p>Nobody has carrots yet.</p>}
      {order.length > 0 && <div className="podium">
        {order.map((row) => (
          <a key={row.discordId} className={row.rank === 1 ? 'rosette first press' : 'rosette press'} href={`/gamba/trainer/${row.discordId}`} onClick={go(`/gamba/trainer/${row.discordId}`)}>
            <Crown rank={row.rank} />
            <span className="place-num">{row.rank}</span>
            <strong>{shownName(row.name)}</strong>
            <span className="record">{row.wins} hit · {row.losses} missed</span>
            <span className="purse num"><Carrot size={18} /> {coins.format(row.carrots)}</span>
          </a>
        ))}
      </div>}
      <ul className="board">
        {rows.slice(3).map((row) => (
          <li key={row.discordId}>
            <a className="press" href={`/gamba/trainer/${row.discordId}`} onClick={go(`/gamba/trainer/${row.discordId}`)}>
              <strong><span className="place-num">{row.rank}</span> {shownName(row.name)}</strong>
              <span className="num"><Carrot size={16} /> {coins.format(row.carrots)}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  </div>
}

function TrainerPage({ discordId, navigate }: { discordId: string; navigate: (to: string) => void }) {
  const [trainer, setTrainer] = useState<Trainer | null>(null)
  const [problem, setProblem] = useState('')
  useEffect(() => {
    setTrainer(null)
    gambaApi.trainer(discordId).then(setTrainer).catch((reason) => setProblem(reason instanceof Error ? reason.message : 'That trainer has no carrots yet.'))
  }, [discordId])
  const go = (href: string) => (event: { preventDefault: () => void }) => {
    event.preventDefault()
    navigate(href)
  }
  if (!trainer && !problem) return <p className="paddock-main solo">Loading this trainer.</p>
  return <div className="paddock-main solo">
    <div>
      <p><a href="/gamba/board" onClick={go('/gamba/board')}>Back to the board</a></p>
      {problem && <p className="problem">{problem}</p>}
      {trainer && <>
        <section className="hero">
          <h1>{shownName(trainer.name)}</h1>
          <p className="purse giant"><Carrot size={64} /> <strong className="num">{coins.format(trainer.carrots)}</strong></p>
          <p className="record">
            <span className="chip hit">{trainer.wins} hit</span>
            <span className="chip miss">{trainer.losses} missed</span>
            {trainer.record && <span className="chip">{trainer.record}</span>}
          </p>
        </section>
        {(trainer.openTickets.length > 0 || trainer.openParlays.length > 0) && <>
          <h2>Still running</h2>
          <div className="mosaic">
            {groupSingles(trainer.openTickets).map((ticket) => (
              <a className="tile press" key={`${ticket.eventId}-${ticket.entryNumber}`} href={`/gamba/race/${ticket.eventId}`} onClick={go(`/gamba/race/${ticket.eventId}`)}>
                <header>{ticket.eventName}</header>
                <p>#{ticket.entryNumber} {ticket.entryName}</p>
                <p className="num"><Carrot size={16} /> {coins.format(ticket.amount)}</p>
              </a>
            ))}
            {trainer.openParlays.map((parlay) => <ParlaySlip key={parlay.parlayId} parlay={parlay} />)}
          </div>
        </>}
        <SettledMosaic rows={trainer.history} navigate={navigate} />
      </>}
    </div>
  </div>
}

function SettledMosaic({ rows, navigate }: { rows: HistoryRow[]; navigate: (to: string) => void }) {
  const cards = groupHistory(rows)
  const [more, setMore] = useState(false)
  const shown = more ? cards : cards.slice(0, 8)
  const hidden = cards.length - shown.length
  if (!rows.length) return <><h2>Settled tickets</h2><p>No settled bets yet.</p></>
  return <>
    <h2>Settled tickets</h2>
    <p className="when">{cards.length === rows.length ? `${cards.length} tickets` : `${cards.length} tickets from ${rows.length} bets`}</p>
    <div className="mosaic">
      {shown.map((row) => <HistorySlip key={`${row.eventId}-${row.entryNumber}-${row.result}-${row.eventName}`} row={row} navigate={navigate} />)}
    </div>
    {hidden > 0 && <button type="button" className="quiet" onClick={() => setMore(true)}>Show {hidden} more</button>}
    {more && cards.length > 8 && <button type="button" className="quiet" onClick={() => setMore(false)}>Show fewer</button>}
  </>
}

function HistorySlip({ row, navigate }: { row: HistoryRow & { count?: number }; navigate: (to: string) => void }) {
  const hit = row.result === 'win'
  const detail = row.kind === 'parlay' || row.entryNumber == null
    ? row.entryName
    : `#${row.entryNumber} ${row.entryName}`
  const odds = row.oddsAtBet != null ? ` ${oddsLabel(row.oddsAtBet)}` : ''
  const href = row.kind !== 'parlay' && row.eventId && !row.eventId.startsWith('parlay:')
    ? `/gamba/race/${encodeURIComponent(row.eventId)}`
    : ''
  const body = <>
    <header>{row.eventName}</header>
    <p>{detail}{odds}</p>
    {(row.count || 0) > 1 && <p>{row.count} tickets</p>}
    <p className="result"><Carrot size={16} /> {hit ? `Hit +${coins.format(row.payout)}` : `Missed −${coins.format(row.amount)}`}</p>
  </>
  if (!href) return <article className={hit ? 'tile hit' : 'tile miss'}>{body}</article>
  return <a className={hit ? 'tile hit press' : 'tile miss press'} href={href} onClick={(event) => { event.preventDefault(); navigate(href) }}>{body}</a>
}

function togglePick(current: Pick[], pick: Pick) {
  const same = current.find((item) => item.eventId === pick.eventId && item.entryNumber === pick.entryNumber)
  if (same) return current.filter((item) => item !== same)
  return [...current.filter((item) => item.eventId !== pick.eventId), pick]
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
