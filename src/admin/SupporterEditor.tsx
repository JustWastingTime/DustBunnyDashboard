import { useState } from 'react'
import { AdminError, adminApi } from './api'
import { parseEvents } from './lib/parseEvents'
import { Area, Choice, DiffPreview, SaveBar, Text, lines, splitLines, useLoadedEntry } from './entryForm'
import { CARD_EVENT_STATUS, SUPPORT_RARITIES, SUPPORT_TYPES } from './icons'
import { RecordPortrait } from './RecordPortrait'

export function SupporterEditor({ entryKey, creating, owner, navigate }: {
  entryKey?: string
  creating?: boolean
  owner: boolean
  navigate: (to: string) => void
}) {
  const loaded = useLoadedEntry('supporters', entryKey, creating)
  const entry = loaded.entry
  const [message, setMessage] = useState(creating ? 'admin: add supporter' : `admin: update supporter ${entryKey || ''}`)
  const [busy, setBusy] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [conflict, setConflict] = useState('')
  const [rawMode, setRawMode] = useState(false)
  const [rawText, setRawText] = useState('')
  const [paste, setPaste] = useState('')
  const original = loaded.baseline
  if (loaded.loading) return <p>Loading support card…</p>
  if (!entry) return <p className="notice error">{loaded.error || 'Support card not found.'}</p>
  const draft = rawMode ? safeParse(rawText, entry) : entry
  const set = (patch: Record<string, unknown>) => loaded.setEntry({ ...draft, ...patch })
  const events = Array.isArray(draft.events) ? draft.events as Array<Record<string, unknown>> : []

  const save = async () => {
    setBusy(true); setConflict(''); setWarnings([])
    try {
      const body = { entry: draft, message, baseBlobSha: loaded.blobSha }
      const saved = creating
        ? await adminApi.create('supporters', body)
        : await adminApi.update('supporters', entryKey || String(draft.id || ''), body)
      setWarnings(saved.warnings || [])
      navigate(`/admin/supporters/edit?key=${encodeURIComponent(saved.key || String(draft.id || ''))}`)
      loaded.reload()
    } catch (reason) {
      if (reason instanceof AdminError && reason.status === 409) setConflict(reason.message)
      else loaded.setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(false) }
  }

  return <section className="admin-editor with-card">
    <h1>{creating ? 'New support card' : String(draft.card_name || draft.id || 'Support card')}</h1>
    {loaded.error && <p className="notice error">{loaded.error}</p>}
    <button type="button" onClick={() => { setRawMode(!rawMode); setRawText(JSON.stringify(draft, null, 2)) }}>{rawMode ? 'Form' : 'Raw JSON'}</button>
    <div className="editor-desk">
      {rawMode ? <Area label="JSON" value={rawText} disabled={!owner} onChange={setRawText} /> : <div className="editor-form">
        <Text label="ID" value={String(draft.id || '')} disabled={!owner} onChange={(id) => set({ id })} />
        <Choice label="Event status" value={String(draft._event || 'todo')} options={CARD_EVENT_STATUS} disabled={!owner} onChange={(_event) => set({ _event })} />
        <Text label="Card name" value={String(draft.card_name || '')} disabled={!owner} onChange={(card_name) => set({ card_name })} />
        <Text label="Character" value={String(draft.character_name || '')} disabled={!owner} onChange={(character_name) => set({ character_name })} />
        <Area label="Unique" value={String(draft.unique || '')} disabled={!owner} onChange={(unique) => set({ unique })} />
        <div className="field-pair">
          <Choice label="Rarity" value={String(draft.rarity || 'r')} options={SUPPORT_RARITIES} disabled={!owner} onChange={(rarity) => set({ rarity })} />
          <Choice label="Type" value={String(draft.category || 'speed')} options={SUPPORT_TYPES.map((type) => ({ value: type.id, label: type.label }))} disabled={!owner} onChange={(category) => set({ category })} />
        </div>
        <Text label="URL" value={String(draft.url || '')} disabled={!owner} onChange={(url) => set({ url })} />
        <Text label="Thumbnail" value={String(draft.thumbnail || '')} disabled={!owner} onChange={(thumbnail) => set({ thumbnail })} />
        <Area label="Aliases" value={lines(draft.aliases)} disabled={!owner} onChange={(value) => set({ aliases: splitLines(value) })} />
        <Area label="Effects" value={lines(draft.effects)} disabled={!owner} onChange={(value) => set({ effects: splitLines(value) })} />
        <Area label="Support skills" value={lines(draft.support_skills)} disabled={!owner} onChange={(value) => set({ support_skills: splitLines(value) })} />
        <Area label="Event skills" value={lines(draft.event_skills)} disabled={!owner} onChange={(value) => set({ event_skills: splitLines(value) })} />
        <Area label="Events JSON" value={JSON.stringify(events, null, 2)} disabled={!owner} onChange={(value) => { try { set({ events: JSON.parse(value) }) } catch { /* typing */ } }} />
        <Area label="Paste events" value={paste} disabled={!owner} onChange={setPaste} />
        {owner && <button type="button" onClick={() => set({ events: [...events, ...parseEvents(paste)] })}>Append parsed events</button>}
      </div>}
      <RecordPortrait
        dataset="supporters"
        currentKey={String(draft.id || entryKey || '')}
        name={String(draft.character_name || '')}
        image={supportArt(String(draft.id || entryKey || '')) || String(draft.thumbnail || '')}
        heading={String(draft.character_name || 'Support card')}
        detail={String(draft.card_name || '')}
        url={String(draft.url || '')}
        navigate={navigate}
      />
    </div>
    <h2>Diff</h2>
    <DiffPreview before={original} after={draft} />
    <SaveBar owner={owner && Boolean(loaded.blobSha)} message={message} setMessage={setMessage} busy={busy} onSave={save} warnings={warnings} conflict={conflict} reload={loaded.reload} onDelete={!creating && owner ? async () => {
      if (!window.confirm('Delete this support card from GitHub?')) return
      setBusy(true)
      try {
        await adminApi.remove('supporters', entryKey || '', loaded.blobSha, message || `admin: delete supporter ${entryKey}`)
        navigate('/admin/supporters')
      } catch (reason) {
        if (reason instanceof AdminError && reason.status === 409) setConflict(reason.message)
        else loaded.setError(reason instanceof Error ? reason.message : String(reason))
      } finally { setBusy(false) }
    } : undefined} />
  </section>
}

function supportArt(id: string) {
  const match = id.match(/\d+/)
  return match ? `https://media.gametora.com/umamusume/supports/full/small/${match[0]}.png` : ''
}

function safeParse(text: string, fallback: Record<string, unknown>) {
  try { return JSON.parse(text) as Record<string, unknown> } catch { return fallback }
}
