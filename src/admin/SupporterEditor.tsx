import { useEffect, useState, type CSSProperties } from 'react'
import { AdminError, adminApi } from './api'
import { parseEvents } from './lib/parseEvents'
import { Area, Choice, DiffPreview, SaveBar, Text, useLoadedEntry } from './entryForm'
import { CARD_EVENT_STATUS, SUPPORT_ICONS, SUPPORT_RARITIES, SUPPORT_TYPES } from './icons'
import { RecordPortrait } from './RecordPortrait'

const LEVELS = ['LB0', 'LB1', 'LB2', 'LB3', 'MLB']
const DOTS = ['#5ee0a0', '#7eb6ff', '#e7c56a', '#c9a6ff']

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
  const [eventsText, setEventsText] = useState<string | null>(null)
  useEffect(() => { setEventsText(null) }, [entryKey])
  const original = loaded.baseline
  if (loaded.loading) return <p>Loading support card…</p>
  if (!entry) return <p className="notice error">{loaded.error || 'Support card not found.'}</p>
  const draft = rawMode ? safeParse(rawText, entry) : entry
  const set = (patch: Record<string, unknown>) => loaded.setEntry({ ...draft, ...patch })
  const events = Array.isArray(draft.events) ? draft.events as Array<Record<string, unknown>> : []
  const effects = asList(draft.effects)
  const rows = effects.map(parseEffect)
  const columns = Math.max(5, ...rows.filter((row) => !row.raw).map((row) => row.values.length))
  const cardName = String(draft.card_name || '')
  const character = String(draft.character_name || '')
  const category = String(draft.category || '')
  const type = SUPPORT_TYPES.find((item) => item.id === category)
  const typeIcon = SUPPORT_ICONS[category] || ''
  const digits = String(draft.id || entryKey || '').match(/\d+/)?.[0] || 'new'
  const canSave = owner && Boolean(loaded.blobSha)

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
  const remove = async () => {
    if (!window.confirm('Delete this support card from GitHub?')) return
    setBusy(true)
    try {
      await adminApi.remove('supporters', entryKey || '', loaded.blobSha, message || `admin: delete supporter ${entryKey}`)
      navigate('/admin/supporters')
    } catch (reason) {
      if (reason instanceof AdminError && reason.status === 409) setConflict(reason.message)
      else loaded.setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(false) }
  }
  const writeEffects = (next: string[]) => set({ effects: next })
  const writeRow = (index: number, row: EffectRow) => {
    const next = effects.slice()
    next[index] = formatEffect(row)
    writeEffects(next)
  }

  return <section className="admin-editor with-card">
    <div className="editor-top">
      <p className="crumb">Supporters / {digits} / {cardName || 'New card'}</p>
      <div className="admin-row">
        <button type="button" onClick={() => { setRawMode(!rawMode); setRawText(JSON.stringify(draft, null, 2)) }}>{rawMode ? 'Form' : 'Raw JSON'}</button>
        {canSave && <button type="button" className="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save & Publish'}</button>}
      </div>
    </div>
    {loaded.error && <p className="notice error">{loaded.error}</p>}
    {!rawMode && <header className="editor-hero">
      {draft.thumbnail ? <img src={String(draft.thumbnail)} alt="" /> : <span className="hero-fallback" />}
      <div>
        <h1>{character || 'Support card'}{cardName ? ` — ${cardName}` : ''}</h1>
        <div className="hero-badges">
          {(type || category) && <span>{typeIcon && <img src={typeIcon} alt="" />}{type?.label || category}</span>}
          {draft.rarity ? <span>{String(draft.rarity).toUpperCase()}</span> : null}
          {draft._event ? <span>{String(draft._event)}</span> : null}
        </div>
      </div>
    </header>}
    <div className="editor-desk">
      {rawMode ? <Area label="JSON" value={rawText} disabled={!owner} onChange={setRawText} /> : <div className="editor-form">
        <section className="admin-section">
          <h2>Core card properties</h2>
          <Text label="ID" value={String(draft.id || '')} disabled={!owner} onChange={(id) => set({ id })} />
          <div className="field-pair">
            <Text label="Card name" value={cardName} disabled={!owner} onChange={(card_name) => set({ card_name })} />
            <Text label="Character" value={character} disabled={!owner} onChange={(character_name) => set({ character_name })} />
          </div>
          <div className="field-pair">
            <Choice label="Rarity" value={String(draft.rarity || 'r')} options={SUPPORT_RARITIES} disabled={!owner} onChange={(rarity) => set({ rarity })} />
            <Choice label="Support type" value={category || 'speed'} options={SUPPORT_TYPES.map((item) => ({ value: item.id, label: item.label }))} disabled={!owner} onChange={(next) => set({ category: next })} />
          </div>
          <Text label="Gametora support URL" value={String(draft.url || '')} disabled={!owner} onChange={(url) => set({ url })} />
          <Text label="Thumbnail asset URL" value={String(draft.thumbnail || '')} disabled={!owner} onChange={(thumbnail) => set({ thumbnail })} />
          <TagList label="Aliases" values={asList(draft.aliases)} disabled={!owner} onChange={(aliases) => set({ aliases })} />
        </section>
        <section className="admin-section">
          <h2>Effects & parameter scaling
            {owner && <button type="button" onClick={() => writeEffects([...effects, 'New effect - 0/0/0/0/0%'])}>Add effect row</button>}
          </h2>
          <label className="unique-box">
            <span className="unique-kicker">Unique effect</span>
            <textarea value={String(draft.unique || '')} disabled={!owner} onChange={(event) => set({ unique: event.target.value })} />
          </label>
          <div className="effect-grid" style={{ '--effect-cols': columns } as CSSProperties}>
            <div className="effect-line">
              <span className="effect-label">Effect name</span>
              {Array.from({ length: columns }, (_, index) => <span className="effect-label" key={index}>{columns === 5 ? LEVELS[index] : `Value ${index + 1}`}</span>)}
              <span className="effect-label">Actions</span>
            </div>
            {rows.length === 0 && <p className="muted">No effects yet.</p>}
            {rows.map((row, index) => (
              <div className="effect-line" key={index}>
                <span className="effect-name">
                  <i className="effect-dot" style={{ background: DOTS[index % DOTS.length] }} />
                  <input value={row.name} disabled={!owner} onChange={(event) => writeRow(index, { ...row, name: event.target.value })} />
                </span>
                {Array.from({ length: columns }, (_, cell) => (
                  <span className="effect-value" key={cell}>
                    <input
                      value={row.raw ? '' : (row.values[cell] || '')}
                      disabled={!owner || row.raw}
                      onChange={(event) => {
                        const values = row.values.slice()
                        while (values.length <= cell) values.push('')
                        const typed = event.target.value
                        values[cell] = typed.replace(/%/g, '')
                        writeRow(index, { ...row, values, suffix: typed.includes('%') ? '%' : row.suffix })
                      }}
                    />
                    {!row.raw && row.suffix && <em>{row.suffix}</em>}
                  </span>
                ))}
                {owner ? <button type="button" onClick={() => writeEffects(effects.filter((_, item) => item !== index))}>Remove</button> : <span />}
              </div>
            ))}
          </div>
        </section>
        <section className="admin-section">
          <h2>Associated skills</h2>
          <div className="field-pair skill-pair">
            <TagList label="Support skills" values={asList(draft.support_skills)} disabled={!owner} onChange={(support_skills) => set({ support_skills })} />
            <TagList label="Event skills" values={asList(draft.event_skills)} disabled={!owner} onChange={(event_skills) => set({ event_skills })} />
          </div>
        </section>
        <section className="admin-section">
          <div className="events-head">
            <h2>Events</h2>
            <label className={`event-status status-${String(draft._event || 'todo')}`}>
              Event status
              <span className="status-control">
                <i className="status-dot" />
                <select value={String(draft._event || 'todo')} disabled={!owner} onChange={(event) => set({ _event: event.target.value })}>
                  {CARD_EVENT_STATUS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </span>
            </label>
          </div>
          <div className="events-split">
            <label className="admin-field">JSON
              <textarea className="events-json" value={eventsText ?? JSON.stringify(events, null, 2)} disabled={!owner} spellCheck={false} onChange={(event) => {
                const value = event.target.value
                setEventsText(value)
                try { set({ events: JSON.parse(value) }) } catch { /* typing */ }
              }} />
            </label>
            <label className="admin-field">Paste events
              <textarea value={paste} disabled={!owner} onChange={(event) => setPaste(event.target.value)} />
            </label>
          </div>
          {owner && <div className="events-actions">
            <button type="button" onClick={() => {
              const next = [...events, ...parseEvents(paste)]
              set({ events: next })
              setEventsText(JSON.stringify(next, null, 2))
            }}>Append parsed events</button>
          </div>}
        </section>
      </div>}
      <div className="editor-rail">
        <RecordPortrait
          dataset="supporters"
          currentKey={String(draft.id || entryKey || '')}
          name={character}
          image={supportArt(String(draft.id || entryKey || '')) || String(draft.thumbnail || '')}
          heading={character || 'Support card'}
          detail={cardName}
          url={String(draft.url || '')}
          navigate={navigate}
        />
        <section className="admin-section">
          <h2>Changes</h2>
          <DiffPreview before={original} after={draft} />
          <SaveBar owner={canSave} message={message} setMessage={setMessage} busy={busy} onSave={save} warnings={warnings} conflict={conflict} reload={loaded.reload} onDelete={!creating && owner ? remove : undefined} />
        </section>
      </div>
    </div>
  </section>
}

function TagList({ label, values, disabled, onChange }: {
  label: string
  values: string[]
  disabled?: boolean
  onChange: (values: string[]) => void
}) {
  const [text, setText] = useState('')
  const add = () => {
    const next = text.trim()
    if (!next) return
    onChange([...values, next])
    setText('')
  }
  return <label className="admin-field">{label}
    <div className="tag-box">
      {values.map((item, index) => (
        <button key={`${item}-${index}`} type="button" className="tag" disabled={disabled} onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}>{item} ×</button>
      ))}
      <input value={text} disabled={disabled} placeholder="Add…" onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add() } }} />
    </div>
  </label>
}

type EffectRow = { name: string; values: string[]; suffix: string; raw: boolean }

function parseEffect(line: string): EffectRow {
  const splitAt = line.lastIndexOf(' - ')
  if (splitAt < 0) return { name: line, values: [], suffix: '', raw: true }
  const name = line.slice(0, splitAt).trim()
  let rest = line.slice(splitAt + 3).trim()
  let suffix = ''
  if (rest.endsWith('%')) {
    suffix = '%'
    rest = rest.slice(0, -1).trim()
  }
  const values = rest.split('/').map((part) => part.trim())
  if (!values.length || values.some((part) => part !== '' && !/^\d+(?:\.\d+)?$/.test(part))) {
    return { name: line, values: [], suffix: '', raw: true }
  }
  return { name, values, suffix, raw: false }
}

function formatEffect(row: EffectRow) {
  if (row.raw || row.values.length === 0) return row.name
  return `${row.name} - ${row.values.join('/')}${row.suffix}`
}

function asList(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)) : []
}

function supportArt(id: string) {
  const match = id.match(/\d+/)
  return match ? `https://media.gametora.com/umamusume/supports/full/small/${match[0]}.png` : ''
}

function safeParse(text: string, fallback: Record<string, unknown>) {
  try { return JSON.parse(text) as Record<string, unknown> } catch { return fallback }
}
