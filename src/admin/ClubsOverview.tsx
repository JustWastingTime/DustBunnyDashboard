import { useEffect, useState } from 'react'
import { adminApi } from './api'

type Guild = {
  guildId: string
  slug: string | null
  siteName: string | null
  premium: boolean
  clubs: Array<{ circleId: string; circleName: string | null }>
}

export function ClubsOverview({ owner }: { owner: boolean }) {
  const [guilds, setGuilds] = useState<Guild[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    if (!owner) return
    adminApi.clubs().then((payload) => setGuilds(payload.guilds)).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
  }, [owner])
  if (!owner) return <p>Club data is visible to the bot owner only.</p>
  return <section className="admin-grid">
    <h1>Clubs</h1>
    {error && <p className="notice error">{error}</p>}
    {guilds.map((guild) => (
      <article key={guild.guildId}>
        <h2>{guild.siteName || guild.guildId} {guild.premium ? '· premium' : ''}</h2>
        <p className="muted">{guild.guildId}{guild.slug ? ` · /${guild.slug}` : ''}</p>
        <ul>
          {guild.clubs.map((club) => <li key={club.circleId}>{club.circleName || 'Unnamed'} ({club.circleId})</li>)}
          {!guild.clubs.length && <li>No clubs registered.</li>}
        </ul>
      </article>
    ))}
    {!guilds.length && !error && <p>No guilds have registered clubs yet.</p>}
  </section>
}
