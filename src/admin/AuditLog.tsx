import { useEffect, useMemo, useState } from 'react'
import { adminApi } from './api'
import { SortTh, TableToolbar } from './table'
import { formatWhen, matchesQuery, relativeWhen, stamp, useSorted } from './tableData'

type Entry = { at: string; username: string | null; file: string; summary: string; commitSha: string }

export function AuditLog({ owner }: { owner: boolean }) {
  const [rows, setRows] = useState<Entry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  useEffect(() => {
    if (!owner) return
    adminApi.audit()
      .then((payload) => setRows(payload.entries))
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setLoaded(true))
  }, [owner])
  const filtered = useMemo(() => rows.filter((row) => matchesQuery(query, row.summary, row.file, row.username, row.commitSha)), [rows, query])
  const columns = useMemo(() => ({
    at: (row: Entry) => stamp(row.at),
    who: (row: Entry) => (row.username || 'owner').toLowerCase(),
    file: (row: Entry) => row.file,
  }), [])
  const { sorted, sort, toggle } = useSorted(filtered, columns, { key: 'at', dir: 'desc' })
  if (!owner) return <p>The audit log is visible to the bot owner only.</p>
  return <section className="admin-grid">
    <div className="admin-row catalog-head">
      <h1>Audit log</h1>
      <button type="button" disabled={busy} onClick={async () => {
        setBusy(true)
        setNotice('')
        try {
          await adminApi.refreshCache()
          setNotice('Bot cache refreshed.')
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
        } finally { setBusy(false) }
      }}>{busy ? 'Refreshing…' : 'Refresh bot cache'}</button>
    </div>
    {error && <p className="notice error">{error}</p>}
    {notice && <p className="notice">{notice}</p>}
    <TableToolbar query={query} onQuery={setQuery} placeholder="Search change, file, person or commit" shown={sorted.length} total={rows.length} />
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <SortTh label="When" column="at" sort={sort} onSort={toggle} />
            <th>Change</th>
            <SortTh label="File" column="file" sort={sort} onSort={toggle} />
            <SortTh label="By" column="who" sort={sort} onSort={toggle} />
            <th>Commit</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={`${row.at}-${row.commitSha}`}>
              <td className="nowrap">{formatWhen(row.at)}<span className="cell-sub">{relativeWhen(row.at)}</span></td>
              <td>{row.summary}</td>
              <td><code>{row.file}</code></td>
              <td>{row.username || 'owner'}</td>
              <td><code>{row.commitSha.slice(0, 7)}</code></td>
            </tr>
          ))}
          {loaded && !sorted.length && <tr><td colSpan={5} className="muted">{rows.length ? 'No changes match.' : 'No dashboard saves yet.'}</td></tr>}
          {!loaded && <tr><td colSpan={5} className="muted">Loading the log…</td></tr>}
        </tbody>
      </table>
    </div>
  </section>
}
