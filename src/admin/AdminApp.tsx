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
import { ActivationTool } from './tools/ActivationTool'
import { ConditionTool } from './tools/ConditionTool'
import { EventTool } from './tools/EventTool'
import { VisualizerTool } from './tools/VisualizerTool'
import './admin.css'

const LINKS = [
  ['/admin', 'Home'],
  ['/admin/skills', 'Skills'],
  ['/admin/supporters', 'Supporters'],
  ['/admin/characters', 'Umas'],
  ['/admin/gamba', 'Gamba events'],
  ['/admin/tools/conditions', 'Condition converter'],
  ['/admin/tools/events', 'Event formatter'],
  ['/admin/tools/activation', 'Activation map'],
  ['/admin/tools/visualizer', 'Skill visualizer'],
  ['/admin/premium', 'Premium servers'],
  ['/admin/clubs', 'Clubs'],
  ['/admin/assets', 'Other assets'],
  ['/admin/audit', 'Audit log'],
] as const

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
  else if (name.startsWith('/admin/tools/conditions')) body = <ConditionTool />
  else if (name.startsWith('/admin/tools/events')) body = <EventTool />
  else if (name.startsWith('/admin/tools/activation')) body = <ActivationTool />
  else if (name.startsWith('/admin/tools/visualizer')) body = <VisualizerTool />
  else if (name.startsWith('/admin/premium')) body = <PremiumServers owner={owner} />
  else if (name.startsWith('/admin/clubs')) body = <ClubsOverview owner={owner} />
  else if (name.startsWith('/admin/assets')) body = <RawAssetEditor owner={owner} asset={key} navigate={go} />
  else if (name.startsWith('/admin/audit')) body = <AuditLog owner={owner} />

  return <div className="admin-shell">
    <nav className="admin-nav">
      <strong>Tazuna admin</strong>
      {LINKS.map(([href, label]) => (
        <a key={href} href={href} className={name === href ? 'active' : ''} onClick={(event) => { event.preventDefault(); go(href) }}>{label}</a>
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

function Home() {
  return <section>
    <h1>Data dashboard</h1>
    <p>Browse skills, support cards, and umas. Owners can edit them; each save is a commit on the bot repo and updates the copy running on the server.</p>
  </section>
}
