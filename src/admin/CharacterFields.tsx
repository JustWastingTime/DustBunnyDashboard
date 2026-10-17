import { useEffect, useId, useState } from 'react'
import { adminApi } from './api'
import { SUPPORT_ICONS } from './icons'

const STATS = ['speed', 'stamina', 'power', 'guts', 'wit'] as const
const GRADES = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
const TERRAIN = ['Turf', 'Dirt']
const DISTANCE = ['Sprint', 'Mile', 'Medium', 'Long']
const STYLE = ['Front', 'Pace', 'Late', 'End']
const STAT_CAP = 30

type RaceOption = { id: string; name: string; grade: string; date: string }

export function readStatBonuses(raw: unknown) {
  const source = Array.isArray(raw) ? raw[0] : raw
  const row = source && typeof source === 'object' ? source as Record<string, unknown> : {}
  const values: Record<(typeof STATS)[number], number> = { speed: 0, stamina: 0, power: 0, guts: 0, wit: 0 }
  for (const key of STATS) {
    const parsed = Number(String(row[key] ?? '').replace('%', '').trim())
    values[key] = Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0
  }
  return values
}

export function statBonusEntry(values: Record<(typeof STATS)[number], number>) {
  const row: Record<string, string> = {}
  for (const key of STATS) row[key] = values[key] > 0 ? `${values[key]}%` : ''
  return [row]
}

function gradeRow(raw: unknown, keys: string[]) {
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const row: Record<string, string> = {}
  for (const key of keys) {
    const grade = String(source[key] || 'G').toUpperCase()
    row[key] = GRADES.includes(grade) ? grade : 'G'
  }
  return row
}

export function readAptitudes(raw: unknown) {
  const rows = Array.isArray(raw) ? raw : []
  return [
    gradeRow(rows[0], TERRAIN),
    gradeRow(rows[1], DISTANCE),
    gradeRow(rows[2], STYLE),
  ]
}

function stringList(raw: unknown) {
  return Array.isArray(raw) ? raw.map((item) => String(item)) : []
}

export function CharacterFields({ draft, owner, onChange }: {
  draft: Record<string, unknown>
  owner: boolean
  onChange: (next: Record<string, unknown>) => void
}) {
  const [skillNames, setSkillNames] = useState<string[]>([])
  const [races, setRaces] = useState<RaceOption[]>([])
  const [inherited, setInherited] = useState<string[]>([])
  const name = String(draft.character_name || '')
  const isOriginal = String(draft.type || 'Original') === 'Original'
  const bonuses = readStatBonuses(draft.stat_bonuses)
  const aptitudes = readAptitudes(draft.aptitudes)
  const ownRaces = stringList(draft.races)
  const spent = STATS.reduce((sum, key) => sum + bonuses[key], 0)

  useEffect(() => {
    adminApi.publicList('skills').then((payload) => {
      setSkillNames(payload.entries.map((entry) => entry.skill_name).filter(Boolean).sort((a, b) => a.localeCompare(b)))
    }).catch(() => setSkillNames([]))
    adminApi.races().then((payload) => setRaces(payload.races)).catch(() => setRaces([]))
  }, [])

  useEffect(() => {
    if (isOriginal || !name) {
      setInherited([])
      return
    }
    let cancel = false
    adminApi.publicList('characters').then(async (payload) => {
      const original = payload.entries.find((entry) => entry.character_name === name && entry.type === 'Original')
      if (!original || cancel) return
      const full = await adminApi.publicEntry('characters', original.key)
      if (!cancel) setInherited(stringList(full.entry.races))
    }).catch(() => { if (!cancel) setInherited([]) })
    return () => { cancel = true }
  }, [isOriginal, name])

  const setStat = (key: (typeof STATS)[number], raw: string) => {
    const next = { ...bonuses }
    const others = spent - next[key]
    const parsed = Math.max(0, Math.round(Number(raw) || 0))
    next[key] = Math.min(parsed, Math.max(0, STAT_CAP - others))
    onChange({ ...draft, stat_bonuses: statBonusEntry(next) })
  }

  const setGrade = (group: number, key: string, grade: string) => {
    const next = aptitudes.map((row) => ({ ...row }))
    next[group][key] = grade
    onChange({ ...draft, aptitudes: next })
  }

  const setList = (key: string, values: string[]) => {
    const next = { ...draft }
    if (key === 'evo_skills' && values.length === 0) delete next.evo_skills
    else next[key] = values
    onChange(next)
  }

  return <>
    <fieldset className="stat-panel">
      <legend>Stat bonuses</legend>
      <div className="stat-grid">
        {STATS.map((key) => (
          <label key={key} className="stat-cell">
            {SUPPORT_ICONS[key] && <img src={SUPPORT_ICONS[key]} alt="" />}
            <span>{key[0].toUpperCase() + key.slice(1)}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={Math.max(0, STAT_CAP - (spent - bonuses[key]))}
              step={1}
              value={bonuses[key]}
              disabled={!owner}
              onChange={(event) => setStat(key, event.target.value)}
            />
          </label>
        ))}
      </div>
      <p className="stat-total">Total {spent} / {STAT_CAP}</p>
    </fieldset>
    <fieldset className="apt-panel">
      <legend>Aptitudes</legend>
      <GradeRow title="Terrain" keys={TERRAIN} values={aptitudes[0]} disabled={!owner} onChange={(key, grade) => setGrade(0, key, grade)} />
      <GradeRow title="Distance" keys={DISTANCE} values={aptitudes[1]} disabled={!owner} onChange={(key, grade) => setGrade(1, key, grade)} />
      <GradeRow title="Style" keys={STYLE} values={aptitudes[2]} disabled={!owner} onChange={(key, grade) => setGrade(2, key, grade)} />
    </fieldset>
    <StringList label="Skills" values={stringList(draft.skills)} suggestions={skillNames} disabled={!owner} onChange={(values) => setList('skills', values)} />
    <StringList label="Potential" values={stringList(draft.potential)} suggestions={skillNames} disabled={!owner} onChange={(values) => setList('potential', values)} />
    <StringList label="Event skills" values={stringList(draft.event_skills)} suggestions={skillNames} disabled={!owner} onChange={(values) => setList('event_skills', values)} />
    <StringList label="Evo skills" values={stringList(draft.evo_skills)} suggestions={skillNames} disabled={!owner} onChange={(values) => setList('evo_skills', values)} />
    <RaceList
      isOriginal={isOriginal}
      values={ownRaces}
      inherited={inherited}
      races={races}
      disabled={!owner}
      onChange={(values) => {
        if (!isOriginal && values.length === 0) {
          const next = { ...draft }
          delete next.races
          onChange(next)
          return
        }
        onChange({ ...draft, races: values })
      }}
    />
  </>
}

function GradeRow({ title, keys, values, disabled, onChange }: {
  title: string
  keys: string[]
  values: Record<string, string>
  disabled: boolean
  onChange: (key: string, grade: string) => void
}) {
  return <div className="apt-row">
    <span>{title}</span>
    {keys.map((key) => (
      <label key={key}>{key}
        <select value={values[key]} disabled={disabled} onChange={(event) => onChange(key, event.target.value)}>
          {GRADES.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
        </select>
      </label>
    ))}
  </div>
}

function StringList({ label, values, suggestions, disabled, onChange }: {
  label: string
  values: string[]
  suggestions: string[]
  disabled: boolean
  onChange: (values: string[]) => void
}) {
  const listId = useId()
  return <fieldset className="string-list" disabled={disabled}>
    <legend>{label}</legend>
    {values.map((value, index) => (
      <div className="string-row" key={`${label}-${index}`}>
        <input list={listId} value={value} onChange={(event) => {
          const next = [...values]
          next[index] = event.target.value
          onChange(next)
        }} />
        <button type="button" onClick={() => onChange(values.filter((_, item) => item !== index))}>Remove</button>
      </div>
    ))}
    <button type="button" onClick={() => onChange([...values, ''])}>Add</button>
    <datalist id={listId}>
      {suggestions.map((name) => <option key={name} value={name} />)}
    </datalist>
  </fieldset>
}

function raceLabel(race: RaceOption) {
  return [race.grade, race.name, race.date].filter(Boolean).join(' · ')
}

function RaceList({ isOriginal, values, inherited, races, disabled, onChange }: {
  isOriginal: boolean
  values: string[]
  inherited: string[]
  races: RaceOption[]
  disabled: boolean
  onChange: (values: string[]) => void
}) {
  const known = new Set(races.map((race) => race.id))
  const labelFor = (id: string) => {
    const race = races.find((item) => item.id === id)
    return race ? raceLabel(race) : id
  }
  return <fieldset className="string-list" disabled={disabled}>
    <legend>Races</legend>
    {!isOriginal && (
      <p className="inherited">
        {inherited.length
          ? `Original races stay empty here unless you add a list for this outfit. Original runs: ${inherited.map(labelFor).join(', ')}.`
          : 'Alt outfits keep races empty unless you add a list for this outfit.'}
      </p>
    )}
    {values.map((value, index) => (
      <div className="string-row" key={`race-${index}`}>
        <select value={value} onChange={(event) => {
          const next = [...values]
          next[index] = event.target.value
          onChange(next)
        }}>
          <option value="">Select a race</option>
          {value && !known.has(value) && <option value={value}>{value}</option>}
          {races.map((race) => <option key={race.id} value={race.id}>{raceLabel(race)}</option>)}
        </select>
        <button type="button" onClick={() => onChange(values.filter((_, item) => item !== index))}>Remove</button>
      </div>
    ))}
    <button type="button" onClick={() => onChange([...values, ''])}>Add race</button>
  </fieldset>
}
