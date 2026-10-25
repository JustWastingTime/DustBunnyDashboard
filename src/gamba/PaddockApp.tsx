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

function when(iso: string | null) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function raceNote(race: Race) {
  if (race.phase === 'open') return when(race.endsAt) ? `Closes ${when(race.endsAt)}` : 'Still open'
  if (race.phase === 'scheduled') return when(race.startsAt) ? `Opens ${when(race.startsAt)}` : 'Not open yet'
  if (race.phase === 'closed') return 'Waiting for the result'
  if (race.winnerName) return `Winner: #${race.winner} ${race.winnerName}`
  return 'Finished'
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

  let body: ReactNode = <CardPage me={me} reload={reload} navigate={navigate} />
  if (clean === '/gamba/board') body = <BoardPage navigate={navigate} />
  else if (clean.startsWith('/gamba/trainer/')) body = <TrainerPage discordId={decodeURIComponent(clean.slice('/gamba/trainer/'.length))} navigate={navigate} />
  else if (clean.startsWith('/gamba/meet/')) body = <MeetPage chainId={decodeURIComponent(clean.slice('/gamba/meet/'.length))} me={me} reload={reload} />

  return <div className="paddock">
    <header className="top">
      <a className="brand" href="/gamba" onClick={go('/gamba')}>Tazuna Paddock</a>
      <nav className="links" aria-label="Paddock">
        <a href="/gamba" aria-current={clean === '/gamba' ? 'page' : undefined} onClick={go('/gamba')}>Card</a>
        <a href="/gamba/board" aria-current={clean === '/gamba/board' ? 'page' : undefined} onClick={go('/gamba/board')}>Board</a>
      </nav>
      <p className="who">
        <span className="purse"><span className="coin" aria-hidden="true"></span> Your carrots <strong>{coins.format(me.carrots)}</strong></span>
        <a href={`/gamba/trainer/${me.discordId}`} onClick={go(`/gamba/trainer/${me.discordId}`)}>{me.name}</a>
        <button type="button" className="quiet" onClick={() => { void gambaApi.logout().then(() => window.location.assign('/gamba')) }}>Log out</button>
      </p>
    </header>
    {body}
  </div>
}

function CardPage({ me, reload, navigate }: { me: Me; reload: () => Promise<void>; navigate: (to: string) => void }) {
  const [events, setEvents] = useState<Race[]>([])
  const [chains, setChains] = useState<ChainSummary[]>([])
  const [picks, setPicks] = useState<Pick[]>([])
  const [problem, setProblem] = useState('')
  useEffect(() => {
    gambaApi.events().then((payload) => setEvents(payload.events)).catch((reason) => setProblem(reason instanceof Error ? reason.message : 'The card could not load.'))
    gambaApi.chains().then((payload) => setChains(payload.chains)).catch(() => setChains([]))
  }, [])
  const blocked = blockedEvents(me)
  const go = (href: string) => (event: { preventDefault: () => void }) => {
    event.preventDefault()
    navigate(href)
  }
  return <div className="paddock-main">
    <div>
      {problem && <p className="problem">{problem}</p>}
      {chains.length > 0 && <section>
        <h2>Meets</h2>
        <ul className="meets">
          {chains.map((chain) => <li key={chain.id}><a href={`/gamba/meet/${chain.id}`} onClick={go(`/gamba/meet/${chain.id}`)}>Ride {chain.name}</a></li>)}
        </ul>
      </section>}
      <OpenSlips me={me} />
      {events.length === 0 && !problem && <p>No races are open. Check back when Tazuna posts a card.</p>}
      {events.map((race) => (
        <RaceCard
          key={race.id}
          race={race}
          picks={picks}
          blockedReason={blocked.get(race.id) || ''}
          onToggle={(pick) => setPicks((current) => togglePick(current, pick))}
        />
      ))}
    </div>
    <TicketSlip
      title="Your ticket"
      picks={picks}
      hint={picks.length > 1 ? 'Every pick has to hit.' : 'Add a horse from the card.'}
      ready={picks.length > 0}
      onRemove={(eventId) => setPicks((current) => current.filter((pick) => pick.eventId !== eventId))}
      onPlace={async (stake) => {
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
      }}
    />
  </div>
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

function RaceCard({ race, picks, blockedReason, onToggle }: {
  race: Race
  picks: Pick[]
  blockedReason: string
  onToggle: (pick: Pick) => void
}) {
  return <article className="race">
    <h2>{race.name}</h2>
    <p className="when">{raceNote(race)}</p>
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
          <span className="name">{entry.name}</span>
          {(entry.ageSex || entry.jockey) && <span className="meta">{[entry.ageSex, entry.jockey].filter(Boolean).join(' ')}</span>}
          {blockedReason && <span className="meta">{blockedReason}</span>}
        </span>
        <span className="odds">{won ? <span className="tag">Winner</span> : oddsLabel(entry.odds)}</span>
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
    {picks.length > 0 && Number.isFinite(pay) && pay > 0 && <p className="payline">Pays {coins.format(pay)} if they win</p>}
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

function OpenSlips({ me }: { me: Me }) {
  const singles = useMemo(() => groupSingles(me.openTickets), [me.openTickets])
  if (!singles.length && !me.openParlays.length) return null
  return <section>
    <h2>Your tickets</h2>
    <div className="slips">
      {singles.map((ticket) => (
        <article className="slip" key={ticket.eventId}>
          <header>{ticket.eventName}</header>
          <p>#{ticket.entryNumber} {ticket.entryName}</p>
          <p>{coins.format(ticket.amount)} carrots, pays {oddsLabel(ticket.oddsAtBet)}</p>
          <p>Still running</p>
        </article>
      ))}
      {me.openParlays.map((parlay) => <ParlaySlip key={parlay.parlayId} parlay={parlay} />)}
    </div>
  </section>
}

function ParlaySlip({ parlay }: { parlay: Parlay }) {
  const title = parlay.chainName || `${parlay.legs.length}-pick ticket`
  return <article className="slip">
    <header>{title}</header>
    {parlay.legs.map((leg) => <p key={leg.eventId}>#{leg.entryNumber} {leg.entryName}{leg.status === 'won' ? ' hit' : ''}</p>)}
    <p>{coins.format(parlay.stake)} carrots, pays {oddsLabel(parlay.combinedOdds)} together</p>
    <p>Still running</p>
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
          <a key={row.discordId} className={row.rank === 1 ? 'rosette first' : 'rosette'} href={`/gamba/trainer/${row.discordId}`} onClick={go(`/gamba/trainer/${row.discordId}`)}>
            <span className="place-num">{row.rank}</span>
            <strong>{row.name}</strong>
            <span className="purse"><span className="coin" aria-hidden="true"></span> {coins.format(row.carrots)}</span>
          </a>
        ))}
      </div>}
      <ul className="board">
        {rows.slice(3).map((row) => (
          <li key={row.discordId}>
            <a href={`/gamba/trainer/${row.discordId}`} onClick={go(`/gamba/trainer/${row.discordId}`)}>
              <strong>{row.rank} {row.name}</strong>
              <span>{coins.format(row.carrots)} carrots, {row.wins} hit, {row.losses} missed</span>
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
        <h1>{trainer.name}</h1>
        <p className="purse"><span className="coin" aria-hidden="true"></span> <strong>{coins.format(trainer.carrots)}</strong> carrots</p>
        <p>{trainer.wins} hit, {trainer.losses} missed{trainer.record ? ` (${trainer.record})` : ''}</p>
        {(trainer.openTickets.length > 0 || trainer.openParlays.length > 0) && <>
          <h2>Still running</h2>
          <div className="slips">
            {groupSingles(trainer.openTickets).map((ticket) => (
              <article className="slip" key={ticket.eventId}>
                <header>{ticket.eventName}</header>
                <p>#{ticket.entryNumber} {ticket.entryName}</p>
                <p>{coins.format(ticket.amount)} carrots</p>
              </article>
            ))}
            {trainer.openParlays.map((parlay) => <ParlaySlip key={parlay.parlayId} parlay={parlay} />)}
          </div>
        </>}
        <h2>Settled tickets</h2>
        {!trainer.history.length && <p>No settled bets yet.</p>}
        <div className="slips">
          {trainer.history.map((row, index) => <HistorySlip key={`${row.eventName}-${row.amount}-${index}`} row={row} />)}
        </div>
      </>}
    </div>
  </div>
}

function HistorySlip({ row }: { row: HistoryRow }) {
  const hit = row.result === 'win'
  const detail = row.kind === 'parlay' || row.entryNumber == null
    ? row.entryName
    : `#${row.entryNumber} ${row.entryName}`
  return <article className={hit ? 'slip hit' : 'slip miss'}>
    <header>{row.eventName}</header>
    <p>{detail}</p>
    <p className="result">{hit ? `Hit +${coins.format(row.payout)}` : `Missed −${coins.format(row.amount)}`}</p>
  </article>
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
    const current = groups.get(ticket.eventId)
    if (!current) groups.set(ticket.eventId, { ...ticket })
    else current.amount += ticket.amount
  }
  return [...groups.values()]
}
