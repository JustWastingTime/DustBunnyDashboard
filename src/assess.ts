import type { Band } from './types'

export const MEETING_RATIO = 0.9

export function assessMember(input: {
  dailyAverage: number
  dailyTarget: number
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
    lastUpdatedAt,
    promotionTarget = null,
    promotionTier = null,
    meetingRatio = MEETING_RATIO,
    severeRatio = 0.5,
    inactiveDays = 3,
    promotionEnabled = true,
    now = new Date(),
  } = input
  const updatedMs = lastUpdatedAt ? new Date(lastUpdatedAt).getTime() : Number.NaN
  const staleDays = Number.isFinite(updatedMs)
    ? Math.max(0, (now.getTime() - updatedMs) / 86_400_000)
    : Number.POSITIVE_INFINITY
  if (staleDays >= inactiveDays) {
    return { band: 'inactive', reason: `No update for ${Math.floor(staleDays)} days` }
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
