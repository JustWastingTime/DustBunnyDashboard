import type { Band } from './types'

export const MEETING_RATIO = 0.9

/**
 * Inactive = no fans gained on each of the last `days` days of uma.moe data.
 * Needs at least that many days this month; earlier than that nobody is marked inactive.
 */
export function isInactive(dailyGains: number[] | null | undefined, days: number): boolean {
  const gains = Array.isArray(dailyGains) ? dailyGains : []
  const window = Math.max(1, Math.round(days))
  if (gains.length < window) return false
  return gains.slice(-window).every((gain) => !(Number(gain) > 0))
}

export function assessMember(input: {
  dailyAverage: number
  dailyTarget: number
  dailyGains?: number[] | null
  lastUpdatedAt?: string | null
  promotionTarget?: number | null
  promotionTier?: string | null
  meetingRatio?: number
  severeRatio?: number
  inactiveDays?: number
  promotionEnabled?: boolean
  now?: Date
}): { band: Band; reason: string } {
  const {
    dailyAverage,
    dailyTarget,
    dailyGains,
    promotionTarget = null,
    promotionTier = null,
    meetingRatio = MEETING_RATIO,
    severeRatio = 0.5,
    inactiveDays = 3,
    promotionEnabled = true,
  } = input
  if (isInactive(dailyGains, inactiveDays)) {
    return { band: 'inactive', reason: `No fans gained in the last ${inactiveDays} days` }
  }
  const ratio = dailyTarget > 0 ? dailyAverage / dailyTarget : 1
  const reason = `${Math.round(ratio * 100)}% of daily requirement`
  if (promotionEnabled && promotionTarget != null && promotionTarget > 0 && dailyAverage >= promotionTarget) {
    return { band: 'promotion', reason: promotionTier ? `Meets ${promotionTier} requirement` : 'Meets next tier requirement' }
  }
  if (ratio >= meetingRatio) return { band: 'meeting', reason }
  if (ratio < severeRatio) return { band: 'severe', reason }
  return { band: 'under', reason }
}
