import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { characterLabel, findCharacter, searchCharacters } from './characters'

export function CharacterPicker({
  value,
  onChange,
  disabled = false,
  placeholder = 'Search Uma…',
}: {
  value: string | null
  onChange: (characterId: string | null) => void
  disabled?: boolean
  placeholder?: string
}) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = value ? findCharacter(value) : null
  const [query, setQuery] = useState(selected ? characterLabel(selected) : '')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setQuery(selected ? characterLabel(selected) : '')
  }, [value])

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [])

  const results = useMemo(() => searchCharacters(query, 10), [query])

  return <div className={`character-picker ${disabled ? 'disabled' : ''}`} ref={rootRef}>
    <input
      value={query}
      disabled={disabled}
      placeholder={placeholder}
      aria-autocomplete="list"
      aria-controls={listId}
      aria-expanded={open}
      onFocus={() => { if (!disabled) setOpen(true) }}
      onChange={(event) => {
        setQuery(event.target.value)
        setOpen(true)
        if (!event.target.value.trim()) onChange(null)
      }}
    />
    {selected && !disabled ? (
      <button type="button" className="character-picker-clear" onClick={() => { onChange(null); setQuery(''); setOpen(false) }}>
        Clear
      </button>
    ) : null}
    {open && !disabled ? (
      <ul id={listId} className="character-picker-list" role="listbox">
        {results.length === 0 ? (
          <li className="muted">No matches</li>
        ) : results.map((character) => (
          <li key={character.id}>
            <button
              type="button"
              role="option"
              aria-selected={character.id === value}
              onClick={() => {
                onChange(character.id)
                setQuery(characterLabel(character))
                setOpen(false)
              }}
            >
              <strong>{characterLabel(character)}</strong>
              {character.aliases[0] ? <small>{character.aliases[0]}</small> : null}
            </button>
          </li>
        ))}
      </ul>
    ) : null}
  </div>
}
