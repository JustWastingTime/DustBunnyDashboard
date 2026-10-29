import { useEffect, useRef, useState } from 'react'
import { AdminError, adminApi, type GambaEvent } from '../admin/api'

type Horse = { number: string; name: string; age: string; jockey: string; odds: string }
type Guild = { id: string; label: string }

const blankHorse = (number: number): Horse => ({ number: String(number), name: '', age: '', jockey: '', odds: '' })

function raceId(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
}

function toLocalInput(iso: string | null) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromLocalInput(value: string) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

export function NewRace({ owner, eventId = null, tournamentId = null, roundId = null, navigate }: {
  owner: boolean
  eventId?: string | null
  tournamentId?: string | null
  roundId?: string | null
  navigate: (to: string) => void
}) {
  const [name, setName] = useState('')
  const [opens, setOpens] = useState('')
  const [closes, setCloses] = useState('')
  const [horses, setHorses] = useState<Horse[]>([blankHorse(1), blankHorse(2)])
  const [scope, setScope] = useState<'all' | 'guilds'>('all')
  const [tournament, setTournament] = useState(Boolean(tournamentId))
  const [tournaments, setTournaments] = useState<Array<{ id: string; name: string; rounds: Array<{ id?: string; label: string }> }>>([])
  const [attachTournament, setAttachTournament] = useState(tournamentId || '')
  const [attachRound, setAttachRound] = useState(roundId || '')
  const [guilds, setGuilds] = useState<Guild[]>([])
  const [savedIds, setSavedIds] = useState<string[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [newLabel, setNewLabel] = useState('')
  const [newId, setNewId] = useState('')
  const [posted, setPosted] = useState<Array<{ id: string; name: string; status: string }>>([])
  const [editing, setEditing] = useState<{ id: string; file: string; blobSha: string | null; status: string } | null>(null)
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)
  const openedId = useRef<string | null>(null)

  const loadPosted = () => {
    adminApi.gambaEvents()
      .then((payload) => setPosted(payload.events.map((event) => ({ id: event.id, name: event.name, status: event.status }))))
      .catch((reason) => setProblem(reason instanceof Error ? reason.message : 'The posted races could not load.'))
  }

  useEffect(() => {
    if (!owner) return
    loadPosted()
    adminApi.gambaTournaments()
      .then((payload) => setTournaments(payload.tournaments))
      .catch((reason) => setProblem(reason instanceof Error ? reason.message : 'The tournaments could not load.'))
    adminApi.gambaGuilds()
      .then((payload) => {
        setGuilds((current) => [
          ...payload.guilds,
          ...current.filter((guild) => !payload.guilds.some((saved) => saved.id === guild.id)),
        ])
        setSavedIds(payload.guilds.map((guild) => guild.id))
      })
      .catch((reason) => setProblem(reason instanceof Error ? reason.message : 'The guild list could not load.'))
  }, [owner])

  const setHorse = (index: number, patch: Partial<Horse>) => {
    setHorses((current) => current.map((horse, item) => (item === index ? { ...horse, ...patch } : horse)))
  }

  const reset = () => {
    setEditing(null)
    setName('')
    setOpens('')
    setCloses('')
    setHorses([blankHorse(1), blankHorse(2)])
    setScope('all')
    setTournament(false)
    setPicked([])
    setProblem('')
  }

  const loadEvent = async (id: string) => {
    setProblem('')
    setBusy(true)
    try {
      const payload = await adminApi.gambaEvent(id)
      const event = payload.event
      setEditing({ id: event.id, file: payload.file, blobSha: payload.blobSha, status: event.status })
      setName(event.name)
      setOpens(toLocalInput(event.startsAt))
      setCloses(toLocalInput(event.endsAt))
      const tournamentRace = event.listing === 'tournament' || event.availability === 'web'
      setTournament(tournamentRace)
      setScope(event.availability === 'guilds' ? 'guilds' : 'all')
      setPicked(event.guildIds || [])
      setGuilds((current) => {
        const extras = (event.guildIds || [])
          .filter((id) => !current.some((guild) => guild.id === id))
          .map((id) => ({ id, label: '' }))
        return extras.length ? [...current, ...extras] : current
      })
      setHorses(
        [...event.entries]
          .sort((a, b) => a.number - b.number)
          .map((entry) => ({
            number: String(entry.number),
            name: entry.name,
            age: entry.ageSex || '',
            jockey: entry.jockey || '',
            odds: entry.odds == null ? '' : String(entry.odds),
          })),
      )
    } catch (reason) {
      setProblem(reason instanceof Error ? reason.message : 'That race could not be opened.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!owner) return
    if (!eventId) {
      if (openedId.current) {
        openedId.current = null
        setEditing(null)
        setName('')
        setOpens('')
        setCloses('')
        setHorses([blankHorse(1), blankHorse(2)])
        setScope('all')
        setTournament(false)
        setPicked([])
      }
      return
    }
    if (openedId.current === eventId) return
    openedId.current = eventId
    void loadEvent(eventId)
  }, [owner, eventId])

  if (!owner) {
    return <div className="paddock-main"><p>Only the owner can post a race.</p></div>
  }

  const save = async () => {
    const trimmed = name.trim()
    const id = editing?.id || raceId(trimmed)
    if (!trimmed || !id) {
      setProblem('Give the race a name.')
      return
    }
    if (editing?.status === 'settled') {
      setProblem('This race is already settled.')
      return
    }
    const entries = horses
      .map((horse, index) => ({
        number: Number(horse.number) || index + 1,
        name: horse.name.trim(),
        ageSex: horse.age.trim(),
        jockey: horse.jockey.trim(),
        odds: Number(horse.odds),
      }))
      .filter((horse) => horse.name)
      .sort((a, b) => a.number - b.number)
    if (!entries.length) {
      setProblem('Add at least one horse.')
      return
    }
    if (entries.some((horse) => !Number.isFinite(horse.odds) || horse.odds <= 0)) {
      setProblem('Each horse needs odds above 0.')
      return
    }
    if (attachTournament && !attachRound) {
      setProblem('Choose the round this race belongs to.')
      return
    }
    if (!tournament && scope === 'guilds' && !picked.length) {
      setProblem('Pick at least one guild, or choose all guilds.')
      return
    }
    const startsAt = fromLocalInput(opens)
    const endsAt = fromLocalInput(closes)
    const kept = editing && (editing.status === 'closed' || editing.status === 'settled')
    const status = kept
      ? editing.status
      : (startsAt && new Date(startsAt).getTime() > Date.now() ? 'scheduled' : 'open')
    const event: GambaEvent = {
      id,
      name: trimmed,
      type: 'horse_race',
      status,
      startsAt,
      endsAt,
      availability: tournament ? 'web' : scope,
      listing: tournament ? 'tournament' : 'board',
      guildIds: tournament || scope !== 'guilds' ? [] : picked,
      threadId: null,
      entries,
    }
    const labeled = guilds
      .map((guild) => ({ id: guild.id, label: guild.label.trim() }))
      .filter((guild) => guild.label && /^\d{17,20}$/.test(guild.id))
    setBusy(true)
    setProblem('')
    try {
      if (labeled.length) {
        const savedGuilds = await adminApi.saveGambaGuilds(labeled)
        setGuilds((current) => {
          const byId = new Map(savedGuilds.guilds.map((guild) => [guild.id, guild]))
          const merged = current.map((guild) => byId.get(guild.id) || guild)
          for (const guild of savedGuilds.guilds) {
            if (!merged.some((row) => row.id === guild.id)) merged.push(guild)
          }
          return merged
        })
        setSavedIds(savedGuilds.guilds.map((guild) => guild.id))
      }
      const saved = await adminApi.saveGambaEvent({
        event,
        creating: !editing,
        file: editing?.file,
        baseBlobSha: editing?.blobSha,
        message: `paddock: ${editing ? 'update' : 'add'} race ${id}`,
      })
      if (!editing && attachTournament && attachRound) {
        const listed = await adminApi.gambaTournaments()
        const target = listed.tournaments.find((item) => item.id === attachTournament)
        if (!target) throw new Error('That tournament is gone.')
        const rounds = target.rounds.map((round) => (
          round.id === attachRound && !round.eventIds.includes(saved.id)
            ? { ...round, eventIds: [...round.eventIds, saved.id] }
            : round
        ))
        if (!rounds.some((round) => round.id === attachRound)) throw new Error('That round is gone.')
        await adminApi.saveGambaTournament({ ...target, rounds })
        navigate(`/gamba/tournament/${encodeURIComponent(attachTournament)}`)
        return
      }
      navigate(tournament ? `/gamba/tournaments` : `/gamba/race/${encodeURIComponent(saved.id)}`)
    } catch (reason) {
      setProblem(reason instanceof AdminError || reason instanceof Error ? reason.message : 'The race was not posted.')
    } finally {
      setBusy(false)
    }
  }

  const rememberGuild = async () => {
    const id = newId.trim()
    const label = newLabel.trim()
    if (!/^\d{17,20}$/.test(id)) {
      setProblem('A guild id is the long number from Discord.')
      return
    }
    if (!label) {
      setProblem('Give the guild a name.')
      return
    }
    setBusy(true)
    setProblem('')
    try {
      const saved = await adminApi.saveGambaGuilds([{ id, label }])
      setGuilds((current) => [
        ...saved.guilds,
        ...current.filter((guild) => !saved.guilds.some((savedGuild) => savedGuild.id === guild.id)),
      ])
      setSavedIds(saved.guilds.map((guild) => guild.id))
      setPicked((current) => (current.includes(id) ? current : [...current, id]))
      setScope('guilds')
      setNewLabel('')
      setNewId('')
    } catch (reason) {
      setProblem(reason instanceof Error ? reason.message : 'That guild was not remembered.')
    } finally {
      setBusy(false)
    }
  }

  const forgetGuild = async (id: string) => {
    setProblem('')
    try {
      if (savedIds.includes(id)) await adminApi.removeGambaGuild(id)
      setGuilds((current) => current.filter((guild) => guild.id !== id))
      setSavedIds((current) => current.filter((saved) => saved !== id))
      setPicked((current) => current.filter((item) => item !== id))
    } catch (reason) {
      setProblem(reason instanceof Error ? reason.message : 'That guild is still remembered.')
    }
  }

  const keepLabel = async (id: string, label: string) => {
    const trimmed = label.trim()
    if (!trimmed || !/^\d{17,20}$/.test(id)) return
    try {
      const saved = await adminApi.saveGambaGuilds([{ id, label: trimmed }])
      setSavedIds(saved.guilds.map((row) => row.id))
    } catch (reason) {
      setProblem(reason instanceof Error ? reason.message : 'That name was not saved.')
    }
  }

  return <div className="paddock-main">
    <div className="race-form">
      <h1>{editing ? 'Edit race' : 'Post a race'}</h1>
      <p className="when">{tournament ? 'This race stays on the tournament page. Discord does not get a horse card for it.' : 'Players see this race on the card once you post it.'}</p>
      {problem && <p className="problem">{problem}</p>}
      <label>Name
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <div className="when-pair">
        <label>Opens
          <input type="datetime-local" value={opens} onChange={(event) => setOpens(event.target.value)} />
        </label>
        <label>Closes
          <input type="datetime-local" value={closes} onChange={(event) => setCloses(event.target.value)} />
        </label>
      </div>
      {!eventId && <label>Tournament
        <select value={attachTournament} onChange={(event) => {
          const next = event.target.value
          setAttachTournament(next)
          setAttachRound('')
          setTournament(Boolean(next))
        }}>
          <option value="">Board race</option>
          {tournaments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>}
      {attachTournament && <label>Round
        <select value={attachRound} onChange={(event) => setAttachRound(event.target.value)}>
          <option value="">Choose a round</option>
          {(tournaments.find((item) => item.id === attachTournament)?.rounds || []).map((round) => (
            <option key={round.id || round.label} value={round.id || ''}>{round.label}</option>
          ))}
        </select>
      </label>}
      <p className="when">{tournament ? 'This race stays on that tournament. Discord does not get a horse card for it.' : 'Players see this race on the Races page once you post it.'}</p>
      {!tournament && <>
      <h2>Guilds</h2>
      <p className="when">A name stays on this bot, so the next race can pick the same guild.</p>
      <div className="scope">
        <button type="button" className="scope-choice" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>All guilds</button>
        <button type="button" className="scope-choice" aria-pressed={scope === 'guilds'} onClick={() => setScope('guilds')}>Specific guilds</button>
      </div>
      <div className={scope === 'guilds' ? 'guilds specific' : 'guilds all'}>
        {guilds.map((guild) => (
          <div className="guild-line" key={guild.id}>
            {scope === 'guilds' && <input
              type="checkbox"
              aria-label={guild.label || guild.id}
              checked={picked.includes(guild.id)}
              onChange={(event) => setPicked((current) => (
                event.target.checked ? [...current, guild.id] : current.filter((id) => id !== guild.id)
              ))}
            />}
            <input
              aria-label={`Name for ${guild.id}`}
              placeholder="Name"
              value={guild.label}
              onChange={(event) => setGuilds((current) => current.map((row) => (
                row.id === guild.id ? { ...row, label: event.target.value } : row
              )))}
              onBlur={(event) => void keepLabel(guild.id, event.target.value)}
            />
            <span className="when">{guild.id}</span>
            <button type="button" className="quiet" onClick={() => void forgetGuild(guild.id)}>Forget</button>
          </div>
        ))}
        {!guilds.length && <p className="when">No guilds remembered yet.</p>}
        <div className="guild-add">
          <label>Name
            <input value={newLabel} onChange={(event) => setNewLabel(event.target.value)} />
          </label>
          <label>Guild id
            <input inputMode="numeric" value={newId} onChange={(event) => setNewId(event.target.value.replace(/[^\d]/g, ''))} />
          </label>
          <button type="button" className="quiet" disabled={busy} onClick={() => void rememberGuild()}>Remember</button>
        </div>
      </div>
      </>}
      <h2>Horses</h2>
      {horses.map((horse, index) => (
        <div className="horse-row" key={index}>
          <label>No.
            <input
              inputMode="numeric"
              value={horse.number}
              onChange={(event) => setHorse(index, { number: event.target.value.replace(/[^\d]/g, '') })}
              onBlur={() => setHorses((current) => [...current].sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0)))}
            />
          </label>
          <label>Name
            <input value={horse.name} onChange={(event) => setHorse(index, { name: event.target.value })} />
          </label>
          <label className="age">Age
            <input value={horse.age} onChange={(event) => setHorse(index, { age: event.target.value })} />
          </label>
          <label className="jockey">Jockey
            <input value={horse.jockey} onChange={(event) => setHorse(index, { jockey: event.target.value })} />
          </label>
          <label className="odds">Odds
            <input inputMode="decimal" value={horse.odds} onChange={(event) => setHorse(index, { odds: event.target.value.replace(/[^\d.]/g, '') })} />
          </label>
          {horses.length > 1 && <button type="button" className="quiet" onClick={() => setHorses((current) => current.filter((_, item) => item !== index))}>Remove</button>}
        </div>
      ))}
      <div className="form-actions">
        <button type="button" className="quiet" onClick={() => setHorses((current) => [...current, blankHorse(current.length + 1)])}>Add a horse</button>
        <button type="button" className="place" disabled={busy} onClick={() => void save()}>{busy ? 'Posting…' : editing ? 'Save race' : 'Post race'}</button>
        {editing && <button type="button" className="quiet" onClick={() => { openedId.current = null; reset(); navigate('/gamba/new') }}>New race</button>}
      </div>
      <h2>Posted races</h2>
      {!posted.length && <p className="when">No races posted yet.</p>}
      <ul className="posted">
        {posted.map((race) => (
          <li key={race.id}>
            {race.status === 'settled'
              ? <span>{race.name}</span>
              : <button type="button" className="quiet" onClick={() => navigate(`/gamba/new?race=${encodeURIComponent(race.id)}`)}>{race.name}</button>}
            <span className="when">{({ open: 'Open', closed: 'Expired', scheduled: 'Soon', settled: 'Settled' } as Record<string, string>)[race.status] || race.status}</span>
          </li>
        ))}
      </ul>
    </div>
  </div>
}
