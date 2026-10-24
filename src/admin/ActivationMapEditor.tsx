import { useEffect, useRef, useState, type ReactNode } from 'react'

type Trigger = Record<string, unknown>
type Option = { value: string; label: string }

const PHASES: Option[] = [
  { value: '', label: 'Any phase' },
  { value: 'early', label: 'Early' },
  { value: 'first_half', label: 'First half' },
  { value: 'mid', label: 'Mid' },
  { value: 'second_half', label: 'Second half' },
  { value: 'late', label: 'Late' },
  { value: 'late_and_beyond', label: 'Late and beyond' },
  { value: 'mid_and_beyond', label: 'Mid and beyond' },
  { value: 'final_corner_and_beyond', label: 'Final corner and beyond' },
  { value: 'spurt', label: 'Spurt' },
]

const BEHAVIORS: Option[] = [
  { value: '', label: 'Default' },
  { value: 'random', label: 'Random' },
  { value: 'asap', label: 'ASAP' },
  { value: 'precondition', label: 'Precondition' },
]

const TARGETS: Option[] = [
  { value: '', label: 'None' },
  { value: 'layout', label: 'Layout' },
  { value: 'zones', label: 'Zones' },
  { value: 'elevation', label: 'Elevation' },
]

const MATCHES: Option[] = [
  { value: '', label: 'None' },
  { value: 'corner', label: 'Corner' },
  { value: 'straight', label: 'Straight' },
  { value: 'not_a_corner', label: 'Not a corner' },
  { value: 'uphill', label: 'Uphill' },
  { value: 'downhill', label: 'Downhill' },
  { value: 'not_uphill', label: 'Not uphill' },
  { value: 'mid', label: 'Mid' },
]

const SELECTS: Option[] = [
  { value: '', label: 'All matches' },
  { value: 'first', label: 'First' },
  { value: 'last', label: 'Last' },
]

const DISTANCE_TYPES = ['sprint', 'mile', 'medium', 'long']
const TERRAINS = ['turf', 'dirt']
const DIRECTIONS = ['clockwise', 'counterclockwise']

const EXTRA_FIELDS: Array<{ key: string; label: string; kind: 'list' | 'number' | 'bool' | 'select' | 'text'; options?: Option[]; placeholder?: string }> = [
  { key: 'labels', label: 'Zone labels', kind: 'list', placeholder: 'middle leg, mid' },
  { key: 'distance_mode', label: 'Distance mode', kind: 'select', options: [{ value: '', label: 'Absolute' }, { value: 'remaining', label: 'Remaining' }, { value: 'absolute', label: 'Absolute (explicit)' }] },
  { key: 'value', label: 'Distance', kind: 'number' },
  { key: 'line_position', label: 'Line position', kind: 'select', options: [{ value: '', label: 'Start' }, { value: 'start', label: 'Start' }, { value: 'end', label: 'End' }] },
  { key: 'clip_start', label: 'Clip start (m)', kind: 'number' },
  { key: 'clip_end', label: 'Clip end (m)', kind: 'number' },
  { key: 'clip_start_ratio', label: 'Clip start ratio', kind: 'number' },
  { key: 'clip_end_ratio', label: 'Clip end ratio', kind: 'number' },
  { key: 'clip_within_segment_start_ratio', label: 'Within segment start', kind: 'number' },
  { key: 'clip_within_segment_end_ratio', label: 'Within segment end', kind: 'number' },
  { key: 'remaining_start', label: 'Remaining start', kind: 'number' },
  { key: 'remaining_end', label: 'Remaining end', kind: 'number' },
  { key: 'remaining_gte', label: 'Remaining at least', kind: 'number' },
  { key: 'remaining_lte', label: 'Remaining at most', kind: 'number' },
  { key: 'effect', label: 'Effect number', kind: 'number' },
  { key: 'effects', label: 'Effect numbers', kind: 'list', placeholder: '1, 2' },
  { key: 'corner_numbers', label: 'Corner numbers', kind: 'list', placeholder: '1, 3' },
  { key: 'racetracks', label: 'Racetracks', kind: 'list', placeholder: 'tokyo' },
  { key: 'exclude_racetracks', label: 'Exclude racetracks', kind: 'list', placeholder: 'tokyo' },
  { key: 'require_tags', label: 'Required tags', kind: 'list', placeholder: 'backstretch' },
  { key: 'exclude_select', label: 'Exclude select', kind: 'select', options: [{ value: '', label: 'None' }, { value: 'first', label: 'First' }, { value: 'last', label: 'Last' }] },
  { key: 'unless_effect', label: 'Unless effect', kind: 'number' },
  { key: 'color', label: 'Color', kind: 'text', placeholder: '#d11f2a' },
  { key: 'directions', label: 'Directions', kind: 'list', placeholder: 'clockwise, counterclockwise' },
  { key: 'disable_auto_phase_clip', label: 'Disable auto phase clip', kind: 'bool' },
  { key: 'after_precondition_start', label: 'After precondition start', kind: 'bool' },
  { key: 'require_activation', label: 'Require activation', kind: 'bool' },
  { key: 'requires_precondition', label: 'Requires precondition', kind: 'bool' },
]

function asMap(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return { ...(value as Record<string, unknown>) }
  return { show_chart: false }
}

function triggersOf(map: Record<string, unknown>): Trigger[] {
  return Array.isArray(map.triggers) ? map.triggers.map((item) => ({ ...(item as Trigger) })) : []
}

function withTriggers(map: Record<string, unknown>, triggers: Trigger[]) {
  if (!triggers.length) return Object.fromEntries(Object.entries(map).filter(([name]) => name !== 'triggers'))
  return { ...map, triggers }
}

function setKey(trigger: Trigger, key: string, value: unknown) {
  const empty = value == null || value === '' || (Array.isArray(value) && value.length === 0)
  if (empty) return Object.fromEntries(Object.entries(trigger).filter(([name]) => name !== key))
  return { ...trigger, [key]: value }
}

function textList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item))
  if (value == null || value === '') return []
  return [String(value)]
}

function withCurrent(options: Option[], current: string) {
  if (current && !options.some((option) => option.value === current)) {
    return [{ value: current, label: current }, ...options]
  }
  return options
}

function summary(trigger: Trigger, index: number) {
  const type = String(trigger.type || 'trigger')
  const bits = [type]
  if (trigger.match) bits.push(String(trigger.match).replace(/_/g, ' '))
  if (trigger.phase) bits.push(Array.isArray(trigger.phase) ? trigger.phase.join(' + ') : String(trigger.phase).replace(/_/g, ' '))
  if (trigger.trigger_behavior) bits.push(String(trigger.trigger_behavior))
  if (trigger.select) bits.push(String(trigger.select))
  return `${index + 1}. ${bits.join(' · ')}`
}

export function ActivationMapEditor({ value, disabled, onChange }: {
  value: unknown
  disabled?: boolean
  onChange: (value: Record<string, unknown>) => void
}) {
  const [jsonMode, setJsonMode] = useState(false)
  const [jsonText, setJsonText] = useState('')
  const [jsonError, setJsonError] = useState('')
  const [fresh, setFresh] = useState<number | null>(null)
  const [addField, setAddField] = useState<Record<number, string>>({})
  const [pendingFields, setPendingFields] = useState<Record<number, string[]>>({})
  const map = asMap(value)
  const triggers = triggersOf(map)

  const update = (next: Record<string, unknown>) => onChange(next)
  const updateTrigger = (index: number, next: Trigger) => {
    const copy = triggers.slice()
    copy[index] = next
    update(withTriggers(map, copy))
  }

  const showJson = () => {
    setJsonText(JSON.stringify(value ?? { show_chart: false }, null, 2))
    setJsonError('')
    setJsonMode(true)
  }
  const showForm = () => {
    try {
      const parsed = JSON.parse(jsonText) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setJsonError('Activation map JSON has to be an object.')
        return
      }
      onChange(parsed as Record<string, unknown>)
      setJsonError('')
      setJsonMode(false)
    } catch {
      setJsonError('That JSON is not valid yet.')
    }
  }

  return <fieldset className="activation-map" disabled={disabled}>
    <legend>Activation map</legend>
    <div className="activation-head">
      <p className="muted">Each trigger is a collapsible row. Add one for a box, a line, or a course filter.</p>
      <button type="button" onClick={jsonMode ? showForm : showJson}>{jsonMode ? 'Form' : 'Edit JSON'}</button>
    </div>
    {jsonMode ? <>
      <textarea className="activation-json" value={jsonText} spellCheck={false} onChange={(event) => {
        const text = event.target.value
        setJsonText(text)
        try {
          const parsed = JSON.parse(text) as unknown
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            setJsonError('Activation map JSON has to be an object.')
            return
          }
          setJsonError('')
          onChange(parsed as Record<string, unknown>)
        } catch {
          setJsonError('Invalid JSON')
        }
      }} />
      {jsonError && <p className="admin-warn">{jsonError}</p>}
    </> : <>
      <label className="check-line">
        <input type="checkbox" checked={map.show_chart === true} onChange={(event) => update({ ...map, show_chart: event.target.checked })} />
        Show chart
      </label>
      {triggers.map((trigger, index) => (
        <TriggerCard key={fresh === index ? `new-${index}` : index} summaryText={summary(trigger, index)} startOpen={fresh === index}>
          <div className="activation-body">
            <div className="activation-fields">
              <SelectField label="Type" value={String(trigger.type || 'box')} options={[{ value: 'box', label: 'Box' }, { value: 'line', label: 'Line' }]} onChange={(next) => updateTrigger(index, setKey(trigger, 'type', next))} />
              <SelectField label="Behavior" value={String(trigger.trigger_behavior || '')} options={withCurrent(BEHAVIORS, String(trigger.trigger_behavior || ''))} onChange={(next) => updateTrigger(index, setKey(trigger, 'trigger_behavior', next))} />
              <PhaseField trigger={trigger} onChange={(next) => updateTrigger(index, next)} />
              <SelectField label="Target" value={String(trigger.target || '')} options={withCurrent(TARGETS, String(trigger.target || ''))} onChange={(next) => updateTrigger(index, setKey(trigger, 'target', next))} />
              <SelectField label="Match" value={String(trigger.match || '')} options={withCurrent(MATCHES, String(trigger.match || ''))} onChange={(next) => updateTrigger(index, setKey(trigger, 'match', next))} />
              <SelectField label="Select" value={String(trigger.select || '')} options={withCurrent(SELECTS, String(trigger.select || ''))} onChange={(next) => updateTrigger(index, setKey(trigger, 'select', next))} />
            </div>
            <CheckGroup label="Distance" options={DISTANCE_TYPES} value={textList(trigger.distance_types)} onChange={(next) => updateTrigger(index, setKey(trigger, 'distance_types', next))} />
            <CheckGroup label="Terrain" options={TERRAINS} value={textList(trigger.terrains)} onChange={(next) => updateTrigger(index, setKey(trigger, 'terrains', next))} />
            <CheckGroup label="Direction" options={DIRECTIONS} value={textList(trigger.directions)} onChange={(next) => updateTrigger(index, setKey(trigger, 'directions', next))} />
            {EXTRA_FIELDS.filter((field) => (
              (trigger[field.key] != null && trigger[field.key] !== '') || (pendingFields[index] || []).includes(field.key)
            )).map((field) => (
              <ExtraField key={field.key} field={field} trigger={trigger} onChange={(next) => updateTrigger(index, next)} onRemove={() => {
                updateTrigger(index, setKey(trigger, field.key, ''))
                setPendingFields((current) => ({ ...current, [index]: (current[index] || []).filter((key) => key !== field.key) }))
              }} />
            ))}
            <div className="admin-row">
              <select value={addField[index] || ''} onChange={(event) => setAddField((current) => ({ ...current, [index]: event.target.value }))}>
                <option value="">Add a field</option>
                {EXTRA_FIELDS.filter((field) => (
                  (trigger[field.key] == null || trigger[field.key] === '') && !(pendingFields[index] || []).includes(field.key)
                )).map((field) => (
                  <option key={field.key} value={field.key}>{field.label}</option>
                ))}
              </select>
              <button type="button" disabled={!addField[index]} onClick={() => {
                const key = addField[index]
                const field = EXTRA_FIELDS.find((item) => item.key === key)
                if (!field) return
                if (field.kind === 'bool') updateTrigger(index, setKey(trigger, key, true))
                else if (field.kind === 'number') updateTrigger(index, setKey(trigger, key, 0))
                else setPendingFields((current) => ({ ...current, [index]: [...(current[index] || []), key] }))
                setAddField((current) => ({ ...current, [index]: '' }))
              }}>Add</button>
              <button type="button" onClick={() => {
                update(withTriggers(map, triggers.filter((_, item) => item !== index)))
              }}>Remove trigger</button>
            </div>
          </div>
        </TriggerCard>
      ))}
      {!triggers.length && <p className="activation-empty">No triggers yet. A skill with no triggers does not draw an activation chart.</p>}
      <button type="button" onClick={() => {
        update(withTriggers(map, [...triggers, { type: 'box', trigger_behavior: 'random' }]))
        setFresh(triggers.length)
      }}>Add trigger</button>
    </>}
  </fieldset>
}

function TriggerCard({ summaryText, startOpen, children }: { summaryText: string; startOpen?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => { if (startOpen && ref.current) ref.current.open = true }, [startOpen])
  return <details ref={ref} className="activation-trigger">
    <summary>{summaryText}</summary>
    {children}
  </details>
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Option[]; onChange: (value: string) => void }) {
  return <label>{label}
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => <option key={option.value || 'empty'} value={option.value}>{option.label}</option>)}
    </select>
  </label>
}

function PhaseField({ trigger, onChange }: { trigger: Trigger; onChange: (trigger: Trigger) => void }) {
  if (Array.isArray(trigger.phase)) {
    return <label>Phases
      <CommaList value={textList(trigger.phase)} placeholder="late, final_corner_and_beyond" onChange={(next) => onChange(setKey(trigger, 'phase', next))} />
    </label>
  }
  const current = String(trigger.phase || '')
  return <label>Phase
    <select value={PHASES.some((option) => option.value === current) ? current : current} onChange={(event) => {
      if (event.target.value === '__list__') onChange({ ...trigger, phase: current ? [current] : [''] })
      else onChange(setKey(trigger, 'phase', event.target.value))
    }}>
      {withCurrent(PHASES, current).map((option) => <option key={option.value || 'empty'} value={option.value}>{option.label}</option>)}
      <option value="__list__">Several phases…</option>
    </select>
  </label>
}

function CheckGroup({ label, options, value, onChange }: { label: string; options: string[]; value: string[]; onChange: (value: string[]) => void }) {
  const known = new Set(options)
  const extras = value.filter((item) => !known.has(item))
  return <div className="activation-checks">
    <span>{label}</span>
    {options.map((option) => (
      <label key={option} className="check-line">
        <input type="checkbox" checked={value.includes(option)} onChange={(event) => {
          const next = event.target.checked ? [...value, option] : value.filter((item) => item !== option)
          onChange(next)
        }} />
        {option}
      </label>
    ))}
    {extras.map((option) => (
      <label key={option} className="check-line">
        <input type="checkbox" checked onChange={() => onChange(value.filter((item) => item !== option))} />
        {option}
      </label>
    ))}
  </div>
}

function ExtraField({ field, trigger, onChange, onRemove }: {
  field: (typeof EXTRA_FIELDS)[number]
  trigger: Trigger
  onChange: (trigger: Trigger) => void
  onRemove: () => void
}) {
  const current = trigger[field.key]
  return <div className="activation-extra">
    <label>{field.label}
      {field.kind === 'bool' ? (
        <input type="checkbox" checked={current === true} onChange={(event) => onChange(setKey(trigger, field.key, event.target.checked ? true : ''))} />
      ) : field.kind === 'number' ? (
        <input type="number" value={current == null ? '' : String(current)} onChange={(event) => {
          const raw = event.target.value
          onChange(setKey(trigger, field.key, raw === '' ? '' : Number(raw)))
        }} />
      ) : field.kind === 'select' && field.options ? (
        <select value={String(current || '')} onChange={(event) => onChange(setKey(trigger, field.key, event.target.value))}>
          {withCurrent(field.options, String(current || '')).map((option) => <option key={option.value || 'empty'} value={option.value}>{option.label}</option>)}
        </select>
      ) : field.kind === 'text' ? (
        <input value={current == null ? '' : String(current)} placeholder={field.placeholder} onChange={(event) => onChange(setKey(trigger, field.key, event.target.value))} />
      ) : (
        <CommaList value={textList(current).filter(Boolean)} placeholder={field.placeholder} onChange={(next) => onChange(setKey(trigger, field.key, next))} />
      )}
    </label>
    <button type="button" onClick={onRemove}>Remove</button>
  </div>
}

function CommaList({ value, placeholder, onChange }: { value: string[]; placeholder?: string; onChange: (value: string[]) => void }) {
  const joined = value.join(', ')
  const [text, setText] = useState(joined)
  const [focused, setFocused] = useState(false)
  useEffect(() => { if (!focused) setText(joined) }, [joined, focused])
  return <input
    value={text}
    placeholder={placeholder}
    onFocus={() => setFocused(true)}
    onBlur={() => {
      setFocused(false)
      const next = text.split(',').map((item) => item.trim()).filter(Boolean)
      setText(next.join(', '))
      onChange(next)
    }}
    onChange={(event) => setText(event.target.value)}
  />
}
