import { describe, expect, it } from 'vitest'
import { suggestActivationMap } from './activationMap'
import { convertConditions } from './convertConditions'
import { parseEvents } from './parseEvents'

describe('admin tools', () => {
  it('turns a phase check into English', () => {
    expect(convertConditions('phase==0').lines).toContain('Early race')
  })

  it('turns a distance type into English', () => {
    expect(convertConditions('distance_type==3').lines).toContain('Medium')
  })

  it('parses choice rewards into a supporter event', () => {
    const events = parseEvents([
      "Watch Where You're Going!",
      'Top',
      'Extra Tank hint +1',
      'Special Week bond +5',
      'Bottom',
      'Guts +15',
      'Bond +5',
    ].join('\n'))
    expect(events).toHaveLength(1)
    expect(events[0].name).toBe("Watch Where You're Going!")
    expect(events[0].results[0]).toBe('Bond +5, Extra Tank hint +1')
    expect(events[0].results[1]).toBe('Guts +15, Bond +5')
  })

  it('suggests corner and remaining-distance triggers', () => {
    const map = suggestActivationMap('Final corner\n≤200m of the race remaining')
    expect(map?.show_chart).toBe(true)
    expect(map?.triggers.some((trigger) => trigger.select === 'last' && trigger.match === 'corner')).toBe(true)
    expect(map?.triggers.some((trigger) => trigger.type === 'line' && trigger.value === 200)).toBe(true)
  })

  it('converts raw code before building a map', () => {
    const map = suggestActivationMap('is_finalcorner==1&corner!=0')
    expect(map?.triggers.some((trigger) => trigger.match === 'corner' && trigger.select === 'last')).toBe(true)
  })
})
