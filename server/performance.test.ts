import { describe, expect, it } from 'vitest'
import { classifyPerformance, getEffectiveJstPeriod, getMemberFanStats, isMemberActive } from './performance.js'

describe('performance calculations', () => {
  it('uses the previous JST month before day two', () => {
    expect(getEffectiveJstPeriod(new Date('2026-07-31T16:00:00Z'))).toEqual({ year: 2026, month: 6 })
    expect(getEffectiveJstPeriod(new Date('2026-07-31T14:00:00Z'))).toEqual({ year: 2026, month: 6 })
  })

  it('handles a negative club-transfer baseline', () => {
    expect(getMemberFanStats([-1000, 0, 1400, 1900])).toMatchObject({
      dailyFans: [1000, 1400, 1900],
      monthlyGain: 900,
      dailyAverage: 450,
    })
  })

  it('explains target and inactivity classifications', () => {
    expect(classifyPerformance({
      dailyAverage: 130, dailyTarget: 100, lastUpdatedAt: '2026-07-31T00:00:00Z',
      now: new Date('2026-08-01T00:00:00Z'),
    }).band).toBe('promotion')
    expect(classifyPerformance({
      dailyAverage: 500, dailyTarget: 100, lastUpdatedAt: '2026-07-20T00:00:00Z',
      now: new Date('2026-08-01T00:00:00Z'),
    }).band).toBe('inactive')
    expect(classifyPerformance({
      dailyAverage: 200, dailyTarget: 100, lastUpdatedAt: '2026-07-31T00:00:00Z',
      promotionEnabled: false, now: new Date('2026-08-01T00:00:00Z'),
    }).band).toBe('meeting')
    expect(classifyPerformance({
      dailyAverage: 91, dailyTarget: 100, lastUpdatedAt: '2026-07-31T00:00:00Z',
      now: new Date('2026-08-01T00:00:00Z'),
    }).band).toBe('meeting')
    expect(classifyPerformance({
      dailyAverage: 89, dailyTarget: 100, lastUpdatedAt: '2026-07-31T00:00:00Z',
      now: new Date('2026-08-01T00:00:00Z'),
    }).band).toBe('under')
  })

  it('treats transferred trainers with zeroed calendar slots as inactive', () => {
    const now = new Date('2026-08-01T17:00:00Z') // JST Aug 2
    const fans = Array.from({ length: 31 }, () => 0)
    expect(isMemberActive({ daily_fans: fans, last_updated: '2026-08-02T00:00:00Z' }, null, now)).toBe(false)
    fans[1] = 1200
    fans[0] = 1100
    expect(isMemberActive({ daily_fans: fans, last_updated: '2026-08-02T00:00:00Z' }, null, now)).toBe(true)
  })
})
