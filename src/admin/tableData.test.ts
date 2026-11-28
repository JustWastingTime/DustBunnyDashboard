import { describe, expect, it } from 'vitest'
import { matchesQuery, relativeWhen, sortRows } from './tableData'

describe('sortRows', () => {
  const rows = [{ n: 'beta', v: 2 }, { n: '', v: null }, { n: 'Alpha', v: 10 }, { n: 'gamma', v: 1 }]
  it('sorts text without caring about case and keeps blanks last', () => {
    expect(sortRows(rows, (row) => row.n, 'asc').map((row) => row.n)).toEqual(['Alpha', 'beta', 'gamma', ''])
    expect(sortRows(rows, (row) => row.n, 'desc').map((row) => row.n)).toEqual(['gamma', 'beta', 'Alpha', ''])
  })
  it('sorts numbers numerically and keeps nulls last', () => {
    expect(sortRows(rows, (row) => row.v, 'asc').map((row) => row.v)).toEqual([1, 2, 10, null])
    expect(sortRows(rows, (row) => row.v, 'desc').map((row) => row.v)).toEqual([10, 2, 1, null])
  })
})

describe('matchesQuery', () => {
  it('needs every word somewhere in the fields', () => {
    expect(matchesQuery('bunny 123', 'Bunny Hutch', '123456')).toBe(true)
    expect(matchesQuery('bunny 999', 'Bunny Hutch', '123456')).toBe(false)
    expect(matchesQuery('  ', null, undefined)).toBe(true)
  })
})

describe('relativeWhen', () => {
  const now = Date.parse('2026-11-27T12:00:00Z')
  it('reads as days ahead or behind', () => {
    expect(relativeWhen('2026-12-02T12:00:00Z', now)).toMatch(/5 days/)
    expect(relativeWhen('2026-11-24T12:00:00Z', now)).toMatch(/3 days ago/)
    expect(relativeWhen(null, now)).toBe('')
  })
})
