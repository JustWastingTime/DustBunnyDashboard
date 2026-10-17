import { useEffect, useMemo, useState } from 'react'
import { adminApi, type Summary } from './api'
import { RARITY_BADGE, SKILL_TYPE_FILTERS, SUPPORT_ICONS, SUPPORT_TYPES, skillIcon, skillMatchesType } from './icons'

const PAGE = 50

const RARITY_FILTERS = [
  { id: '', label: 'All' },
  { id: 'normal', label: 'Normal' },
  { id: 'rare', label: 'Rare' },
  { id: 'unique', label: 'Unique' },
  { id: 'evo', label: 'Evolved' },
]

export function DataBrowser({ dataset, title, owner, navigate }: {
  dataset: string
  title: string
  owner: boolean
  navigate: (to: string) => void
}) {
  const [rows, setRows] = useState<Summary[]>([])
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [rarity, setRarity] = useState('')
  const [types, setTypes] = useState<string[]>([])
  const [outfit, setOutfit] = useState('')
  const [upcoming, setUpcoming] = useState(true)
  const [sort, setSort] = useState('name')
  const [shown, setShown] = useState(PAGE)

  useEffect(() => {
    adminApi.publicList(dataset)
      .then((payload) => { setRows(payload.entries); setError('') })
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
  }, [dataset])

  useEffect(() => { setShown(PAGE); setQ(''); setRarity(''); setTypes([]); setOutfit('') }, [dataset])

  const outfits = useMemo(() => {
    if (dataset !== 'characters') return []
    return [...new Set(rows.map((row) => row.type).filter(Boolean))].sort()
  }, [dataset, rows])

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    const list = rows.filter((row) => {
      if (query) {
        const hay = [row.skill_name, row.character_name, row.card_name, row.id, row.costume, row.description, row.gametora_id]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(query)) return false
      }
      if (dataset === 'skills') {
        if (rarity && row.rarity !== rarity) return false
        if (!upcoming && row.upcoming === '1') return false
        if (types.length && !types.some((type) => skillMatchesType(row.category || '', type))) return false
      }
      if (dataset === 'supporters') {
        if (rarity && row.rarity !== rarity) return false
        if (types.length && !types.includes(row.category || '')) return false
      }
      if (dataset === 'characters') {
        if (rarity && row.rarity !== rarity) return false
        if (outfit && row.type !== outfit) return false
      }
      return true
    })
    const rarityRank: Record<string, number> = { normal: 0, rare: 1, unique: 2, evo: 3, r: 0, sr: 1, ssr: 2 }
    list.sort((a, b) => {
      if (sort === 'rarity') return (rarityRank[a.rarity] ?? 9) - (rarityRank[b.rarity] ?? 9) || labelOf(a, dataset).localeCompare(labelOf(b, dataset))
      if (sort === 'category') return (a.category || '').localeCompare(b.category || '') || labelOf(a, dataset).localeCompare(labelOf(b, dataset))
      return labelOf(a, dataset).localeCompare(labelOf(b, dataset))
    })
    return list
  }, [rows, q, rarity, types, outfit, upcoming, sort, dataset])

  const visible = filtered.slice(0, shown)
  const open = (key: string) => navigate(`/admin/${dataset}/edit?key=${encodeURIComponent(key)}`)
  const toggleType = (id: string) => setTypes((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])

  return <section className="catalog">
    <div className="admin-row catalog-head">
      <h1>{title}</h1>
      {owner && <button type="button" className="primary" onClick={() => navigate(`/admin/${dataset}/new`)}>Add</button>}
    </div>
    {error && <p className="notice error">{error}</p>}
    <div className="filter-card">
      <button type="button" className="text-button" onClick={() => { setQ(''); setRarity(''); setTypes([]); setOutfit(''); setUpcoming(true) }}>Reset filters</button>
      <input value={q} placeholder={dataset === 'skills' ? 'Search by skill name' : 'Search'} onChange={(event) => { setQ(event.target.value); setShown(PAGE) }} />
      {dataset === 'skills' && <div className="filter-line">
        <span>Rarity:</span>
        {RARITY_FILTERS.map((item) => (
          <label key={item.id || 'all'} className={rarity === item.id ? 'chip on' : 'chip'}>
            <input type="radio" name="rarity" checked={rarity === item.id} onChange={() => setRarity(item.id)} />
            {item.label}
          </label>
        ))}
      </div>}
      {dataset === 'supporters' && <div className="filter-line">
        <span>Rarity:</span>
        {['', 'r', 'sr', 'ssr'].map((id) => (
          <label key={id || 'all'} className={rarity === id ? 'chip on' : 'chip'}>
            <input type="radio" name="card-rarity" checked={rarity === id} onChange={() => setRarity(id)} />
            {id ? id.toUpperCase() : 'All'}
          </label>
        ))}
      </div>}
      {dataset === 'characters' && <div className="filter-line">
        <span>Stars:</span>
        {['', '⭐⭐⭐', '⭐⭐', '⭐'].map((id) => (
          <label key={id || 'all'} className={rarity === id ? 'chip on' : 'chip'}>
            <input type="radio" name="uma-rarity" checked={rarity === id} onChange={() => setRarity(id)} />
            {id || 'All'}
          </label>
        ))}
        <label className="admin-field inline">Outfit
          <select value={outfit} onChange={(event) => setOutfit(event.target.value)}>
            <option value="">All</option>
            {outfits.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
      </div>}
      {dataset === 'skills' && <label className="check-line">
        <input type="checkbox" checked={upcoming} onChange={(event) => setUpcoming(event.target.checked)} />
        Show upcoming skills
      </label>}
      {dataset === 'skills' && <div className="icon-row">
        {SKILL_TYPE_FILTERS.map((type) => (
          <button key={type.id} type="button" className={types.includes(type.id) ? 'icon-toggle on' : 'icon-toggle'} title={type.label} onClick={() => toggleType(type.id)}>
            <img src={type.icon} alt={type.label} />
          </button>
        ))}
      </div>}
      {dataset === 'supporters' && <div className="icon-row">
        {SUPPORT_TYPES.map((type) => (
          <button key={type.id} type="button" className={types.includes(type.id) ? 'icon-toggle on' : 'icon-toggle'} title={type.label} onClick={() => toggleType(type.id)}>
            {SUPPORT_ICONS[type.id]
              ? <img src={SUPPORT_ICONS[type.id]} alt={type.label} />
              : <span className="type-fallback">{type.label.slice(0, 1)}</span>}
          </button>
        ))}
      </div>}
    </div>
    <div className="result-bar">
      <span>Showing {Math.min(shown, filtered.length)} of {filtered.length}</span>
      {shown < filtered.length && <button type="button" className="text-button" onClick={() => setShown(filtered.length)}>Show all</button>}
      <label className="sort-label">Sort by
        <select value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="name">Name</option>
          <option value="rarity">Rarity</option>
          {dataset !== 'characters' && <option value="category">Type</option>}
        </select>
      </label>
      {shown < filtered.length && <button type="button" className="pager" onClick={() => setShown((count) => count + PAGE)}>Show {Math.min(PAGE, filtered.length - shown)} more</button>}
    </div>
    {dataset === 'skills'
      ? <div className="skill-table">
        {visible.map((row) => {
          const icon = skillIcon(row.category || '')
          return <button key={row.key} type="button" className="skill-row" onClick={() => open(row.key)}>
            {icon ? <img src={icon} alt="" /> : <span className="icon-fallback" />}
            <strong>{row.skill_name}</strong>
            <span className="muted">{row.description}{row.gametora_id ? ` (${row.gametora_id})` : ''}</span>
            <em>{rarityLabel(row.rarity)}</em>
          </button>
        })}
      </div>
      : <div className="card-grid">
        {visible.map((row) => (
          <button key={row.key} type="button" className="card-tile" onClick={() => open(row.key)}>
            <span className="portrait">
              {row.thumbnail ? <img src={row.thumbnail} alt="" /> : <span className="portrait-empty">No image</span>}
              {dataset === 'supporters' && row.category && (
                SUPPORT_ICONS[row.category]
                  ? <img className="type-badge" src={SUPPORT_ICONS[row.category]} alt={row.category} />
                  : <span className="type-badge text">{row.category}</span>
              )}
              {dataset === 'supporters' && RARITY_BADGE[row.rarity] && <img className="rarity-badge" src={RARITY_BADGE[row.rarity]} alt={row.rarity} />}
            </span>
            <strong>{dataset === 'characters' ? row.character_name : row.character_name}</strong>
            <small>{dataset === 'characters' ? `${row.costume || row.type} ${row.rarity}` : row.card_name}</small>
          </button>
        ))}
      </div>}
    {!filtered.length && !error && <p className="muted">Nothing matches these filters.</p>}
  </section>
}

function labelOf(row: Summary, dataset: string) {
  if (dataset === 'skills') return row.skill_name || row.key
  return row.character_name || row.card_name || row.key
}

function rarityLabel(rarity: string) {
  if (rarity === 'rare') return 'Rare'
  if (rarity === 'unique') return 'Unique'
  if (rarity === 'evo') return 'Evolved'
  if (rarity === 'normal') return 'Normal'
  return rarity
}
