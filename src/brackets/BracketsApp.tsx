import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  bracketApi,
  loginHref,
  type BracketDetail,
  type BracketInput,
  type BracketStatus,
  type BracketSummary,
  type Entry,
  type Viewer,
} from './api'
import { BracketView } from './BracketView'
import { choose, previewMatches, type BracketMatch, type Winners } from './logic'
import './brackets.css'

type Nav = (to: string) => void

const SIZES = [4, 8, 16]
const MATCHES_FOR = (size: number) => 2 * size - 2

function errorText(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback
}

function when(iso: string | null) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function statusText(status: BracketStatus) {
  if (status === 'open') return 'Picks open'
  if (status === 'locked') return 'Live'
  return 'Finished'
}

function useLink(navigate: Nav) {
  return (href: string) => (event: { preventDefault: () => void }) => {
    event.preventDefault()
    navigate(href)
  }
}

export const BRACKETS_ROOT = '/gamba/brackets'

/** The Brackets tab inside the Paddock: /gamba/brackets and everything under it. */
export function BracketsSection({ path, navigate }: { path: string; navigate: Nav }) {
  const clean = path.split('?')[0].replace(/\/+$/, '')
  const parts = clean.slice(BRACKETS_ROOT.length).split('/').filter(Boolean).map(decodeURIComponent)

  let body: ReactNode
  if (!parts.length) body = <ListPage navigate={navigate} />
  else if (parts[0] === 'new') body = <EditPage navigate={navigate} bracketId={null} />
  else if (parts[1] === 'edit') body = <EditPage navigate={navigate} bracketId={parts[0]} />
  else if (parts[1] === 'player' && parts[2]) body = <PlayerPage navigate={navigate} bracketId={parts[0]} discordId={parts[2]} />
  else body = <DetailPage navigate={navigate} bracketId={parts[0]} tab={parts[1] || 'picks'} />

  return <div className="paddock-main bx-zone">
    {body}
    <p className="bx-free-note">
      <span className="bx-free-tag">Free pick'em</span>
      Brackets are not bets. Entering is free, you can't lose carrots here, and correct picks earn points plus any bonus carrots on that match.
    </p>
  </div>
}

// ---------------------------------------------------------------------------

function ListPage({ navigate }: { navigate: Nav }) {
  const [brackets, setBrackets] = useState<BracketSummary[]>([])
  const [viewer, setViewer] = useState<Viewer | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [problem, setProblem] = useState('')
  const link = useLink(navigate)

  useEffect(() => {
    bracketApi.list()
      .then((payload) => {
        setBrackets(payload.brackets)
        setViewer(payload.viewer)
      })
      .catch((reason) => setProblem(errorText(reason, 'Brackets could not load.')))
      .finally(() => setLoaded(true))
  }, [])

  return <div className="bx-page">
    <section className="bx-hero">
      <div>
        <p className="bx-kicker"><span className="bx-free-tag">Free pick'em</span></p>
        <h1>Call the whole bracket before it starts.</h1>
        <p className="bx-lede">Pick a winner for every match. Your picks carry forward on their own, losers drop into the lower bracket, and you score as the real results come in.</p>
      </div>
      <ol className="bx-steps">
        <li><strong>Pick every match</strong><span>Pick who you think wins the match ups.</span></li>
        <li><strong>Picks lock</strong><span>Once the tournament starts, brackets are final and everyone's picks show up.</span></li>
        <li><strong>Score as it plays</strong><span>Points for each correct pick, plus bonus carrots where a match has them.</span></li>
      </ol>
    </section>

    <div className="bx-list-head">
      <h2>Brackets</h2>
      {viewer?.owner && <a className="bx-btn primary" href={`${BRACKETS_ROOT}/new`} onClick={link(`${BRACKETS_ROOT}/new`)}>New bracket</a>}
    </div>
    {problem && <p className="bx-problem">{problem}</p>}
    {loaded && !problem && !brackets.length && <p className="bx-empty">No brackets yet. When a tournament is set up, it shows here.</p>}
    <div className="bx-cards">
      {brackets.map((item) => (
        <a key={item.id} className="bx-card" href={`${BRACKETS_ROOT}/${item.id}`} onClick={link(`${BRACKETS_ROOT}/${item.id}`)}>
          <div className="bx-card-top">
            <span className={`bx-pill ${item.status}`}>{statusText(item.status)}</span>
            {item.joined && <span className="bx-pill mine">You're in</span>}
          </div>
          <h3>{item.name}</h3>
          <p className="bx-card-sub">
            {item.teamCount} teams · double elimination · {item.matchCount} matches
          </p>
          <dl className="bx-facts">
            <div><dt>Players</dt><dd>{item.entryCount}</dd></div>
            <div><dt>Perfect bracket</dt><dd>{item.pointsPerfect} pts{item.carrotsPerfect ? ` · ${item.carrotsPerfect.toLocaleString('en-US')} 🥕` : ''}</dd></div>
            <div>
              <dt>{item.champion ? 'Champion' : item.status === 'open' ? 'Picks lock' : 'Results'}</dt>
              <dd>{item.champion ? item.champion.name : item.status === 'open' ? (when(item.locksAt) || 'When it starts') : `${item.resultCount} of ${item.matchCount} in`}</dd>
            </div>
          </dl>
        </a>
      ))}
    </div>
  </div>
}

// ---------------------------------------------------------------------------

function DetailPage({ navigate, bracketId, tab }: { navigate: Nav; bracketId: string; tab: string }) {
  const [data, setData] = useState<BracketDetail | null>(null)
  const [problem, setProblem] = useState('')
  const [draft, setDraft] = useState<Winners>({})
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [entering, setEntering] = useState(false)
  const link = useLink(navigate)

  const load = () => bracketApi.get(bracketId)
    .then((payload) => {
      setData(payload)
      setDraft(payload.mine?.picks || {})
      setDirty(false)
    })
    .catch((reason) => setProblem(errorText(reason, 'That bracket could not load.')))

  useEffect(() => {
    setData(null)
    setProblem('')
    void load()
  }, [bracketId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!note) return
    const id = window.setTimeout(() => setNote(''), 3200)
    return () => window.clearTimeout(id)
  }, [note])

  if (problem && !data) return <div className="bx-page"><p className="bx-problem">{problem}</p></div>
  if (!data) return <div className="bx-page"><p className="bx-empty">Loading the bracket.</p></div>

  const { bracket, viewer, mine, standings } = data
  const open = bracket.status === 'open'
  const final = bracket.matches.find((match) => match.side === 'final')
  const picked = Object.keys(draft).length
  const total = bracket.matches.length
  const myChampion = final ? draft[final.id] : null
  const teamName = (id: string | null | undefined) => bracket.teams.find((team) => team.id === id)?.name || ''
  const current = tab === 'live' || tab === 'standings' ? tab : 'picks'
  const base = `${BRACKETS_ROOT}/${bracket.id}`

  const savePicks = async () => {
    setBusy(true)
    setProblem('')
    try {
      const next = await bracketApi.savePicks(bracket.id, draft)
      setData(next)
      setDraft(next.mine?.picks || {})
      setDirty(false)
      setNote(picked === total ? 'Bracket saved. Good luck!' : `Saved ${picked} of ${total} picks.`)
    } catch (reason) {
      setProblem(errorText(reason, 'Your picks did not save.'))
    } finally {
      setBusy(false)
    }
  }

  const pick = (matchId: string, teamId: string) => {
    setDraft((prev) => choose(bracket, prev, matchId, teamId))
    setDirty(true)
  }

  const setResult = async (matchId: string, teamId: string | null) => {
    setBusy(true)
    setProblem('')
    try {
      const next = await bracketApi.result(bracket.id, matchId, teamId)
      setData(next)
      const number = bracket.matches.find((match) => match.id === matchId)?.number
      const extra = next.changed.length > 1 ? ` ${next.changed.length - 1} later result${next.changed.length > 2 ? 's' : ''} cleared too.` : ''
      setNote(teamId ? `Match ${number}: ${teamName(teamId)} wins.${extra}` : `Match ${number} cleared.${extra}`)
    } catch (reason) {
      setProblem(errorText(reason, 'That result did not save.'))
    } finally {
      setBusy(false)
    }
  }

  const toggleLock = async () => {
    setBusy(true)
    setProblem('')
    try {
      const next = await bracketApi.lock(bracket.id, open)
      setData(next)
      setNote(open ? 'Picks are locked.' : 'Picks are open again.')
    } catch (reason) {
      setProblem(errorText(reason, 'That did not work.'))
    } finally {
      setBusy(false)
    }
  }

  const resultFooter = (match: BracketMatch) => {
    if (!entering || !bracket.results[match.id]) return null
    return <button type="button" className="bx-clear" disabled={busy} onClick={() => void setResult(match.id, null)}>Clear</button>
  }

  const tabs = [
    { id: 'picks', label: open ? 'Make your picks' : 'My bracket' },
    { id: 'live', label: 'Live bracket' },
    { id: 'standings', label: `Standings (${standings.length})` },
  ]

  return <div className="bx-page wide">
    <a className="bx-back" href={BRACKETS_ROOT} onClick={link(BRACKETS_ROOT)}>← All brackets</a>
    <div className="bx-title-row">
      <div>
        <div className="bx-title-pills">
          <span className="bx-free-tag">Free pick'em</span>
          <span className={`bx-pill ${bracket.status}`}>{statusText(bracket.status)}</span>
          <span className="bx-pill plain">Double elimination · {bracket.teamCount} teams</span>
        </div>
        <h1>{bracket.name}</h1>
        <p className="bx-lede">
          {bracket.champion
            ? <>Champion: <strong>{bracket.champion.name}</strong></>
            : open
              ? bracket.locksAt ? <>Picks lock {when(bracket.locksAt)}.</> : <>Picks lock when the first result goes in.</>
              : <>Picks are locked. {bracket.resultCount} of {bracket.matchCount} results in.</>}
          {' '}Perfect bracket: {bracket.pointsPerfect} pts{bracket.carrotsPerfect ? ` and ${bracket.carrotsPerfect.toLocaleString('en-US')} carrots` : ''}.
        </p>
      </div>
      {viewer.owner && <div className="bx-owner">
        <span className="bx-owner-tag">Owner</span>
        <a className="bx-btn" href={`${base}/edit`} onClick={link(`${base}/edit`)}>Edit</a>
        {!bracket.resultCount && <button type="button" className="bx-btn" disabled={busy} onClick={() => void toggleLock()}>{open ? 'Lock picks now' : 'Reopen picks'}</button>}
        <button
          type="button"
          className={entering ? 'bx-btn primary' : 'bx-btn'}
          onClick={() => { setEntering((value) => !value); navigate(`${base}/live`) }}
        >{entering ? 'Done entering results' : 'Enter results'}</button>
      </div>}
    </div>

    <nav className="bx-tabs" aria-label="Bracket views">
      {tabs.map((item) => (
        <a
          key={item.id}
          href={item.id === 'picks' ? base : `${base}/${item.id}`}
          aria-current={current === item.id ? 'page' : undefined}
          onClick={link(item.id === 'picks' ? base : `${base}/${item.id}`)}
        >{item.label}</a>
      ))}
    </nav>

    {problem && <p className="bx-problem">{problem}</p>}

    {current === 'picks' && <>
      {!viewer.loggedIn && <div className="bx-callout">
        <p><strong>Log in to fill out a bracket.</strong> It's free, and you can change picks until they lock.</p>
        <a className="bx-btn primary" href={loginHref(base)}>Log in with Discord</a>
      </div>}
      {viewer.loggedIn && open && <div className="bx-callout">
        <p>Winners move right; losers from the upper bracket drop into the lower bracket.</p>
      </div>}
      {viewer.loggedIn && !open && !mine && <div className="bx-callout"><p>You didn't fill out this bracket before picks locked. Follow along in the live bracket.</p></div>}
      {viewer.loggedIn && !open && mine && <ScoreStrip entry={mine} total={total} />}
      {viewer.loggedIn && (open || mine) && <BracketView
        bracket={bracket}
        winners={open ? draft : mine?.picks || {}}
        results={bracket.results}
        status={open ? undefined : mine?.status}
        tone="pick"
        onChoose={open ? pick : undefined}
      />}
      {viewer.loggedIn && open && <div className="bx-savebar" role="region" aria-label="Save picks">
        <div className="bx-progress">
          <span className="bx-progress-bar"><span style={{ width: `${(picked / total) * 100}%` }} /></span>
          <span><strong>{picked}</strong> of {total} picked{myChampion ? <> · Champion: <strong>{teamName(myChampion)}</strong></> : ''}</span>
        </div>
        <div className="bx-savebar-actions">
          {dirty && <button type="button" className="bx-btn ghost" disabled={busy} onClick={() => { setDraft(mine?.picks || {}); setDirty(false) }}>Undo changes</button>}
          <button type="button" className="bx-btn primary" disabled={busy || !dirty} onClick={() => void savePicks()}>
            {busy ? 'Saving' : dirty ? 'Save picks' : mine ? 'Saved' : 'Pick to start'}
          </button>
        </div>
      </div>}
    </>}

    {current === 'live' && <>
      {entering && viewer.owner && <div className="bx-callout owner">
        <p><strong>Entering results.</strong> Tap the team that won. Teams move on and drop down by themselves. Carrots are paid to correct picks right away, and taken back if you change a result.</p>
      </div>}
      {!entering && <div className="bx-callout"><p>The real tournament. Results fill in as matches finish.</p></div>}
      <BracketView
        bracket={bracket}
        winners={bracket.results}
        tone="result"
        onChoose={entering && viewer.owner && !busy ? (matchId, teamId) => void setResult(matchId, teamId) : undefined}
        matchFooter={resultFooter}
      />
    </>}

    {current === 'standings' && <Standings data={data} navigate={navigate} />}

    <div className={note ? 'bx-toast show' : 'bx-toast'} role="status">{note}</div>
  </div>
}

function ScoreStrip({ entry, total }: { entry: Entry; total: number }) {
  return <dl className="bx-score">
    <div><dt>Points</dt><dd>{entry.points}</dd></div>
    <div><dt>Correct</dt><dd>{entry.correct}<small> / {total}</small></dd></div>
    <div><dt>Still possible</dt><dd>{entry.maxPoints}<small> pts</small></dd></div>
    <div><dt>Carrots won</dt><dd>{entry.carrots.toLocaleString('en-US')}<small> 🥕</small></dd></div>
  </dl>
}

function Standings({ data, navigate }: { data: BracketDetail; navigate: Nav }) {
  const { bracket, standings, viewer } = data
  const link = useLink(navigate)
  const open = bracket.status === 'open'
  const teamName = (id: string | null) => bracket.teams.find((team) => team.id === id)?.name || '—'
  if (!standings.length) return <p className="bx-empty">Nobody has filled out this bracket yet.</p>
  return <div className="bx-standings">
    {open && <p className="bx-note">Everyone's picks stay hidden until the bracket locks.</p>}
    <table>
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Player</th>
          <th scope="col" className="bx-n">Points</th>
          <th scope="col" className="bx-n hide-sm">Correct</th>
          <th scope="col" className="bx-n hide-sm">Possible</th>
          <th scope="col" className="bx-n">Carrots</th>
          <th scope="col" className="hide-sm">{open ? 'Picked' : 'Champion pick'}</th>
        </tr>
      </thead>
      <tbody>
        {standings.map((row) => {
          const me = row.discordId === viewer.discordId
          const href = `${BRACKETS_ROOT}/${bracket.id}/player/${row.discordId}`
          const canOpen = !open || me
          return <tr key={row.discordId} className={me ? 'me' : ''}>
            <td>{row.rank}</td>
            <td>{canOpen ? <a href={href} onClick={link(href)}>{row.name}</a> : row.name}{me && <span className="bx-you">you</span>}</td>
            <td className="bx-n strong">{row.points}</td>
            <td className="bx-n hide-sm">{row.correct}</td>
            <td className="bx-n hide-sm">{row.maxPoints}</td>
            <td className="bx-n">{row.carrots.toLocaleString('en-US')}</td>
            <td className="hide-sm">{open ? `${row.picked} of ${bracket.matchCount}` : teamName(row.champion)}</td>
          </tr>
        })}
      </tbody>
    </table>
  </div>
}

// ---------------------------------------------------------------------------

function PlayerPage({ navigate, bracketId, discordId }: { navigate: Nav; bracketId: string; discordId: string }) {
  const [data, setData] = useState<BracketDetail | null>(null)
  const [entry, setEntry] = useState<Entry | null>(null)
  const [problem, setProblem] = useState('')
  const link = useLink(navigate)
  useEffect(() => {
    Promise.all([bracketApi.get(bracketId), bracketApi.entry(bracketId, discordId)])
      .then(([detail, payload]) => {
        setData(detail)
        setEntry(payload.entry)
      })
      .catch((reason) => setProblem(errorText(reason, 'Those picks could not load.')))
  }, [bracketId, discordId])
  const back = `${BRACKETS_ROOT}/${bracketId}/standings`
  return <div className="bx-page wide">
    <a className="bx-back" href={back} onClick={link(back)}>← Standings</a>
    {problem && <p className="bx-problem">{problem}</p>}
    {data && entry && <>
      <h1>{entry.name}'s bracket</h1>
      <p className="bx-lede">{data.bracket.name}</p>
      <ScoreStrip entry={entry} total={data.bracket.matchCount} />
      <BracketView bracket={data.bracket} winners={entry.picks} results={data.bracket.results} status={entry.status} tone="pick" />
    </>}
  </div>
}

// ---------------------------------------------------------------------------

function defaultTeams(size: number) {
  return Array.from({ length: size }, (_, i) => `Team ${i + 1}`)
}

function toLocalInput(iso: string | null) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function EditPage({ navigate, bracketId }: { navigate: Nav; bracketId: string | null }) {
  const [loaded, setLoaded] = useState(!bracketId)
  const [existing, setExisting] = useState<BracketDetail | null>(null)
  const [name, setName] = useState('')
  const [teams, setTeams] = useState<string[]>(defaultTeams(8))
  const [locksAt, setLocksAt] = useState('')
  const [points, setPoints] = useState<Record<string, number>>({})
  const [carrots, setCarrots] = useState<Record<string, number>>({})
  const [allCarrots, setAllCarrots] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const link = useLink(navigate)

  useEffect(() => {
    if (!bracketId) return
    bracketApi.get(bracketId).then((payload) => {
      setExisting(payload)
      setName(payload.bracket.name)
      setTeams(payload.bracket.teams.map((team) => team.name))
      setLocksAt(toLocalInput(payload.bracket.locksAt))
      setPoints(Object.fromEntries(payload.bracket.matches.map((match) => [match.id, match.points])))
      setCarrots(Object.fromEntries(payload.bracket.matches.map((match) => [match.id, match.carrots])))
    }).catch((reason) => setProblem(errorText(reason, 'That bracket could not load.')))
      .finally(() => setLoaded(true))
  }, [bracketId])

  const locked = Boolean(existing && existing.standings.length)
  // The match list for the points table: the saved one, or a preview of the new layout.
  const matches = useMemo(() => {
    if (existing && existing.bracket.teams.length === teams.length) return existing.bracket.matches
    return previewMatches(teams.length)
  }, [existing, teams.length])

  if (!loaded) return <div className="bx-page"><p className="bx-empty">Loading.</p></div>
  if (bracketId && !existing) return <div className="bx-page"><p className="bx-problem">{problem || 'That bracket is gone.'}</p></div>
  if (existing && !existing.viewer.owner) return <div className="bx-page"><p className="bx-problem">Only the owner can edit brackets.</p></div>

  const resize = (size: number) => {
    setTeams((prev) => Array.from({ length: size }, (_, i) => prev[i] ?? `Team ${i + 1}`))
    setPoints({})
    setCarrots({})
  }

  const submit = async (event: { preventDefault: () => void }) => {
    event.preventDefault()
    setBusy(true)
    setProblem('')
    const input: BracketInput = {
      name,
      teams,
      locksAt: locksAt ? new Date(locksAt).toISOString() : null,
      points: Object.fromEntries(matches.map((match) => [match.id, points[match.id] ?? match.points])),
      carrots: Object.fromEntries(matches.map((match) => [match.id, carrots[match.id] ?? 0])),
    }
    try {
      const saved = existing ? await bracketApi.update(existing.bracket.id, input) : await bracketApi.create(input)
      navigate(`${BRACKETS_ROOT}/${saved.bracket.id}`)
    } catch (reason) {
      setProblem(errorText(reason, 'The bracket did not save.'))
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!existing) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setBusy(true)
    try {
      await bracketApi.remove(existing.bracket.id)
      navigate(BRACKETS_ROOT)
    } catch (reason) {
      setProblem(errorText(reason, 'That did not delete.'))
      setBusy(false)
    }
  }

  const back = existing ? `${BRACKETS_ROOT}/${existing.bracket.id}` : BRACKETS_ROOT
  return <div className="bx-page">
    <a className="bx-back" href={back} onClick={link(back)}>← Back</a>
    <h1>{existing ? 'Edit bracket' : 'New bracket'}</h1>
    <p className="bx-lede">Double elimination. Teams meet in the order you list them: 1 plays 2, 3 plays 4, and so on. Nothing is posted to Discord.</p>
    <form className="bx-form" onSubmit={(event) => void submit(event)}>
      <label className="bx-field">
        <span>Name</span>
        <input value={name} maxLength={60} required onChange={(event) => setName(event.target.value)} placeholder="Winter Cup" />
      </label>
      <div className="bx-field-row">
        <label className="bx-field">
          <span>Teams</span>
          <select value={teams.length} disabled={locked} onChange={(event) => resize(Number(event.target.value))}>
            {SIZES.map((size) => <option key={size} value={size}>{size} teams · {MATCHES_FOR(size)} matches</option>)}
          </select>
        </label>
        <label className="bx-field">
          <span>Picks lock at <small>(optional)</small></span>
          <input type="datetime-local" value={locksAt} onChange={(event) => setLocksAt(event.target.value)} />
        </label>
      </div>
      {locked && <p className="bx-note">People already made picks, so the number of teams is fixed. You can still rename teams.</p>}

      <fieldset className="bx-teams">
        <legend>Teams in seed order</legend>
        {teams.map((team, index) => (
          <label key={index} className={index % 2 === 0 ? 'pair-start' : ''}>
            <span className="bx-seed">{index + 1}</span>
            <input
              value={team}
              maxLength={40}
              required
              aria-label={`Team ${index + 1}`}
              onChange={(event) => setTeams((prev) => prev.map((value, i) => (i === index ? event.target.value : value)))}
            />
          </label>
        ))}
      </fieldset>

      <fieldset className="bx-payouts">
        <legend>Points and carrots per correct pick</legend>
        <div className="bx-fill">
          <label>
            <span>Carrots on every match</span>
            <input type="number" min={0} max={10000} value={allCarrots} onChange={(event) => setAllCarrots(event.target.value)} placeholder="0" />
          </label>
          <button type="button" className="bx-btn" onClick={() => setCarrots(Object.fromEntries(matches.map((match) => [match.id, Math.max(0, Math.trunc(Number(allCarrots) || 0))])))}>Apply to all</button>
        </div>
        <table>
          <thead><tr><th>Match</th><th>Round</th><th>Points</th><th>Carrots</th></tr></thead>
          <tbody>
            {matches.map((match) => (
              <tr key={match.id}>
                <td>{match.number}</td>
                <td>{match.label}</td>
                <td><input type="number" min={0} max={100} aria-label={`Points for match ${match.number}`} value={points[match.id] ?? match.points} onChange={(event) => setPoints((prev) => ({ ...prev, [match.id]: Number(event.target.value) }))} /></td>
                <td><input type="number" min={0} max={10000} aria-label={`Carrots for match ${match.number}`} value={carrots[match.id] ?? match.carrots ?? 0} onChange={(event) => setCarrots((prev) => ({ ...prev, [match.id]: Number(event.target.value) }))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="bx-note">Carrots are a bonus paid to everyone who picked the winner, as soon as you enter that result. Players never pay anything in.</p>
      </fieldset>

      {problem && <p className="bx-problem">{problem}</p>}
      <div className="bx-form-actions">
        {existing && <button type="button" className="bx-btn danger" disabled={busy} onClick={() => void remove()}>{confirmDelete ? 'Click again to delete' : 'Delete bracket'}</button>}
        <button type="submit" className="bx-btn primary" disabled={busy}>{busy ? 'Saving' : existing ? 'Save changes' : 'Create bracket'}</button>
      </div>
    </form>
  </div>
}
