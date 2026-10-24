import { useState } from 'react'
import { AdminError, adminApi } from './api'
import { CharacterFields, CharacterStats, UmaTypeField } from './CharacterFields'
import { Area, Choice, DiffPreview, SaveBar, Text, useLoadedEntry } from './entryForm'
import { UMA_RARITIES } from './icons'
import { RecordPortrait } from './RecordPortrait'

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
      const body = { entry: cleanCharacter(draft), message, baseBlobSha: loaded.blobSha }
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
  return <section className="admin-editor with-card">
    <h1>{creating ? 'New uma' : String(draft.character_name || draft.id || 'Uma')}</h1>
    {loaded.error && <p className="notice error">{loaded.error}</p>}
    <button type="button" onClick={() => { setRawMode(!rawMode); setRawText(JSON.stringify(draft, null, 2)) }}>{rawMode ? 'Form' : 'Raw JSON'}</button>
    <div className="editor-desk">
      {rawMode ? <Area label="JSON" value={rawText} disabled={!owner} onChange={setRawText} /> : <div className="editor-form">
        <Text label="ID" value={String(draft.id || '')} disabled={!owner} onChange={(id) => set({ id })} />
        <Text label="Name" value={String(draft.character_name || '')} disabled={!owner} onChange={(character_name) => set({ character_name })} />
        <div className="field-pair">
          <UmaTypeField value={String(draft.type || '')} disabled={!owner} onChange={(type) => set({ type })} />
          <Choice label="Rarity" value={String(draft.rarity || '⭐⭐⭐')} options={UMA_RARITIES} disabled={!owner} onChange={(rarity) => set({ rarity })} />
        </div>
        <Text label="Costume" value={String(draft.costume || '')} disabled={!owner} onChange={(costume) => set({ costume })} />
        <CharacterStats draft={draft} owner={owner} onChange={loaded.setEntry} />
        <Text label="Unique skill" value={String(draft.unique || '')} disabled={!owner} onChange={(unique) => set({ unique })} />
        <CharacterFields draft={draft} owner={owner} onChange={loaded.setEntry} />
        <Area label="Aliases" value={aliasesText(draft.aliases)} disabled={!owner} onChange={(value) => set({ aliases: value.split('\n').map((line) => line.trim()).filter(Boolean) })} />
        <Text label="URL" value={String(draft.url || '')} disabled={!owner} onChange={(url) => set({ url })} />
        <Text label="Thumbnail" value={String(draft.thumbnail || '')} disabled={!owner} onChange={(thumbnail) => set({ thumbnail })} />
        <Area label="Review" value={String(draft.review || '')} disabled={!owner} onChange={(review) => set({ review })} />
        <Area label="Secrets JSON" value={JSON.stringify(draft.secrets ?? [], null, 2)} disabled={!owner} onChange={(value) => { try { set({ secrets: JSON.parse(value) }) } catch { /* typing */ } }} />
      </div>}
      <RecordPortrait
        dataset="characters"
        currentKey={String(draft.id || entryKey || '')}
        name={String(draft.character_name || '')}
        image={String(draft.thumbnail || '')}
        heading={String(draft.character_name || 'Uma')}
        detail={[draft.type, draft.costume].filter(Boolean).join(' ')}
        url={String(draft.url || '')}
        navigate={navigate}
      />
    </div>
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

function aliasesText(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).join('\n') : ''
}

function cleanList(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : []
}

function cleanCharacter(draft: Record<string, unknown>) {
  const next = { ...draft }
  for (const key of ['skills', 'potential', 'event_skills', 'races']) {
    if (Array.isArray(next[key])) next[key] = cleanList(next[key])
  }
  if (Array.isArray(next.evo_skills)) {
    const skills = cleanList(next.evo_skills)
    if (skills.length) next.evo_skills = skills
    else delete next.evo_skills
  }
  if (String(next.type || 'Original') !== 'Original' && cleanList(next.races).length === 0) delete next.races
  return next
}
