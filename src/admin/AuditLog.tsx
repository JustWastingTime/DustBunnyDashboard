import { useEffect, useState } from 'react'
import { adminApi } from './api'

export function AuditLog({ owner }: { owner: boolean }) {
  const [rows, setRows] = useState<Array<{ at: string; username: string | null; file: string; summary: string; commitSha: string }>>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!owner) return
    adminApi.audit().then((payload) => setRows(payload.entries)).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
  }, [owner])
  if (!owner) return <p>The audit log is visible to the bot owner only.</p>
  return <section className="admin-grid">
    <div className="admin-row">
      <h1>Audit log</h1>
      <button type="button" disabled={busy} onClick={async () => {
        setBusy(true)
        try { await adminApi.refreshCache() } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
        finally { setBusy(false) }
      }}>{busy ? 'Refreshing…' : 'Refresh bot cache'}</button>
    </div>
    {error && <p className="notice error">{error}</p>}
    <ul className="admin-list">
      {rows.map((row) => (
        <li key={`${row.at}-${row.commitSha}`}>
          <strong>{row.summary}</strong>
          <div className="muted">{row.file} · {row.username || 'owner'} · {row.at} · {row.commitSha.slice(0, 7)}</div>
        </li>
      ))}
      {!rows.length && <li>No dashboard saves yet.</li>}
    </ul>
  </section>
}
