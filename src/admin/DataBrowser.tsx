import { useEffect, useState } from 'react'
import { adminApi, type Summary } from './api'

const LABEL: Record<string, string> = {
  skills: 'skill_name',
  supporters: 'id',
  characters: 'id',
}

export function DataBrowser({ dataset, title, owner, navigate }: {
  dataset: string
  title: string
  owner: boolean
  navigate: (to: string) => void
}) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Summary[]>([])
  const [total, setTotal] = useState(0)
  const [error, setError] = useState('')
  useEffect(() => {
    const handle = setTimeout(() => {
      adminApi.publicList(dataset, q)
        .then((payload) => { setRows(payload.entries); setTotal(payload.total); setError('') })
        .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
    }, 200)
    return () => clearTimeout(handle)
  }, [dataset, q])
  const field = LABEL[dataset] || 'key'
  return <section>
    <div className="admin-row">
      <h1>{title}</h1>
      {owner && <button type="button" onClick={() => navigate(`/admin/${dataset}/new`)}>Add</button>}
    </div>
    <div className="admin-field">
      <input value={q} placeholder="Search" onChange={(event) => setQ(event.target.value)} />
    </div>
    <p className="muted">{total} match{total === 1 ? '' : 'es'}</p>
    {error && <p className="notice error">{error}</p>}
    <ul className="admin-list">
      {rows.map((row) => {
        const key = row.key || row[field]
        const extra = [row.rarity, row.category, row.character_name, row.card_name, row.costume].filter(Boolean).join(' · ')
        return <li key={key}>
          <a href={`/admin/${dataset}/edit?key=${encodeURIComponent(key)}`} onClick={(event) => { event.preventDefault(); navigate(`/admin/${dataset}/edit?key=${encodeURIComponent(key)}`) }}>
            <strong>{row[field] || key}</strong>
            {extra ? <span className="muted"> — {extra}</span> : null}
          </a>
        </li>
      })}
    </ul>
  </section>
}
