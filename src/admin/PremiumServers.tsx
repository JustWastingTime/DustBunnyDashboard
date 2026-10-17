import { useEffect, useState } from 'react'
import { adminApi } from './api'

export function PremiumServers({ owner }: { owner: boolean }) {
  const [guilds, setGuilds] = useState<Array<{ guildId: string; premium: boolean; fromEnv: boolean; stored: boolean }>>([])
  const [guildId, setGuildId] = useState('')
  const [error, setError] = useState('')
  const load = () => adminApi.premium().then((payload) => setGuilds(payload.guilds)).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
  useEffect(() => { if (owner) load() }, [owner])
  if (!owner) return <p>Premium servers are visible to the bot owner only.</p>
  return <section className="admin-grid">
    <h1>Premium servers</h1>
    {error && <p className="notice error">{error}</p>}
    <ul className="admin-list">
      {guilds.map((guild) => (
        <li key={guild.guildId} className="admin-row">
          <span>{guild.guildId}{guild.fromEnv ? ' (env)' : ''}</span>
          <button type="button" disabled={guild.fromEnv && guild.premium} onClick={async () => {
            await adminApi.setPremium(guild.guildId, !guild.premium)
            load()
          }}>{guild.premium ? 'Turn off' : 'Turn on'}</button>
        </li>
      ))}
    </ul>
    <div className="admin-row">
      <input value={guildId} placeholder="Guild ID" onChange={(event) => setGuildId(event.target.value)} />
      <button type="button" onClick={async () => { await adminApi.setPremium(guildId.trim(), true); setGuildId(''); load() }}>Add premium</button>
    </div>
  </section>
}
