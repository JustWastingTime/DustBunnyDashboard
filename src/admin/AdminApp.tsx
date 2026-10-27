import { useEffect, useState } from 'react'
import { authLoginHref } from '../guild'
import { adminApi, type AdminMe } from './api'
import { AuditLog } from './AuditLog'
import { GambaEventEditor, GambaEventList } from './GambaEvents'
import { ClubsOverview } from './ClubsOverview'
import { DataBrowser } from './DataBrowser'
import { CharacterEditor } from './CharacterEditor'
import { SkillEditor } from './SkillEditor'
import { SupporterEditor } from './SupporterEditor'
import { PremiumServers } from './PremiumServers'
import { RawAssetEditor } from './RawAssetEditor'
import { VisualizerTool } from './tools/VisualizerTool'
import './admin.css'

const LIBRARY = [
  ['/admin', 'Home', 'M4 11 12 4l8 7v9a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z'],
  ['/admin/skills', 'Skills', 'M12 3l7 4v10l-7 4-7-4V7z M12 12l7-4M12 12v9M12 12L5 8'],
  ['/admin/supporters', 'Supporters', 'M4 7h16v12H4z M8 7V5h8v2'],
  ['/admin/characters', 'Umas', 'M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4z M5 20a7 7 0 0 1 14 0'],
  ['/admin/gamba', 'Gamba events', 'M4 8h16v10H4z M8 8V6h8v2 M9 13h6'],
  ['/admin/tools/visualizer', 'Skill visualizer', 'M4 19V5h4l2 4h10v10z'],
] as const

const ADMIN = [
  ['/admin/premium', 'Premium servers', 'M12 3l2.2 4.6L19 8.2l-3.5 3.4.8 4.9L12 14.8 7.7 16.5l.8-4.9L5 8.2l4.8-.6z'],
  ['/admin/clubs', 'Clubs', 'M4 20V9l8-5 8 5v11H4z M10 20v-6h4v6'],
  ['/admin/assets', 'Other assets', 'M5 5h6v6H5z M13 5h6v6h-6z M5 13h6v6H5z M13 13h6v6h-6z'],
  ['/admin/audit', 'Audit log', 'M7 4h10v16H7z M10 8h4M10 12h4M10 16h4'],
] as const

function navActive(href: string, name: string) {
  if (href === '/admin') return name === '/admin'
  return name === href || name.startsWith(`${href}/`)
}

function pageOf(path: string) {
  const url = new URL(path, 'http://local')
  const key = url.searchParams.get('key') || ''
  const name = path.replace(/\?.*$/, '')
  return { name, key }
}

export function AdminApp({ path, navigate }: { path: string; navigate: (to: string) => void }) {
  const [me, setMe] = useState<AdminMe | null>(null)
  const [error, setError] = useState('')
  const [showOwnerNote, setShowOwnerNote] = useState(false)
  useEffect(() => {
    adminApi.me().then(setMe).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
  }, [])
  const owner = Boolean(me?.isOwner)
  useEffect(() => {
    if (!owner) return
    setShowOwnerNote(true)
    const timer = window.setTimeout(() => setShowOwnerNote(false), 4000)
    return () => window.clearTimeout(timer)
  }, [owner])
  const { name, key } = pageOf(path)
  const go = (href: string) => navigate(href)

  let body = <Home />
  if (name.startsWith('/admin/skills/new')) body = <SkillEditor creating owner={owner} navigate={go} />
  else if (name.startsWith('/admin/skills/edit')) body = <SkillEditor entryKey={key} owner={owner} navigate={go} />
  else if (name.startsWith('/admin/skills')) body = <DataBrowser dataset="skills" title="Skills" owner={owner} navigate={go} />
  else if (name.startsWith('/admin/supporters/new')) body = <SupporterEditor creating owner={owner} navigate={go} />
  else if (name.startsWith('/admin/supporters/edit')) body = <SupporterEditor entryKey={key} owner={owner} navigate={go} />
  else if (name.startsWith('/admin/supporters')) body = <DataBrowser dataset="supporters" title="Support cards" owner={owner} navigate={go} />
  else if (name.startsWith('/admin/characters/new')) body = <CharacterEditor creating owner={owner} navigate={go} />
  else if (name.startsWith('/admin/characters/edit')) body = <CharacterEditor entryKey={key} owner={owner} navigate={go} />
  else if (name.startsWith('/admin/characters')) body = <DataBrowser dataset="characters" title="Umas" owner={owner} navigate={go} />
  else if (name.startsWith('/admin/gamba/new')) body = <GambaEventEditor creating owner={owner} navigate={go} />
  else if (name.startsWith('/admin/gamba/edit')) body = <GambaEventEditor eventId={key} owner={owner} navigate={go} />
  else if (name.startsWith('/admin/gamba')) body = <GambaEventList owner={owner} navigate={go} />
  else if (name.startsWith('/admin/tools/visualizer')) body = <VisualizerTool />
  else if (name.startsWith('/admin/premium')) body = <PremiumServers owner={owner} />
  else if (name.startsWith('/admin/clubs')) body = <ClubsOverview owner={owner} />
  else if (name.startsWith('/admin/assets')) body = <RawAssetEditor owner={owner} asset={key} navigate={go} />
  else if (name.startsWith('/admin/audit')) body = <AuditLog owner={owner} />

  return <div className="admin-shell">
    <nav className="admin-nav">
      <strong>Tazuna admin</strong>
      {LIBRARY.map(([href, label, icon]) => (
        <a key={href} href={href} className={navActive(href, name) ? 'active' : ''} onClick={(event) => { event.preventDefault(); go(href) }}>
          <NavIcon d={icon} />{label}
        </a>
      ))}
      <p className="nav-label">Administration</p>
      {ADMIN.map(([href, label, icon]) => (
        <a key={href} href={href} className={navActive(href, name) ? 'active' : ''} onClick={(event) => { event.preventDefault(); go(href) }}>
          <NavIcon d={icon} />{label}
        </a>
      ))}
    </nav>
    <main className="admin-main">
      {error && <p className="notice error">{error}</p>}
      {(me == null || (me && !owner) || showOwnerNote) && <div className="admin-banner">
        {me == null && 'Checking Discord login…'}
        {me && !me.authenticated && <span>Read-only. <a href={authLoginHref('/admin')}>Log in with Discord</a> to edit.</span>}
        {me?.authenticated && !owner && <span>Signed in as {me.user?.globalName || me.user?.username}. This account cannot edit.</span>}
        {owner && showOwnerNote && <span>Signed in as {me?.user?.globalName || me?.user?.username}. Saves commit to GitHub.</span>}
      </div>}
      {body}
    </main>
  </div>
}

function NavIcon({ d }: { d: string }) {
  return <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" /></svg>
}

function Home() {
  return <section className="admin-section">
    <h1>Data dashboard</h1>
    <p>Browse skills, support cards, and umas. Owners can edit them; each save is a commit on the bot repo and updates the copy running on the server.</p>
  </section>
}
