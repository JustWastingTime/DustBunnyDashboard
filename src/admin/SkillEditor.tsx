import { useState } from 'react'
import { AdminError, adminApi } from './api'
import { suggestActivationMap } from './lib/activationMap'
import { convertConditions } from './lib/convertConditions'
import { Area, DiffPreview, SaveBar, Text, lines, splitLines, useLoadedEntry } from './entryForm'

type Effect = { description?: string; conditions?: string[] }

export function SkillEditor({ entryKey, creating, owner, navigate }: {
  entryKey?: string
  creating?: boolean
  owner: boolean
  navigate: (to: string) => void
}) {
  const loaded = useLoadedEntry('skills', entryKey, creating)
  const entry = loaded.entry
  const [message, setMessage] = useState(creating ? 'admin: add skill' : `admin: update skill ${entryKey || ''}`)
  const [busy, setBusy] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [conflict, setConflict] = useState('')
  const [rawMode, setRawMode] = useState(false)
  const [rawText, setRawText] = useState('')
  const [paste, setPaste] = useState('')
  const [proposal, setProposal] = useState('')
  const original = loaded.baseline

  if (loaded.loading) return <p>Loading skill…</p>
  if (!entry) return <p className="notice error">{loaded.error || 'Skill not found.'}</p>

  const draft = rawMode ? safeParse(rawText, entry) : entry
  const effects = Array.isArray(draft.effect) ? draft.effect as Effect[] : []
  const set = (patch: Record<string, unknown>) => loaded.setEntry({ ...draft, ...patch })

  const save = async () => {
    setBusy(true); setConflict(''); setWarnings([])
    try {
      const body = { entry: draft, message, baseBlobSha: loaded.blobSha }
      const saved = creating
        ? await adminApi.create('skills', body)
        : await adminApi.update('skills', entryKey || String(draft.skill_name || ''), body)
      setWarnings(saved.warnings || [])
      navigate(`/admin/skills/edit?key=${encodeURIComponent(saved.key || String(draft.skill_name || ''))}`)
      loaded.reload()
    } catch (reason) {
      if (reason instanceof AdminError && reason.status === 409) setConflict(reason.message)
      else loaded.setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(false) }
  }

  return <section className="admin-grid">
    <h1>{creating ? 'New skill' : String(draft.skill_name || 'Skill')}</h1>
    {loaded.error && <p className="notice error">{loaded.error}</p>}
    <div className="admin-row">
      <button type="button" onClick={() => { setRawMode(!rawMode); setRawText(JSON.stringify(draft, null, 2)) }}>{rawMode ? 'Form' : 'Raw JSON'}</button>
    </div>
    {rawMode ? <Area label="JSON" value={rawText} disabled={!owner} onChange={setRawText} /> : <div className="admin-grid">
      <Text label="Name" value={String(draft.skill_name || '')} disabled={!owner} onChange={(skill_name) => set({ skill_name })} />
      <Area label="Description" value={String(draft.description || '')} disabled={!owner} onChange={(description) => set({ description })} />
      <Text label="Rarity" value={String(draft.rarity || '')} disabled={!owner} onChange={(rarity) => set({ rarity })} />
      <Text label="Category" value={String(draft.category || '')} disabled={!owner} onChange={(category) => set({ category })} />
      <Text label="Upgrade" value={String(draft.upgrade || '')} disabled={!owner} onChange={(upgrade) => set({ upgrade })} />
      <Text label="Gametora ID" value={String(draft.gametora_id || '')} disabled={!owner} onChange={(gametora_id) => set({ gametora_id })} />
      <Area label="Aliases (one per line)" value={lines(draft.aliases)} disabled={!owner} onChange={(value) => set({ aliases: splitLines(value) })} />
      <Area label="Review" value={String(draft.review || '')} disabled={!owner} onChange={(review) => set({ review })} />
      {effects.map((effect, index) => (
        <fieldset key={index} className="admin-grid">
          <Text label={`Effect ${index + 1} description`} value={String(effect.description || '')} disabled={!owner} onChange={(description) => {
            const next = effects.slice()
            next[index] = { ...effect, description }
            set({ effect: next })
          }} />
          <Area label="Conditions (one per line)" value={lines(effect.conditions)} disabled={!owner} onChange={(value) => {
            const next = effects.slice()
            next[index] = { ...effect, conditions: splitLines(value) }
            set({ effect: next })
          }} />
        </fieldset>
      ))}
      {owner && <button type="button" onClick={() => set({ effect: [...effects, { description: '', conditions: [] }] })}>Add effect</button>}
      <Area label="Activation map JSON" value={JSON.stringify(draft.activation_map ?? { show_chart: false }, null, 2)} disabled={!owner} onChange={(value) => {
        try { set({ activation_map: JSON.parse(value) }) } catch { /* keep typing */ }
      }} />
      <Area label="Paste condition code" value={paste} disabled={!owner} onChange={setPaste} />
      {owner && <button type="button" onClick={() => {
        const converted = convertConditions(paste)
        const next = effects.length ? effects.slice() : [{ description: '', conditions: [] }]
        next[0] = { ...next[0], conditions: converted.lines }
        const map = suggestActivationMap(paste)
        setProposal(map ? JSON.stringify(map, null, 2) : 'No activation map suggested.')
        set({ effect: next, ...(map ? { activation_map: map } : {}) })
      }}>Convert into the first effect</button>}
      {proposal && <pre className="diff">{proposal}</pre>}
    </div>}
    <h2>Diff</h2>
    <DiffPreview before={original} after={draft} />
    <SaveBar owner={owner && Boolean(loaded.blobSha)} message={message} setMessage={setMessage} busy={busy} onSave={save} warnings={warnings} conflict={conflict} reload={loaded.reload} onDelete={!creating && owner ? async () => {
      if (!window.confirm('Delete this skill from GitHub?')) return
      setBusy(true)
      try {
        await adminApi.remove('skills', entryKey || '', loaded.blobSha, message || `admin: delete skill ${entryKey}`)
        navigate('/admin/skills')
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
