import { useEffect, useState } from 'react'
import { adminApi } from './api'

type Sibling = { key: string; title: string; note: string; image?: string; original?: boolean }

export function RecordPortrait({
  dataset,
  currentKey,
  name,
  image,
  heading,
  detail,
  url,
  navigate,
}: {
  dataset: 'characters' | 'supporters'
  currentKey: string
  name: string
  image: string
  heading: string
  detail: string
  url: string
  navigate: (to: string) => void
}) {
  const [siblings, setSiblings] = useState<Sibling[]>([])

  useEffect(() => {
    if (!name) {
      setSiblings([])
      return
    }
    let cancel = false
    adminApi.publicList(dataset, '', 5000).then((payload) => {
      if (cancel) return
      const matches = payload.entries.filter((entry) => entry.character_name === name)
      const rows = matches.map((entry) => (
        dataset === 'characters'
          ? {
            key: entry.key,
            title: entry.type || 'Outfit',
            note: entry.costume || '',
            original: entry.type === 'Original',
          }
          : {
            key: entry.key,
            title: entry.card_name || entry.id,
            note: entry.rarity ? entry.rarity.toUpperCase() : '',
            image: entry.thumbnail || '',
          }
      ))
      rows.sort((a, b) => Number(Boolean(b.original)) - Number(Boolean(a.original)) || a.title.localeCompare(b.title) || a.note.localeCompare(b.note))
      setSiblings(rows)
    }).catch(() => { if (!cancel) setSiblings([]) })
    return () => { cancel = true }
  }, [dataset, name])

  const gametora = /^https?:\/\//.test(url) ? url : ''
  const others = siblings.filter((item) => item.key !== currentKey)

  return <>
    <aside className="portrait-card">
      <div className="portrait-frame">
        {image
          ? <img src={image} alt={heading || name || 'Card art'} />
          : <p>No portrait yet</p>}
      </div>
      <div className="portrait-sheet">
        <strong>{heading || name || 'Untitled'}</strong>
        {detail && <p>{detail}</p>}
        {gametora
          ? <a className="portrait-link" href={gametora} target="_blank" rel="noreferrer">Open on Gametora</a>
          : <p>Add a URL to open this on Gametora.</p>}
      </div>
    </aside>
    <aside className="sibling-card">
      <p>{dataset === 'characters' ? 'Other outfits' : 'Other cards'}</p>
      {others.length === 0 && <p>None for this character.</p>}
      <div className="sibling-list">
        {others.map((item) => (
          <button key={item.key} type="button" className={item.image ? 'has-art' : ''} onClick={() => navigate(`/admin/${dataset}/edit?key=${encodeURIComponent(item.key)}`)}>
            {item.image && <img src={item.image} alt="" />}
            <span>
              <span>{item.original ? 'Original' : item.title}</span>
              {item.note && <small>{item.note}</small>}
            </span>
          </button>
        ))}
      </div>
    </aside>
  </>
}
