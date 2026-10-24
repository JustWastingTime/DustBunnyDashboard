import { useEffect, useId, useState } from 'react'
import { AdminError, adminApi } from './api'
import { ActivationMapEditor } from './ActivationMapEditor'
import { suggestActivationMap } from './lib/activationMap'
import { convertConditions } from './lib/convertConditions'
import { Area, Choice, DiffPreview, SaveBar, Text, lines, splitLines, useLoadedEntry } from './entryForm'
import { SKILL_CATEGORIES, SKILL_RARITIES } from './icons'
import { SkillMapPreview } from './tools/SkillMapPreview'

type Effect = { description?: string; conditions?: string[]; preconditions?: string[]; inherited?: string }

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
  const [codeByEffect, setCodeByEffect] = useState<Record<number, string>>({})
  const [skillNames, setSkillNames] = useState<string[]>([])
  const original = loaded.baseline

  useEffect(() => {
    let cancelled = false
    adminApi.publicList('skills', '', 5000)
      .then((payload) => {
        if (cancelled) return
        const names = payload.entries.map((item) => item.skill_name).filter(Boolean)
        names.sort((a, b) => a.localeCompare(b))
        setSkillNames(names)
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  if (loaded.loading) return <p>Loading skill…</p>
  if (!entry) return <p className="notice error">{loaded.error || 'Skill not found.'}</p>

  const draft = rawMode ? safeParse(rawText, entry) : entry
  const effects = Array.isArray(draft.effect) ? draft.effect as Effect[] : []
  const set = (patch: Record<string, unknown>) => loaded.setEntry({ ...draft, ...patch })
  const setNameLink = (key: 'upgrade' | 'downgrade', value: string) => {
    const next = { ...draft }
    if (value.trim()) next[key] = value
    else delete next[key]
    loaded.setEntry(next)
  }
  const writeEffect = (index: number, patch: Partial<Effect>) => {
    const next = effects.slice()
    const updated: Effect = { ...effects[index], ...patch }
    if (!updated.preconditions?.length) delete updated.preconditions
    next[index] = updated
    set({ effect: next })
  }

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
      <div className="field-pair">
        <Choice label="Rarity" value={String(draft.rarity || 'normal')} options={SKILL_RARITIES} disabled={!owner} onChange={(rarity) => set({ rarity })} />
        <Choice label="Category" value={String(draft.category || 'speed')} options={SKILL_CATEGORIES} disabled={!owner} onChange={(category) => set({ category })} />
      </div>
      <div className="field-pair">
        <SkillNameField label="Upgrade" value={String(draft.upgrade || '')} names={skillNames} disabled={!owner} onChange={(upgrade) => setNameLink('upgrade', upgrade)} />
        <SkillNameField label="Downgrade" value={String(draft.downgrade || '')} names={skillNames} disabled={!owner} onChange={(downgrade) => setNameLink('downgrade', downgrade)} />
      </div>
      <Text label="Gametora ID" value={String(draft.gametora_id || '')} disabled={!owner} onChange={(gametora_id) => set({ gametora_id })} />
      <Area label="Aliases (one per line)" value={lines(draft.aliases)} disabled={!owner} onChange={(value) => set({ aliases: splitLines(value) })} />
      <Area label="Review" value={String(draft.review || '')} disabled={!owner} onChange={(review) => set({ review })} />
      {effects.map((effect, index) => (
        <fieldset key={index} className="admin-grid">
          <Text label={`Effect ${index + 1} description`} value={String(effect.description || '')} disabled={!owner} onChange={(description) => writeEffect(index, { description })} />
          <Area label="Preconditions (one per line)" value={lines(effect.preconditions)} disabled={!owner} onChange={(value) => writeEffect(index, { preconditions: splitLines(value) })} />
          <Area label="Conditions" value={lines(effect.conditions)} disabled={!owner} onChange={(value) => writeEffect(index, { conditions: splitLines(value) })} />
          <details className="condition-paste">
            <summary>Paste condition code</summary>
            <Area label="Condition code" value={codeByEffect[index] || ''} disabled={!owner} onChange={(value) => setCodeByEffect((current) => ({ ...current, [index]: value }))} />
            {owner && <button type="button" onClick={() => {
              const code = codeByEffect[index] || ''
              const converted = convertConditions(code)
              const next = effects.slice()
              next[index] = { ...effect, conditions: converted.lines }
              const map = suggestActivationMap(code)
              set({ effect: next, ...(map ? { activation_map: map } : {}) })
            }}>Convert to English</button>}
          </details>
        </fieldset>
      ))}
      {owner && <button type="button" onClick={() => set({ effect: [...effects, { description: '', conditions: [] }] })}>Add effect</button>}
      <ActivationMapEditor value={draft.activation_map} disabled={!owner} onChange={(activation_map) => set({ activation_map })} />
    </div>}
    <SkillMapPreview skill={draft} />
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

function SkillNameField({ label, value, names, disabled, onChange }: {
  label: string
  value: string
  names: string[]
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const listId = useId()
  return <label className="admin-field">{label}
    <input list={listId} value={value} disabled={disabled} autoComplete="off" onChange={(event) => onChange(event.target.value)} />
    <datalist id={listId}>
      {names.map((name) => <option key={name} value={name} />)}
    </datalist>
  </label>
}
