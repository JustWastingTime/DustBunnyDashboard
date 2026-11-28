import { describe, expect, test } from 'vitest'
import { choose, cleanWinners, columns, previewMatches, routes, slotHint, slotTeams, type BracketMatch } from './logic'

// The 8-team layout the bot builds (scripts/gambaBrackets.js).
const w = (n: number) => ({ type: 'winner' as const, matchId: `m${n}` })
const l = (n: number) => ({ type: 'loser' as const, matchId: `m${n}` })
const t = (n: number) => ({ type: 'team' as const, teamId: `t${n}` })
const layout: Array<[BracketMatch['side'], number, BracketMatch['slots']]> = [
  ['upper', 1, [t(1), t(2)]], ['upper', 1, [t(3), t(4)]], ['upper', 1, [t(5), t(6)]], ['upper', 1, [t(7), t(8)]],
  ['lower', 1, [l(1), l(2)]], ['lower', 1, [l(3), l(4)]],
  ['upper', 2, [w(1), w(2)]], ['upper', 2, [w(3), w(4)]],
  ['lower', 2, [l(8), w(5)]], ['lower', 2, [l(7), w(6)]],
  ['upper', 3, [w(7), w(8)]],
  ['lower', 3, [w(9), w(10)]],
  ['lower', 4, [l(11), w(12)]],
  ['final', 1, [w(11), w(13)]],
]
const bracket = {
  matches: layout.map(([side, round, slots], i) => ({ id: `m${i + 1}`, number: i + 1, side, round, slots, label: '', points: 1, carrots: 0 })),
}

describe('bracket picks', () => {
  test('a pick sends the loser to the lower bracket', () => {
    const picks = choose(bracket, choose(bracket, {}, 'm1', 't2'), 'm2', 't3')
    expect(slotTeams(bracket, picks, 'm5')).toEqual(['t1', 't4'])
    expect(slotTeams(bracket, picks, 'm7')).toEqual(['t2', 't3'])
  })

  test('tapping the same team again removes the pick', () => {
    const picks = choose(bracket, { m1: 't1' }, 'm1', 't1')
    expect(picks).toEqual({})
  })

  test('changing a pick clears later picks that no longer fit', () => {
    const picks = cleanWinners(bracket, { m1: 't1', m2: 't3', m7: 't1', m5: 't2' })
    expect(picks).toEqual({ m1: 't1', m2: 't3', m7: 't1', m5: 't2' })
    const next = choose(bracket, picks, 'm1', 't2')
    expect(next).toEqual({ m1: 't2', m2: 't3' })
  })

  test('placeholders and routing match the bracket image', () => {
    expect(slotHint(bracket, bracket.matches[8].slots[0])).toBe('Loser of 8')
    expect(routes(bracket).m11).toEqual({ winnerTo: 14, loserTo: 13 })
    const cols = columns(bracket)
    expect(cols.upper.map((col) => col.map((m) => m.number))).toEqual([[1, 2, 3, 4], [7, 8], [11]])
    expect(cols.lower.map((col) => col.map((m) => m.number))).toEqual([[5, 6], [9, 10], [12], [13]])
  })

  test('the new-bracket preview numbers matches like the bot does', () => {
    const preview = previewMatches(8)
    expect(preview.map((m) => `${m.side}${m.round}`)).toEqual(bracket.matches.map((m) => `${m.side}${m.round}`))
    expect(preview.find((m) => m.number === 11)?.label).toBe('Upper final')
    expect(preview.find((m) => m.number === 14)?.points).toBe(3)
    expect(previewMatches(16)).toHaveLength(30)
    expect(previewMatches(4)).toHaveLength(6)
  })
})
