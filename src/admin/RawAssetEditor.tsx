import { useEffect, useState } from 'react'
import { AdminError, adminApi } from './api'
import { lineDiff } from './diff'

export function RawAssetEditor({ owner, asset, navigate }: { owner: boolean; asset: string; navigate: (to: string) => void }) {
  const [datasets, setDatasets] = useState<Array<{ name: string; mode: string; file: string; count: number }>>([])
  const [text, setText] = useState('')
  const [baseline, setBaseline] = useState('')
  const [blobSha, setBlobSha] = useState('')
  const [message, setMessage] = useState('admin: update asset')
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState('')
  useEffect(() => {
    if (!owner) return
    adminApi.datasets().then((payload) => setDatasets(payload.datasets.filter((item) => item.mode === 'raw'))).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
  }, [owner])
  useEffect(() => {
    if (!owner || !asset) return
    adminApi.raw(asset).then((payload) => { setText(payload.text); setBaseline(payload.text); setBlobSha(payload.blobSha); setMessage(`admin: update ${payload.file}`) }).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
  }, [owner, asset])
  if (!owner) return <p>Other assets are visible to the bot owner only.</p>
  const diff = lineDiff(baseline, text).filter((line) => line.kind !== 'same').slice(0, 120)
  return <section className="admin-grid">
    <h1>Other GitHub assets</h1>
    {error && <p className="notice error">{error}</p>}
    <ul className="admin-list">
      {datasets.map((item) => (
        <li key={item.name}>
          <a href={`/admin/assets?key=${item.name}`} onClick={(event) => { event.preventDefault(); navigate(`/admin/assets?key=${encodeURIComponent(item.name)}`) }}>
            {item.file} <span className="muted">({item.count})</span>
          </a>
        </li>
      ))}
    </ul>
    {asset && <>
      <label className="admin-field">{asset}
        <textarea value={text} onChange={(event) => setText(event.target.value)} style={{ minHeight: '24rem' }} />
      </label>
      <label className="admin-field">Commit message
        <input value={message} onChange={(event) => setMessage(event.target.value)} />
      </label>
      <pre className="diff">{diff.length ? diff.map((line, index) => <div key={index} className={line.kind}>{line.kind === 'add' ? '+ ' : '- '}{line.text}</div>) : 'No changes yet.'}</pre>
      {conflict && <p className="notice error">{conflict}</p>}
      <button type="button" onClick={async () => {
        setConflict('')
        try {
          const saved = await adminApi.saveRaw(asset, { text, message, baseBlobSha: blobSha })
          setBlobSha(saved.blobSha)
          setBaseline(text)
        } catch (reason) {
          if (reason instanceof AdminError && reason.status === 409) setConflict(reason.message)
          else setError(reason instanceof Error ? reason.message : String(reason))
        }
      }}>Save to GitHub</button>
    </>}
  </section>
}
