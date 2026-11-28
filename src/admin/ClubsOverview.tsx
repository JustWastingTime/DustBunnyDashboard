import { useEffect, useMemo, useState } from 'react'
import { adminApi, type ClubGuild } from './api'
import { Badge, FilterChips, SortTh, TableToolbar } from './table'
import { matchesQuery, useSorted } from './tableData'

type Filter = 'all' | 'premium' | 'free'

function serverName(guild: ClubGuild) {
  return guild.name || guild.siteName || ''
}

export function ClubsOverview({ owner }: { owner: boolean }) {
  const [guilds, setGuilds] = useState<ClubGuild[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  useEffect(() => {
    if (!owner) return
    adminApi.clubs()
      .then((payload) => setGuilds(payload.guilds))
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setLoaded(true))
  }, [owner])
  const filtered = useMemo(() => guilds.filter((guild) => {
    if (filter === 'premium' && !guild.premium) return false
    if (filter === 'free' && guild.premium) return false
    return matchesQuery(query, guild.name, guild.siteName, guild.guildId, guild.slug, ...guild.clubs.flatMap((club) => [club.circleName, club.circleId]))
  }), [guilds, filter, query])
  const columns = useMemo(() => ({
    name: (guild: ClubGuild) => serverName(guild).toLowerCase() || null,
    premium: (guild: ClubGuild) => (guild.premium ? 0 : 1),
    clubs: (guild: ClubGuild) => guild.clubs.length,
  }), [])
  const { sorted, sort, toggle } = useSorted(filtered, columns, { key: 'name', dir: 'asc' })
  if (!owner) return <p>Club data is visible to the bot owner only.</p>
  const clubTotal = guilds.reduce((sum, guild) => sum + guild.clubs.length, 0)
  return <section className="admin-grid">
    <div className="admin-row catalog-head">
      <h1>Clubs</h1>
      <span className="muted">{guilds.length} servers · {clubTotal} clubs</span>
    </div>
    {error && <p className="notice error">{error}</p>}
    <TableToolbar query={query} onQuery={setQuery} placeholder="Search server, club name or ID" shown={sorted.length} total={guilds.length}>
      <FilterChips<Filter>
        label="Show"
        value={filter}
        onChange={setFilter}
        options={[
          { id: 'all', label: 'All', count: guilds.length },
          { id: 'premium', label: 'Premium', count: guilds.filter((guild) => guild.premium).length },
          { id: 'free', label: 'Free', count: guilds.filter((guild) => !guild.premium).length },
        ]}
      />
    </TableToolbar>
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <SortTh label="Server" column="name" sort={sort} onSort={toggle} />
            <SortTh label="Plan" column="premium" sort={sort} onSort={toggle} />
            <th>Dashboard</th>
            <SortTh label="Clubs" column="clubs" sort={sort} onSort={toggle} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((guild) => (
            <tr key={guild.guildId}>
              <td className="cell-main">
                <strong>{serverName(guild) || <span className="muted">Unknown server</span>}</strong>
                <code className="cell-sub">{guild.guildId}</code>
              </td>
              <td>{guild.premium ? <Badge tone="on">Premium</Badge> : <Badge tone="off">Free</Badge>}</td>
              <td className="nowrap">
                {guild.slug ? <a href={`/g/${guild.slug}`} target="_blank" rel="noreferrer">/g/{guild.slug}</a> : <span className="muted">No site</span>}
                {guild.siteName && guild.siteName !== serverName(guild) && <span className="cell-sub">{guild.siteName}</span>}
              </td>
              <td>
                {guild.clubs.length
                  ? <ul className="club-chips">
                    {guild.clubs.map((club) => (
                      <li key={club.circleId} title={`Circle ID ${club.circleId}`}>
                        {club.circleName || 'Unnamed'} <code>{club.circleId}</code>
                      </li>
                    ))}
                  </ul>
                  : <span className="muted">No clubs registered</span>}
              </td>
            </tr>
          ))}
          {loaded && !sorted.length && <tr><td colSpan={4} className="muted">{guilds.length ? 'No servers match.' : 'No servers have registered clubs yet.'}</td></tr>}
          {!loaded && <tr><td colSpan={4} className="muted">Loading clubs…</td></tr>}
        </tbody>
      </table>
    </div>
  </section>
}
