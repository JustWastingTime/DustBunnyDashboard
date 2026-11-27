import { useMemo, useState } from 'react'

export type SortDir = 'asc' | 'desc'
export type SortValue = string | number | null | undefined

/** Sort by one value per row. Empty values always go last, whatever the direction. */
export function sortRows<T>(rows: T[], pick: (row: T) => SortValue, dir: SortDir) {
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const left = pick(a)
    const right = pick(b)
    const leftEmpty = left == null || left === ''
    const rightEmpty = right == null || right === ''
    if (leftEmpty || rightEmpty) return leftEmpty === rightEmpty ? 0 : leftEmpty ? 1 : -1
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * sign
    return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' }) * sign
  })
}

/**
 * Sort rows by one column at a time. `columns` maps a column key to the
 * value that column sorts by. Empty values always go last.
 */
export function useSorted<T>(rows: T[], columns: Record<string, (row: T) => SortValue>, initial: { key: string; dir: SortDir }) {
  const [sort, setSort] = useState(initial)
  const sorted = useMemo(() => {
    const pick = columns[sort.key]
    return pick ? sortRows(rows, pick, sort.dir) : rows
  }, [rows, sort, columns])
  const toggle = (key: string) => setSort((current) => (
    current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
  ))
  return { sorted, sort, toggle }
}

/** Rows whose joined text fields contain every word of the query. */
export function matchesQuery(query: string, ...fields: Array<string | number | null | undefined>) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const haystack = fields.filter((field) => field != null).join(' ').toLowerCase()
  return words.every((word) => haystack.includes(word))
}

const dateFormat = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

export function formatWhen(iso: string | null | undefined) {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? String(iso) : dateFormat.format(date)
}

export function relativeWhen(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return ''
  const stamp = Date.parse(iso)
  if (!Number.isFinite(stamp)) return ''
  const minutes = Math.round((stamp - now) / 60_000)
  const abs = Math.abs(minutes)
  if (abs < 60) return relativeFormat.format(minutes, 'minute')
  if (abs < 60 * 48) return relativeFormat.format(Math.round(minutes / 60), 'hour')
  if (abs < 60 * 24 * 60) return relativeFormat.format(Math.round(minutes / 1440), 'day')
  return relativeFormat.format(Math.round(minutes / (1440 * 30)), 'month')
}

export function stamp(iso: string | null | undefined) {
  const value = Date.parse(iso || '')
  return Number.isFinite(value) ? value : null
}
