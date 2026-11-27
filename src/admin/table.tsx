import type { ReactNode } from 'react'
import type { SortDir } from './tableData'

export function SortTh({ label, column, sort, onSort, className }: {
  label: string
  column: string
  sort: { key: string; dir: SortDir }
  onSort: (key: string) => void
  className?: string
}) {
  const active = sort.key === column
  return <th className={className} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
    <button type="button" className={active ? 'sort-button on' : 'sort-button'} onClick={() => onSort(column)}>
      {label}
      <span aria-hidden="true">{active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
    </button>
  </th>
}

export function TableToolbar({ query, onQuery, placeholder, shown, total, children }: {
  query: string
  onQuery: (next: string) => void
  placeholder: string
  shown: number
  total: number
  children?: ReactNode
}) {
  return <div className="table-toolbar">
    <input type="search" value={query} placeholder={placeholder} aria-label={placeholder} onChange={(event) => onQuery(event.target.value)} />
    {children}
    <span className="muted table-count">{shown === total ? `${total} total` : `${shown} of ${total}`}</span>
  </div>
}

export function FilterChips<T extends string>({ value, onChange, options, label }: {
  value: T
  onChange: (next: T) => void
  options: Array<{ id: T; label: string; count?: number }>
  label: string
}) {
  return <div className="filter-chips" role="group" aria-label={label}>
    {options.map((option) => (
      <button key={option.id} type="button" className={value === option.id ? 'chip on' : 'chip'} aria-pressed={value === option.id} onClick={() => onChange(option.id)}>
        {option.label}{option.count != null && <span className="chip-count">{option.count}</span>}
      </button>
    ))}
  </div>
}

export function Badge({ tone, children, title }: { tone: 'on' | 'off' | 'warn' | 'info'; children: ReactNode; title?: string }) {
  return <span className={`status-badge ${tone}`} title={title}>{children}</span>
}
