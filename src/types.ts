export type Status = 'pending' | 'approved' | 'waitlisted' | 'rejected'
export type Band = 'promotion' | 'meeting' | 'under' | 'severe' | 'inactive'

export type Club = {
  circleId: string
  name: string
  dailyTarget: number
  promotionRatio: number
  severeRatio: number
  inactiveDays: number
  promotionEnabled?: boolean
  rank?: number | null
  yesterdayRank?: number | null
  /** Positions gained today (positive = rose). live vs yesterday. */
  rankDelta?: number | null
  lastMonthRank?: number | null
  /** Current monthly fan total (live_points). */
  monthlyFans?: number | null
  /** Fans gained since yesterday (live_points - yesterday_points). */
  fansSinceYesterday?: number | null
  /** Letter grade for rank badge image (SS/S/A/…). */
  rankGrade?: string | null
  sourceUpdatedAt?: string | null
  syncedAt?: string | null
  members?: Member[]
}

export type Member = {
  umaId: string
  circleId?: string
  ign: string
  lastUpdatedAt?: string | null
  totalFans: number
  monthlyGain: number
  dailyAverage: number
  todayGain: number
  dailyGains: number[]
  band: Band
  reason: string
}

export type Applicant = {
  umaId: string
  ign: string
  discordUsername?: string
  targetClubId: string
  status: Status
  privateNotes?: string
  publishPublicly?: boolean
  currentClubId?: string | null
  currentClubName?: string | null
  lastUpdatedAt?: string | null
  totalFans: number
  monthlyGain: number
  dailyAverage: number
  todayGain: number
  dailyGains: number[]
}

export type Assignment = {
  entityType: 'member' | 'applicant'
  entityId: string
  destination: string
  position: number
}

export type SyncError = {
  id: string
  error: string
}

export type DashboardState = {
  clubs: Club[]
  members: Member[]
  applicants: Applicant[]
  assignments: Assignment[]
  board?: { status: string; updated_at?: string; confirmed_at?: string | null }
  publications?: Array<Record<string, unknown>>
  syncErrors?: SyncError[]
}

export type PublicData = {
  schemaVersion: number
  generatedAt: string
  source: string
  clubs: Array<Club & { members: Member[] }>
  applicants: Applicant[]
}
