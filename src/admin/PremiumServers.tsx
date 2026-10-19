import { useEffect, useState } from 'react'
import { adminApi } from './api'

type Guild = { guildId: string; premium: boolean; fromEnv: boolean; stored: boolean; note: string; endsAt: string | null }

function toLocalInput(iso: string | null) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function PremiumServers({ owner }: { owner: boolean }) {
  const [guilds, setGuilds] = useState<Guild[]>([])
  const [guildId, setGuildId] = useState('')
  const [error, setError] = useState('')
  const load = () => adminApi.premium().then((payload) => setGuilds(payload.guilds)).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
  useEffect(() => { if (owner) load() }, [owner])
  if (!owner) return <p>Premium servers are visible to the bot owner only.</p>
  const save = async (id: string, body: { enabled?: boolean; note?: string; endsAt?: string | null; extendMonth?: boolean }) => {
    setError('')
    try {
      await adminApi.setPremium(id, body)
      await load()
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      return false
    }
  }
  return <section className="admin-grid">
    <h1>Premium servers</h1>
    {error && <p className="notice error">{error}</p>}
    <p className="muted">Premium turns off when the end time passes. A server pinned in the environment stays on.</p>
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Server</th>
            <th>Premium</th>
            <th>Notes</th>
            <th>Ends</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {guilds.map((guild) => (
            <tr key={guild.guildId}>
              <td>{guild.guildId}{guild.fromEnv ? ' · env' : ''}</td>
              <td>{guild.premium ? 'On' : 'Off'}</td>
              <td>
                <input
                  aria-label={`Notes for ${guild.guildId}`}
                  defaultValue={guild.note}
                  key={`${guild.guildId}-${guild.note}`}
                  onBlur={(event) => {
                    if (event.target.value !== guild.note) void save(guild.guildId, { note: event.target.value })
                  }}
                />
              </td>
              <td>
                <input
                  type="datetime-local"
                  aria-label={`End time for ${guild.guildId}`}
                  defaultValue={toLocalInput(guild.endsAt)}
                  key={`${guild.guildId}-${guild.endsAt || ''}`}
                  onBlur={(event) => {
                    if (event.target.value === toLocalInput(guild.endsAt)) return
                    const next = event.target.value ? new Date(event.target.value).toISOString() : null
                    void save(guild.guildId, { endsAt: next })
                  }}
                />
              </td>
              <td className="row-actions">
                <button type="button" onClick={() => void save(guild.guildId, { extendMonth: true })}>Add 1 month</button>
                <button type="button" disabled={guild.fromEnv && guild.premium} onClick={() => void save(guild.guildId, { enabled: !guild.premium })}>
                  {guild.premium ? 'Turn off' : 'Turn on'}
                </button>
              </td>
            </tr>
          ))}
          {!guilds.length && <tr><td colSpan={5}>No premium servers yet.</td></tr>}
        </tbody>
      </table>
    </div>
    <div className="admin-row">
      <input value={guildId} placeholder="Guild ID" aria-label="Guild ID" onChange={(event) => setGuildId(event.target.value)} />
      <button type="button" className="primary" onClick={() => {
        const id = guildId.trim()
        if (!id) return
        void save(id, { enabled: true }).then((ok) => { if (ok) setGuildId('') })
      }}>Add server</button>
    </div>
  </section>
}
