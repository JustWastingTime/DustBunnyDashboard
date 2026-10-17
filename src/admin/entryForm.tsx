import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AdminError, adminApi } from './api'
import { lineDiff } from './diff'

export function lines(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).join('\n') : ''
}

export function splitLines(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

export function useLoadedEntry(dataset: string, entryKey: string | undefined, creating: boolean | undefined) {
  const [entry, setEntry] = useState<Record<string, unknown> | null>(creating ? {} : null)
  const [baseline, setBaseline] = useState<Record<string, unknown> | null>(creating ? {} : null)
  const [blobSha, setBlobSha] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(!creating)
  const [tick, setTick] = useState(0)
  const reload = () => setTick((value) => value + 1)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    const load = creating
      ? adminApi.head(dataset).then((head) => { if (!cancelled) { setEntry({}); setBaseline({}); setBlobSha(head.blobSha) } })
      : adminApi.gitEntry(dataset, entryKey || '').then((payload) => {
        if (!cancelled) {
          setEntry(payload.entry)
          setBaseline(structuredClone(payload.entry))
          setBlobSha(payload.blobSha)
        }
      })
    load.catch(async (reason) => {
      if (cancelled) return
      if (!creating && reason instanceof AdminError && (reason.status === 401 || reason.status === 403)) {
        try {
          const pub = await adminApi.publicEntry(dataset, entryKey || '')
          if (!cancelled) { setEntry(pub.entry); setBaseline(structuredClone(pub.entry)); setBlobSha('') }
        } catch (pubError) {
          if (!cancelled) setError(pubError instanceof Error ? pubError.message : String(pubError))
        }
        return
      }
      if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [dataset, entryKey, creating, tick])
  return { entry, setEntry, baseline, blobSha, setBlobSha, error, setError, loading, reload }
}

export function SaveBar({ owner, message, setMessage, busy, onSave, onDelete, warnings, conflict, reload }: {
  owner: boolean
  message: string
  setMessage: (value: string) => void
  busy: boolean
  onSave: () => void
  onDelete?: () => void
  warnings: string[]
  conflict: string
  reload: () => void
}) {
  if (!owner) return <p className="muted">Read-only. Log in as the bot owner to edit.</p>
  return <div className="admin-grid">
    <label className="admin-field">Commit message
      <input value={message} onChange={(event) => setMessage(event.target.value)} />
    </label>
    <div className="admin-row">
      <button type="button" disabled={busy} onClick={onSave}>{busy ? 'Saving…' : 'Save to GitHub'}</button>
      {onDelete && <button type="button" disabled={busy} onClick={onDelete}>Delete</button>}
    </div>
    {warnings.map((warning) => <p key={warning} className="admin-warn">{warning}</p>)}
    {conflict && <p className="notice error">{conflict} <button type="button" onClick={reload}>Reload</button></p>}
  </div>
}

export function DiffPreview({ before, after }: { before: unknown; after: unknown }) {
  const linesOut = useMemo(() => lineDiff(JSON.stringify(before ?? {}, null, 2), JSON.stringify(after ?? {}, null, 2)), [before, after])
  const changed = linesOut.some((line) => line.kind !== 'same')
  if (!changed) return <p className="muted">No changes yet.</p>
  return <pre className="diff">{linesOut.filter((line) => line.kind !== 'same').slice(0, 200).map((line, index) => (
    <div key={index} className={line.kind}>{line.kind === 'add' ? '+ ' : '- '}{line.text}</div>
  ))}</pre>
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="admin-field">{label}{children}</label>
}

export function Text({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <Field label={label}><input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></Field>
}

export function Choice({ label, value, options, onChange, disabled }: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const known = options.some((option) => option.value === value)
  return <Field label={label}>
    <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      {!known && <option value={value}>{value || 'Select'}</option>}
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </Field>
}

export function Area({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <Field label={label}><textarea value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></Field>
}
