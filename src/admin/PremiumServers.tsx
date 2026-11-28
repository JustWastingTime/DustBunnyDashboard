import { Fragment, useEffect, useMemo, useState } from 'react'
import { adminApi, type PremiumGuild } from './api'
import { Badge, FilterChips, SortTh, TableToolbar } from './table'
import { formatWhen, matchesQuery, relativeWhen, stamp, useSorted } from './tableData'

const SOON_MS = 7 * 24 * 60 * 60 * 1000

type Filter = 'all' | 'on' | 'soon' | 'off'

function toLocalInput(iso: string | null) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function endingSoon(guild: PremiumGuild, now: number) {
  const ends = stamp(guild.endsAt)
  return guild.premium && !guild.fromEnv && ends != null && ends - now < SOON_MS
}

function statusOf(guild: PremiumGuild, now: number) {
  if (guild.fromEnv) return { rank: 0, badge: <Badge tone="info" title="Set by PREMIUM_GUILD_IDS on the server, so it can't be turned off here.">Pinned</Badge> }
  if (!guild.premium) return { rank: 3, badge: <Badge tone="off">Off</Badge> }
  if (endingSoon(guild, now)) return { rank: 1, badge: <Badge tone="warn">Ends soon</Badge> }
  return { rank: 2, badge: <Badge tone="on">On</Badge> }
}

export function PremiumServers({ owner }: { owner: boolean }) {
  const [guilds, setGuilds] = useState<PremiumGuild[]>([])
  const [loaded, setLoaded] = useState(false)
  const [guildId, setGuildId] = useState('')
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [editing, setEditing] = useState('')
  const [draft, setDraft] = useState({ note: '', endsAt: '' })
  const [busy, setBusy] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const load = () => adminApi.premium()
    .then((payload) => { setGuilds(payload.guilds); setNow(Date.now()) })
    .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
    .finally(() => setLoaded(true))
  useEffect(() => { if (owner) void load() }, [owner])

  const counts = useMemo(() => ({
    all: guilds.length,
    on: guilds.filter((guild) => guild.premium).length,
    soon: guilds.filter((guild) => endingSoon(guild, now)).length,
    off: guilds.filter((guild) => !guild.premium).length,
  }), [guilds, now])
  const filtered = useMemo(() => guilds.filter((guild) => {
    if (filter === 'on' && !guild.premium) return false
    if (filter === 'off' && guild.premium) return false
    if (filter === 'soon' && !endingSoon(guild, now)) return false
    return matchesQuery(query, guild.name, guild.guildId, guild.note, guild.slug)
  }), [guilds, filter, query, now])
  const columns = useMemo(() => ({
    name: (guild: PremiumGuild) => (guild.name || '').toLowerCase() || null,
    status: (guild: PremiumGuild) => statusOf(guild, now).rank,
    ends: (guild: PremiumGuild) => stamp(guild.endsAt),
    clubs: (guild: PremiumGuild) => guild.clubCount ?? 0,
  }), [now])
  const { sorted, sort, toggle } = useSorted(filtered, columns, { key: 'status', dir: 'asc' })

  if (!owner) return <p>Premium servers are visible to the bot owner only.</p>

  const save = async (id: string, body: { enabled?: boolean; note?: string; endsAt?: string | null; extendMonth?: boolean }) => {
    setError('')
    setBusy(id)
    try {
      await adminApi.setPremium(id, body)
      await load()
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      return false
    } finally {
      setBusy('')
    }
  }
  const startEdit = (guild: PremiumGuild) => {
    setEditing(guild.guildId)
    setDraft({ note: guild.note, endsAt: toLocalInput(guild.endsAt) })
  }
  const saveEdit = async (guild: PremiumGuild) => {
    const body: { note?: string; endsAt?: string | null } = {}
    if (draft.note !== guild.note) body.note = draft.note
    if (draft.endsAt !== toLocalInput(guild.endsAt)) body.endsAt = draft.endsAt ? new Date(draft.endsAt).toISOString() : null
    if (!Object.keys(body).length || await save(guild.guildId, body)) setEditing('')
  }
  const addServer = () => {
    const id = guildId.trim()
    if (!id) return
    void save(id, { enabled: true }).then((ok) => { if (ok) setGuildId('') })
  }

  return <section className="admin-grid">
    <div className="admin-row catalog-head">
      <h1>Premium servers</h1>
      <form className="admin-row add-server" onSubmit={(event) => { event.preventDefault(); addServer() }}>
        <input value={guildId} placeholder="Server ID" aria-label="Server ID to add" inputMode="numeric" onChange={(event) => setGuildId(event.target.value.replace(/[^\d]/g, ''))} />
        <button type="submit" className="primary" disabled={!guildId.trim() || busy === guildId.trim()}>Add server</button>
      </form>
    </div>
    {error && <p className="notice error">{error}</p>}
    <p className="muted">Premium turns off when the end time passes. A pinned server is set in the bot's environment and stays on.</p>
    <TableToolbar query={query} onQuery={setQuery} placeholder="Search name, ID, notes or dashboard" shown={sorted.length} total={guilds.length}>
      <FilterChips<Filter>
        label="Show"
        value={filter}
        onChange={setFilter}
        options={[
          { id: 'all', label: 'All', count: counts.all },
          { id: 'on', label: 'On', count: counts.on },
          { id: 'soon', label: 'Ends within 7 days', count: counts.soon },
          { id: 'off', label: 'Off', count: counts.off },
        ]}
      />
    </TableToolbar>
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <SortTh label="Server" column="name" sort={sort} onSort={toggle} />
            <SortTh label="Status" column="status" sort={sort} onSort={toggle} />
            <SortTh label="Ends" column="ends" sort={sort} onSort={toggle} />
            <SortTh label="Dashboard" column="clubs" sort={sort} onSort={toggle} />
            <th>Notes</th>
            <th><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((guild) => {
            const open = editing === guild.guildId
            return <Fragment key={guild.guildId}>
              <tr className={open ? 'is-editing' : undefined}>
                <td className="cell-main">
                  <strong>{guild.name || <span className="muted">Unknown server</span>}</strong>
                  <code className="cell-sub">{guild.guildId}</code>
                </td>
                <td>{statusOf(guild, now).badge}</td>
                <td className="nowrap">
                  {guild.fromEnv
                    ? <span className="muted">Never</span>
                    : guild.endsAt
                      ? <><span>{formatWhen(guild.endsAt)}</span><span className="cell-sub">{relativeWhen(guild.endsAt, now)}</span></>
                      : <span className="muted">{guild.premium ? 'No end date' : '—'}</span>}
                </td>
                <td className="nowrap">
                  {guild.slug ? <a href={`/g/${guild.slug}`} target="_blank" rel="noreferrer">/g/{guild.slug}</a> : <span className="muted">No site</span>}
                  <span className="cell-sub">{guild.clubCount ?? 0} {(guild.clubCount ?? 0) === 1 ? 'club' : 'clubs'}</span>
                </td>
                <td className="cell-note">{guild.note || <span className="muted">—</span>}</td>
                <td><div className="row-actions">
                  <button type="button" onClick={() => (open ? setEditing('') : startEdit(guild))}>{open ? 'Cancel' : 'Edit'}</button>
                  {!guild.fromEnv && <button type="button" disabled={busy === guild.guildId} onClick={() => void save(guild.guildId, { extendMonth: true })}>+1 month</button>}
                  {!guild.fromEnv && <button type="button" disabled={busy === guild.guildId} onClick={() => void save(guild.guildId, { enabled: !guild.premium })}>
                    {guild.premium ? 'Turn off' : 'Turn on'}
                  </button>}
                </div></td>
              </tr>
              {open && <tr className="edit-row">
                <td colSpan={6}>
                  <form className="edit-grid" onSubmit={(event) => { event.preventDefault(); void saveEdit(guild) }}>
                    <label className="admin-field">Notes
                      <input value={draft.note} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} />
                    </label>
                    <label className="admin-field">Ends
                      <input type="datetime-local" value={draft.endsAt} disabled={guild.fromEnv} onChange={(event) => setDraft((current) => ({ ...current, endsAt: event.target.value }))} />
                    </label>
                    <div className="row-actions">
                      <button type="submit" className="primary" disabled={busy === guild.guildId}>{busy === guild.guildId ? 'Saving…' : 'Save'}</button>
                      {draft.endsAt && !guild.fromEnv && <button type="button" onClick={() => setDraft((current) => ({ ...current, endsAt: '' }))}>Clear end date</button>}
                    </div>
                  </form>
                </td>
              </tr>}
            </Fragment>
          })}
          {loaded && !sorted.length && <tr><td colSpan={6} className="muted">{guilds.length ? 'No servers match.' : 'No premium servers yet. Add one with its server ID above.'}</td></tr>}
          {!loaded && <tr><td colSpan={6} className="muted">Loading servers…</td></tr>}
        </tbody>
      </table>
    </div>
  </section>
}
