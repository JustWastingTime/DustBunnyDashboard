import { useEffect, useState } from 'react'
import { AdminError, adminApi, type GambaChain, type GambaEntry, type GambaEvent, type GambaTournament } from './api'

const EMPTY: GambaEvent = {
  id: '',
  name: '',
  type: 'horse_race',
  status: 'scheduled',
  startsAt: '',
  endsAt: '',
  availability: 'all',
  guildIds: [],
  threadId: '',
  entries: [{ number: 1, name: '', ageSex: '', jockey: '', odds: 2 }],
}

export function GambaEventList({ owner, navigate }: { owner: boolean; navigate: (to: string) => void }) {
  const [rows, setRows] = useState<Array<{ id: string; name: string; status: string; startsAt: string | null; endsAt: string | null; entryCount: number }>>([])
  const [error, setError] = useState('')
  useEffect(() => {
    if (!owner) return
    adminApi.gambaEvents().then((payload) => setRows(payload.events)).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
  }, [owner])
  if (!owner) return <p>Gamba events are visible to the bot owner only.</p>
  return <section className="admin-grid">
    <div className="admin-row catalog-head">
      <h1>Gamba events</h1>
      <button type="button" className="primary" onClick={() => navigate('/admin/gamba/new')}>Add</button>
    </div>
    {error && <p className="notice error">{error}</p>}
    <p className="muted">Saving writes the event file and reloads it in this bot process, so /gamba can find it without a restart.</p>
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>ID</th>
            <th>Status</th>
            <th>Starts</th>
            <th>Entries</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <button type="button" className="text-button" onClick={() => navigate(`/admin/gamba/edit?key=${encodeURIComponent(row.id)}`)}>{row.name}</button>
              </td>
              <td>{row.id}</td>
              <td>{row.status}</td>
              <td>{row.startsAt || '—'}</td>
              <td>{row.entryCount}</td>
            </tr>
          ))}
          {!rows.length && !error && <tr><td colSpan={5}>No events loaded.</td></tr>}
        </tbody>
      </table>
    </div>
    <GambaMeets events={rows.map((row) => ({ id: row.id, name: row.name }))} />
    <GambaTournaments />
  </section>
}

function GambaMeets({ events }: { events: Array<{ id: string; name: string }> }) {
  const blank = (): GambaChain => ({
    id: '',
    name: '',
    stages: [
      { label: 'Group', eventIds: [] },
      { label: 'Final', eventIds: [] },
    ],
  })
  const [chains, setChains] = useState<GambaChain[]>([])
  const [draft, setDraft] = useState<GambaChain>(blank())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => adminApi.gambaChains().then((payload) => setChains(payload.chains)).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
  useEffect(() => { void load() }, [])
  const setStage = (index: number, patch: Partial<GambaChain['stages'][number]>) => {
    const stages = draft.stages.slice()
    stages[index] = { ...stages[index], ...patch }
    setDraft({ ...draft, stages })
  }
  const save = async () => {
    setBusy(true)
    setError('')
    try {
      await adminApi.saveGambaChain(draft)
      setDraft(blank())
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }
  return <section>
    <h2>Linked meets</h2>
    <p className="muted">A meet ties races into stages. Players pick one horse in each stage for one ticket.</p>
    {error && <p className="notice error">{error}</p>}
    <ul>
      {chains.map((chain) => (
        <li key={chain.id}>
          <button type="button" className="text-button" onClick={() => setDraft(chain)}>{chain.name}</button>
          {' '}
          <button type="button" onClick={async () => {
            if (!window.confirm(`Delete ${chain.name}?`)) return
            setBusy(true)
            try {
              await adminApi.removeGambaChain(chain.id)
              if (draft.id === chain.id) setDraft(blank())
              await load()
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : String(reason))
            } finally { setBusy(false) }
          }}>Delete</button>
        </li>
      ))}
      {!chains.length && <li>No meets yet.</li>}
    </ul>
    <label className="admin-field">Meet name
      <input value={draft.name} onChange={(input) => setDraft({ ...draft, name: input.target.value })} />
    </label>
    {draft.stages.map((stage, index) => (
      <div key={index} className="admin-field">
        <label>Stage name
          <input value={stage.label} onChange={(input) => setStage(index, { label: input.target.value })} />
        </label>
        <label>Races in this stage
          <select multiple size={Math.min(8, Math.max(3, events.length))} value={stage.eventIds} onChange={(input) => {
            const eventIds = [...input.target.selectedOptions].map((option) => option.value)
            setStage(index, { eventIds })
          }}>
            {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
          </select>
        </label>
        {draft.stages.length > 2 && <button type="button" onClick={() => setDraft({ ...draft, stages: draft.stages.filter((_, item) => item !== index) })}>Remove stage</button>}
      </div>
    ))}
    <div className="admin-row">
      {draft.stages.length < 6 && <button type="button" onClick={() => setDraft({ ...draft, stages: [...draft.stages, { label: '', eventIds: [] }] })}>Add stage</button>}
      <button type="button" className="primary" disabled={busy} onClick={() => void save()}>{draft.id ? 'Update meet' : 'Save meet'}</button>
      {draft.id && <button type="button" onClick={() => setDraft(blank())}>New meet</button>}
    </div>
  </section>
}

function resizePayouts(current: number[], raceCount: number) {
  const next = current.slice(0, raceCount + 1)
  while (next.length < raceCount + 1) next.push(0)
  if (next.every((value) => !value)) next[raceCount] = 5
  return next.map((value) => Math.min(20, Math.max(0, Number(value) || 0)))
}

function GambaTournaments() {
  const blank = (): GambaTournament => ({
    id: '',
    name: '',
    rounds: [{ label: 'Groups', eventIds: [], pickemPayouts: [0, 5] }],
  })
  const [tournaments, setTournaments] = useState<GambaTournament[]>([])
  const [races, setRaces] = useState<Array<{ id: string; name: string; listing?: string }>>([])
  const [draft, setDraft] = useState<GambaTournament>(blank())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => {
    adminApi.gambaTournaments().then((payload) => setTournaments(payload.tournaments)).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
    adminApi.gambaEvents().then((payload) => setRaces(payload.events)).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
  }
  useEffect(() => { void load() }, [])
  const eligible = races.filter((race) => race.listing === 'tournament')
  const setRound = (index: number, patch: Partial<GambaTournament['rounds'][number]>) => {
    const rounds = draft.rounds.slice()
    const next = { ...rounds[index], ...patch }
    if (patch.eventIds) next.pickemPayouts = resizePayouts(next.pickemPayouts || [], patch.eventIds.length)
    rounds[index] = next
    setDraft({ ...draft, rounds })
  }
  const save = async () => {
    setBusy(true)
    setError('')
    try {
      await adminApi.saveGambaTournament(draft)
      setDraft(blank())
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }
  return <section>
    <h2>Tournaments</h2>
    <p className="muted">Save the rounds first, then add races from the tournament page. A round can be empty until its races exist.</p>
    {error && <p className="notice error">{error}</p>}
    <ul>
      {tournaments.map((tournament) => (
        <li key={tournament.id}>
          <button type="button" className="text-button" onClick={() => setDraft(tournament)}>{tournament.name}</button>
          {' '}
          <button type="button" onClick={async () => {
            if (!window.confirm(`Delete ${tournament.name}?`)) return
            setBusy(true)
            try {
              await adminApi.removeGambaTournament(tournament.id)
              if (draft.id === tournament.id) setDraft(blank())
              await load()
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : String(reason))
            } finally { setBusy(false) }
          }}>Delete</button>
        </li>
      ))}
      {!tournaments.length && <li>No tournaments yet.</li>}
    </ul>
    <label className="admin-field">Tournament name
      <input value={draft.name} onChange={(input) => setDraft({ ...draft, name: input.target.value })} />
    </label>
    {draft.rounds.map((round, index) => (
      <div key={index} className="admin-field">
        <label>Round name
          <input value={round.label} onChange={(input) => setRound(index, { label: input.target.value })} />
        </label>
        <label>Races in this round
          <select multiple size={Math.min(8, Math.max(3, eligible.length))} value={round.eventIds} onChange={(input) => {
            const eventIds = [...input.target.selectedOptions].map((option) => option.value)
            setRound(index, { eventIds })
          }}>
            {eligible.map((race) => <option key={race.id} value={race.id}>{race.name}</option>)}
          </select>
        </label>
        <div>
          {(round.pickemPayouts || []).map((payout, correct) => (
            <label key={correct}> {correct} correct
              <input inputMode="decimal" value={payout} onChange={(input) => {
                const pickemPayouts = (round.pickemPayouts || []).slice()
                pickemPayouts[correct] = Number(input.target.value)
                setRound(index, { pickemPayouts })
              }} />
            </label>
          ))}
        </div>
        {draft.rounds.length > 1 && <button type="button" onClick={() => setDraft({ ...draft, rounds: draft.rounds.filter((_, item) => item !== index) })}>Remove round</button>}
      </div>
    ))}
    <div className="admin-row">
      {draft.rounds.length < 8 && <button type="button" onClick={() => setDraft({ ...draft, rounds: [...draft.rounds, { label: '', eventIds: [], pickemPayouts: [5] }] })}>Add round</button>}
      <button type="button" className="primary" disabled={busy} onClick={() => void save()}>{draft.id ? 'Update tournament' : 'Save tournament'}</button>
      {draft.id && <button type="button" onClick={() => setDraft(blank())}>New tournament</button>}
    </div>
  </section>
}

export function GambaEventEditor({ eventId, creating, owner, navigate }: {
  eventId?: string
  creating?: boolean
  owner: boolean
  navigate: (to: string) => void
}) {
  const [event, setEvent] = useState<GambaEvent>(EMPTY)
  const [file, setFile] = useState('')
  const [blobSha, setBlobSha] = useState<string | null>(null)
  const [message, setMessage] = useState(creating ? 'admin: add gamba event' : `admin: update gamba event ${eventId || ''}`)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!owner || creating || !eventId) return
    adminApi.gambaEvent(eventId).then((payload) => {
      setEvent({ ...payload.event, threadId: payload.event.threadId || '', startsAt: payload.event.startsAt || '', endsAt: payload.event.endsAt || '' })
      setFile(payload.file)
      setBlobSha(payload.blobSha)
    }).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
  }, [owner, creating, eventId])
  if (!owner) return <p>Gamba events are visible to the bot owner only.</p>
  const set = (patch: Partial<GambaEvent>) => setEvent((current) => ({ ...current, ...patch }))
  const setEntry = (index: number, patch: Partial<GambaEntry>) => {
    const entries = event.entries.slice()
    entries[index] = { ...entries[index], ...patch }
    set({ entries })
  }
  const save = async () => {
    setBusy(true); setConflict(''); setError('')
    try {
      const saved = await adminApi.saveGambaEvent({
        event: {
          ...event,
          startsAt: event.startsAt || null,
          endsAt: event.endsAt || null,
          threadId: event.threadId || null,
        },
        file: file || undefined,
        creating,
        message,
        baseBlobSha: blobSha,
      })
      navigate(`/admin/gamba/edit?key=${encodeURIComponent(saved.id)}`)
    } catch (reason) {
      if (reason instanceof AdminError && reason.status === 409) setConflict(reason.message)
      else setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(false) }
  }
  return <section className="admin-grid">
    <h1>{creating ? 'New gamba event' : event.name || eventId}</h1>
    {error && <p className="notice error">{error}</p>}
    <div className="field-pair">
      <label className="admin-field">ID
        <input value={event.id} disabled={!owner || !creating} onChange={(input) => set({ id: input.target.value })} />
      </label>
      <label className="admin-field">Name
        <input value={event.name} disabled={!owner} onChange={(input) => set({ name: input.target.value })} />
      </label>
    </div>
    <div className="field-pair">
      <label className="admin-field">Starts
        <input value={event.startsAt || ''} placeholder="2026-10-19T00:00:00+07:00" disabled={!owner} onChange={(input) => set({ startsAt: input.target.value })} />
      </label>
      <label className="admin-field">Ends
        <input value={event.endsAt || ''} placeholder="2026-10-20T01:00:00+07:00" disabled={!owner} onChange={(input) => set({ endsAt: input.target.value })} />
      </label>
    </div>
    <div className="field-pair">
      <label className="admin-field">Availability
        <select value={event.availability} disabled={!owner} onChange={(input) => set({ availability: input.target.value })}>
          <option value="all">All servers</option>
          <option value="guilds">Selected servers</option>
        </select>
      </label>
      <label className="admin-field">Status
        <select value={event.status} disabled={!owner} onChange={(input) => set({ status: input.target.value })}>
          {['scheduled', 'open', 'closed', 'settled'].map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      </label>
    </div>
    {event.availability === 'guilds' && <label className="admin-field">Guild IDs, one per line
      <textarea value={event.guildIds.join('\n')} disabled={!owner} onChange={(input) => set({ guildIds: input.target.value.split('\n').map((line) => line.trim()).filter(Boolean) })} />
    </label>}
    <label className="admin-field">Thread ID
      <input value={event.threadId || ''} disabled={!owner} onChange={(input) => set({ threadId: input.target.value })} />
    </label>
    <div className="string-list">
      <div className="entry-head"><span>No.</span><span>Name</span><span>Age/sex</span><span>Jockey</span><span>Odds</span><span></span></div>
      {event.entries.map((entry, index) => (
        <div className="entry-row" key={index}>
          <input type="number" value={entry.number} disabled={!owner} onChange={(input) => setEntry(index, { number: Number(input.target.value) })} />
          <input value={entry.name} disabled={!owner} onChange={(input) => setEntry(index, { name: input.target.value })} />
          <input value={entry.ageSex} disabled={!owner} onChange={(input) => setEntry(index, { ageSex: input.target.value })} />
          <input value={entry.jockey} disabled={!owner} onChange={(input) => setEntry(index, { jockey: input.target.value })} />
          <input type="number" step="0.1" value={entry.odds} disabled={!owner} onChange={(input) => setEntry(index, { odds: Number(input.target.value) })} />
          <button type="button" disabled={!owner} onClick={() => set({ entries: event.entries.filter((_, item) => item !== index) })}>Remove</button>
        </div>
      ))}
      {owner && <button type="button" onClick={() => set({ entries: [...event.entries, { number: event.entries.length + 1, name: '', ageSex: '', jockey: '', odds: 2 }] })}>Add entry</button>}
    </div>
    <label className="admin-field">Commit message
      <input value={message} disabled={!owner} onChange={(input) => setMessage(input.target.value)} />
    </label>
    {conflict && <p className="notice error">{conflict}</p>}
    <div className="admin-row">
      <button type="button" className="primary" disabled={!owner || busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save to GitHub'}</button>
      {!creating && owner && <button type="button" disabled={busy} onClick={async () => {
        if (!window.confirm('Delete this gamba event from GitHub?')) return
        setBusy(true)
        try {
          await adminApi.removeGambaEvent(eventId || event.id, blobSha, message || `admin: delete gamba event ${event.id}`)
          navigate('/admin/gamba')
        } catch (reason) {
          if (reason instanceof AdminError && reason.status === 409) setConflict(reason.message)
          else setError(reason instanceof Error ? reason.message : String(reason))
        } finally { setBusy(false) }
      }}>Delete</button>}
    </div>
  </section>
}
