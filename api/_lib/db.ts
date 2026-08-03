import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

let sql: NeonQueryFunction<false, false> | null = null
let ready: Promise<void> | null = null

function getSql() {
  const url = String(process.env.DATABASE_URL || '').trim()
  if (!url) throw new Error('DATABASE_URL is not configured. Create a free Neon database and set it in Vercel env.')
  if (!sql) sql = neon(url)
  return sql
}

export async function ensureSchema() {
  if (!ready) {
    ready = (async () => {
      const db = getSql()
      await db`
        CREATE TABLE IF NOT EXISTS applicants (
          uma_id TEXT PRIMARY KEY,
          ign TEXT NOT NULL,
          discord_username TEXT NOT NULL DEFAULT '',
          target_club_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          private_notes TEXT NOT NULL DEFAULT '',
          publish_publicly BOOLEAN NOT NULL DEFAULT TRUE,
          current_club_id TEXT,
          current_club_name TEXT,
          last_updated_at TIMESTAMPTZ,
          total_fans INTEGER NOT NULL DEFAULT 0,
          monthly_gain INTEGER NOT NULL DEFAULT 0,
          daily_average INTEGER NOT NULL DEFAULT 0,
          today_gain INTEGER NOT NULL DEFAULT 0,
          daily_gains_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
    })()
  }
  await ready
}

function mapApplicant(row: any) {
  return {
    umaId: String(row.uma_id),
    ign: String(row.ign),
    discordUsername: String(row.discord_username || ''),
    targetClubId: String(row.target_club_id),
    status: row.status as 'pending' | 'approved' | 'waitlisted' | 'rejected',
    privateNotes: String(row.private_notes || ''),
    publishPublicly: Boolean(row.publish_publicly),
    currentClubId: row.current_club_id == null ? null : String(row.current_club_id),
    currentClubName: row.current_club_name == null ? null : String(row.current_club_name),
    lastUpdatedAt: row.last_updated_at ? new Date(row.last_updated_at).toISOString() : null,
    totalFans: Number(row.total_fans || 0),
    monthlyGain: Number(row.monthly_gain || 0),
    dailyAverage: Number(row.daily_average || 0),
    todayGain: Number(row.today_gain || 0),
    dailyGains: Array.isArray(row.daily_gains_json) ? row.daily_gains_json : [],
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  }
}

export async function listApplicants(clubIds?: string[]) {
  await ensureSchema()
  const db = getSql()
  if (clubIds && clubIds.length) {
    const rows = await db`
      SELECT * FROM applicants
      WHERE target_club_id = ANY(${clubIds})
      ORDER BY updated_at DESC
    `
    return rows.map(mapApplicant)
  }
  const rows = await db`SELECT * FROM applicants ORDER BY updated_at DESC`
  return rows.map(mapApplicant)
}

export async function listPublicApplicants() {
  await ensureSchema()
  const db = getSql()
  const rows = await db`
    SELECT * FROM applicants
    WHERE publish_publicly = TRUE AND status <> 'rejected'
    ORDER BY updated_at DESC
  `
  return rows.map(mapApplicant).map((applicant) => ({
    umaId: applicant.umaId,
    ign: applicant.ign,
    targetClubId: applicant.targetClubId,
    status: applicant.status,
    currentClubId: applicant.currentClubId,
    currentClubName: applicant.currentClubName,
    lastUpdatedAt: applicant.lastUpdatedAt,
    totalFans: applicant.totalFans,
    monthlyGain: applicant.monthlyGain,
    dailyAverage: applicant.dailyAverage,
    todayGain: applicant.todayGain,
    dailyGains: applicant.dailyGains,
  }))
}

export async function upsertApplicant(input: {
  umaId: string
  ign: string
  discordUsername: string
  targetClubId: string
  status: string
  privateNotes: string
  publishPublicly: boolean
  currentClubId: string | null
  currentClubName: string | null
  lastUpdatedAt: string | null
  totalFans: number
  monthlyGain: number
  dailyAverage: number
  todayGain: number
  dailyGains: number[]
}) {
  await ensureSchema()
  const db = getSql()
  const rows = await db`
    INSERT INTO applicants (
      uma_id, ign, discord_username, target_club_id, status, private_notes, publish_publicly,
      current_club_id, current_club_name, last_updated_at, total_fans, monthly_gain, daily_average,
      today_gain, daily_gains_json, created_at, updated_at
    ) VALUES (
      ${input.umaId}, ${input.ign}, ${input.discordUsername}, ${input.targetClubId}, ${input.status},
      ${input.privateNotes}, ${input.publishPublicly}, ${input.currentClubId}, ${input.currentClubName},
      ${input.lastUpdatedAt}, ${input.totalFans}, ${input.monthlyGain}, ${input.dailyAverage},
      ${input.todayGain}, ${JSON.stringify(input.dailyGains)}, NOW(), NOW()
    )
    ON CONFLICT (uma_id) DO UPDATE SET
      ign = EXCLUDED.ign,
      discord_username = EXCLUDED.discord_username,
      target_club_id = EXCLUDED.target_club_id,
      status = EXCLUDED.status,
      private_notes = EXCLUDED.private_notes,
      publish_publicly = EXCLUDED.publish_publicly,
      current_club_id = EXCLUDED.current_club_id,
      current_club_name = EXCLUDED.current_club_name,
      last_updated_at = EXCLUDED.last_updated_at,
      total_fans = EXCLUDED.total_fans,
      monthly_gain = EXCLUDED.monthly_gain,
      daily_average = EXCLUDED.daily_average,
      today_gain = EXCLUDED.today_gain,
      daily_gains_json = EXCLUDED.daily_gains_json,
      updated_at = NOW()
    RETURNING *
  `
  return mapApplicant(rows[0])
}

export async function updateApplicantStatus(umaId: string, status: string, clubIds: string[]) {
  await ensureSchema()
  const db = getSql()
  const rows = await db`
    UPDATE applicants
    SET status = ${status}, updated_at = NOW()
    WHERE uma_id = ${umaId} AND target_club_id = ANY(${clubIds})
    RETURNING *
  `
  return rows[0] ? mapApplicant(rows[0]) : null
}

export async function updateApplicantFields(
  umaId: string,
  clubIds: string[],
  fields: {
    status?: string
    privateNotes?: string
    publishPublicly?: boolean
    targetClubId?: string
    discordUsername?: string
  },
) {
  await ensureSchema()
  const current = (await listApplicants(clubIds)).find((item) => item.umaId === umaId)
  if (!current) return null
  return upsertApplicant({
    ...current,
    status: fields.status ?? current.status,
    privateNotes: fields.privateNotes ?? current.privateNotes,
    publishPublicly: fields.publishPublicly ?? current.publishPublicly,
    targetClubId: fields.targetClubId ?? current.targetClubId,
    discordUsername: fields.discordUsername ?? current.discordUsername,
  })
}

export async function deleteApplicant(umaId: string, clubIds: string[]) {
  await ensureSchema()
  const db = getSql()
  const rows = await db`
    DELETE FROM applicants
    WHERE uma_id = ${umaId} AND target_club_id = ANY(${clubIds})
    RETURNING uma_id
  `
  return rows.length > 0
}
