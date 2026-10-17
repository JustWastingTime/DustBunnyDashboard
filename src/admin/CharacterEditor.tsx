import { useState } from 'react'
import { AdminError, adminApi } from './api'
import { Area, Choice, DiffPreview, SaveBar, Text, lines, splitLines, useLoadedEntry } from './entryForm'
import { UMA_RARITIES, UMA_TYPES } from './icons'

export function CharacterEditor({ entryKey, creating, owner, navigate }: {
  entryKey?: string
  creating?: boolean
  owner: boolean
  navigate: (to: string) => void
}) {
  const loaded = useLoadedEntry('characters', entryKey, creating)
  const entry = loaded.entry
  const [message, setMessage] = useState(creating ? 'admin: add character' : `admin: update character ${entryKey || ''}`)
  const [busy, setBusy] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [conflict, setConflict] = useState('')
  const [rawMode, setRawMode] = useState(false)
  const [rawText, setRawText] = useState('')
  const original = loaded.baseline
  if (loaded.loading) return <p>Loading uma…</p>
  if (!entry) return <p className="notice error">{loaded.error || 'Uma not found.'}</p>
  const draft = rawMode ? safeParse(rawText, entry) : entry
  const set = (patch: Record<string, unknown>) => loaded.setEntry({ ...draft, ...patch })
  const save = async () => {
    setBusy(true); setConflict(''); setWarnings([])
    try {
      const body = { entry: draft, message, baseBlobSha: loaded.blobSha }
      const saved = creating
        ? await adminApi.create('characters', body)
        : await adminApi.update('characters', entryKey || String(draft.id || ''), body)
      setWarnings(saved.warnings || [])
      navigate(`/admin/characters/edit?key=${encodeURIComponent(saved.key || String(draft.id || ''))}`)
      loaded.reload()
    } catch (reason) {
      if (reason instanceof AdminError && reason.status === 409) setConflict(reason.message)
      else loaded.setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(false) }
  }
  return <section className="admin-grid">
    <h1>{creating ? 'New uma' : String(draft.character_name || draft.id || 'Uma')}</h1>
    {loaded.error && <p className="notice error">{loaded.error}</p>}
    <button type="button" onClick={() => { setRawMode(!rawMode); setRawText(JSON.stringify(draft, null, 2)) }}>{rawMode ? 'Form' : 'Raw JSON'}</button>
    {rawMode ? <Area label="JSON" value={rawText} disabled={!owner} onChange={setRawText} /> : <div className="admin-grid">
      <Text label="ID" value={String(draft.id || '')} disabled={!owner} onChange={(id) => set({ id })} />
      <Text label="Name" value={String(draft.character_name || '')} disabled={!owner} onChange={(character_name) => set({ character_name })} />
      <div className="field-pair">
        <Choice label="Type" value={String(draft.type || 'Original')} options={UMA_TYPES} disabled={!owner} onChange={(type) => set({ type })} />
        <Choice label="Rarity" value={String(draft.rarity || '⭐⭐⭐')} options={UMA_RARITIES} disabled={!owner} onChange={(rarity) => set({ rarity })} />
      </div>
      <Text label="Costume" value={String(draft.costume || '')} disabled={!owner} onChange={(costume) => set({ costume })} />
      <Text label="Unique skill" value={String(draft.unique || '')} disabled={!owner} onChange={(unique) => set({ unique })} />
      <Area label="Unique explanation" value={String(draft.unique_explanation || '')} disabled={!owner} onChange={(unique_explanation) => set({ unique_explanation })} />
      <Area label="Skills" value={lines(draft.skills)} disabled={!owner} onChange={(value) => set({ skills: splitLines(value) })} />
      <Area label="Potential" value={lines(draft.potential)} disabled={!owner} onChange={(value) => set({ potential: splitLines(value) })} />
      <Area label="Event skills" value={lines(draft.event_skills)} disabled={!owner} onChange={(value) => set({ event_skills: splitLines(value) })} />
      <Area label="Races" value={lines(draft.races)} disabled={!owner} onChange={(value) => set({ races: splitLines(value) })} />
      <Area label="Aliases" value={lines(draft.aliases)} disabled={!owner} onChange={(value) => set({ aliases: splitLines(value) })} />
      <Text label="URL" value={String(draft.url || '')} disabled={!owner} onChange={(url) => set({ url })} />
      <Text label="Thumbnail" value={String(draft.thumbnail || '')} disabled={!owner} onChange={(thumbnail) => set({ thumbnail })} />
      <Area label="Review" value={String(draft.review || '')} disabled={!owner} onChange={(review) => set({ review })} />
      <Area label="Stat bonuses JSON" value={JSON.stringify(draft.stat_bonuses ?? [], null, 2)} disabled={!owner} onChange={(value) => { try { set({ stat_bonuses: JSON.parse(value) }) } catch { /* typing */ } }} />
      <Area label="Aptitudes JSON" value={JSON.stringify(draft.aptitudes ?? [], null, 2)} disabled={!owner} onChange={(value) => { try { set({ aptitudes: JSON.parse(value) }) } catch { /* typing */ } }} />
      <Area label="Secrets JSON" value={JSON.stringify(draft.secrets ?? [], null, 2)} disabled={!owner} onChange={(value) => { try { set({ secrets: JSON.parse(value) }) } catch { /* typing */ } }} />
    </div>}
    <h2>Diff</h2>
    <DiffPreview before={original} after={draft} />
    <SaveBar owner={owner && Boolean(loaded.blobSha)} message={message} setMessage={setMessage} busy={busy} onSave={save} warnings={warnings} conflict={conflict} reload={loaded.reload} onDelete={!creating && owner ? async () => {
      if (!window.confirm('Delete this uma from GitHub?')) return
      setBusy(true)
      try {
        await adminApi.remove('characters', entryKey || '', loaded.blobSha, message || `admin: delete character ${entryKey}`)
        navigate('/admin/characters')
      } catch (reason) {
        if (reason instanceof AdminError && reason.status === 409) setConflict(reason.message)
        else loaded.setError(reason instanceof Error ? reason.message : String(reason))
      } finally { setBusy(false) }
    } : undefined} />
  </section>
}

function safeParse(text: string, fallback: Record<string, unknown>) {
  try { return JSON.parse(text) as Record<string, unknown> } catch { return fallback }
}
