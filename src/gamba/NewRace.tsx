import { useEffect, useState } from 'react'
import { AdminError, adminApi, type GambaEvent } from '../admin/api'

type Horse = { number: string; name: string; jockey: string; odds: string }

const blankHorse = (number: number): Horse => ({ number: String(number), name: '', jockey: '', odds: '2' })

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

export function NewRace({ owner, navigate }: { owner: boolean; navigate: (to: string) => void }) {
  const [name, setName] = useState('')
  const [opens, setOpens] = useState('')
  const [closes, setCloses] = useState('')
  const [horses, setHorses] = useState<Horse[]>([blankHorse(1), blankHorse(2)])
  const [posted, setPosted] = useState<Array<{ id: string; name: string; status: string }>>([])
  const [editing, setEditing] = useState<{ id: string; file: string; blobSha: string | null; status: string } | null>(null)
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)

  const loadPosted = () => {
    adminApi.gambaEvents()
      .then((payload) => setPosted(payload.events.map((event) => ({ id: event.id, name: event.name, status: event.status }))))
      .catch((reason) => setProblem(reason instanceof Error ? reason.message : 'The posted races could not load.'))
  }

  useEffect(() => {
    if (owner) loadPosted()
  }, [owner])

  if (!owner) {
    return <div className="paddock-main solo"><p>Only the owner can post a race.</p></div>
  }

  const setHorse = (index: number, patch: Partial<Horse>) => {
    setHorses((current) => current.map((horse, item) => (item === index ? { ...horse, ...patch } : horse)))
  }

  const reset = () => {
    setEditing(null)
    setName('')
    setOpens('')
    setCloses('')
    setHorses([blankHorse(1), blankHorse(2)])
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
      setHorses(event.entries.map((entry) => ({
        number: String(entry.number),
        name: entry.name,
        jockey: entry.jockey || '',
        odds: String(entry.odds),
      })))
    } catch (reason) {
      setProblem(reason instanceof Error ? reason.message : 'That race could not be opened.')
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    const trimmed = name.trim()
    const id = editing?.id || raceId(trimmed)
    if (!trimmed || !id) {
      setProblem('Give the race a name.')
      return
    }
    const entries = horses
      .map((horse, index) => ({
        number: Number(horse.number) || index + 1,
        name: horse.name.trim(),
        ageSex: '',
        jockey: horse.jockey.trim(),
        odds: Number(horse.odds),
      }))
      .filter((horse) => horse.name)
    if (!entries.length) {
      setProblem('Add at least one horse.')
      return
    }
    if (entries.some((horse) => !Number.isFinite(horse.odds) || horse.odds <= 0)) {
      setProblem('Each horse needs odds above 0.')
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
      availability: 'all',
      guildIds: [],
      threadId: null,
      entries,
    }
    setBusy(true)
    setProblem('')
    try {
      const saved = await adminApi.saveGambaEvent({
        event,
        creating: !editing,
        file: editing?.file,
        baseBlobSha: editing?.blobSha,
        message: `paddock: ${editing ? 'update' : 'add'} race ${id}`,
      })
      navigate(`/gamba/race/${encodeURIComponent(saved.id)}`)
    } catch (reason) {
      setProblem(reason instanceof AdminError || reason instanceof Error ? reason.message : 'The race was not posted.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="paddock-main solo">
    <div className="race-form">
      <h1>{editing ? 'Edit race' : 'Post a race'}</h1>
      <p className="when">Players see this race on the card once you post it.</p>
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
      <h2>Horses</h2>
      {horses.map((horse, index) => (
        <div className="horse-row" key={index}>
          <label>No.
            <input inputMode="numeric" value={horse.number} onChange={(event) => setHorse(index, { number: event.target.value.replace(/[^\d]/g, '') })} />
          </label>
          <label>Name
            <input value={horse.name} onChange={(event) => setHorse(index, { name: event.target.value })} />
          </label>
          <label className="jockey">Jockey
            <input value={horse.jockey} onChange={(event) => setHorse(index, { jockey: event.target.value })} />
          </label>
          <label>Odds
            <input inputMode="decimal" value={horse.odds} onChange={(event) => setHorse(index, { odds: event.target.value.replace(/[^\d.]/g, '') })} />
          </label>
          {horses.length > 1 && <button type="button" className="quiet" onClick={() => setHorses((current) => current.filter((_, item) => item !== index))}>Remove</button>}
        </div>
      ))}
      <div className="form-actions">
        <button type="button" className="quiet" onClick={() => setHorses((current) => [...current, blankHorse(current.length + 1)])}>Add a horse</button>
        <button type="button" className="place" disabled={busy} onClick={() => void save()}>{busy ? 'Posting…' : editing ? 'Save race' : 'Post race'}</button>
        {editing && <button type="button" className="quiet" onClick={reset}>New race</button>}
      </div>
      <h2>Posted races</h2>
      {!posted.length && <p className="when">No races posted yet.</p>}
      <ul className="posted">
        {posted.map((race) => (
          <li key={race.id}>
            <button type="button" className="quiet" onClick={() => void loadEvent(race.id)}>{race.name}</button>
            <span className="when">{({ open: 'Open', closed: 'Expired', scheduled: 'Soon', settled: 'Settled' } as Record<string, string>)[race.status] || race.status}</span>
          </li>
        ))}
      </ul>
    </div>
  </div>
}
