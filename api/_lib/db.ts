import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import { readFileSync } from 'node:fs'
import path from 'node:path'

let sql: NeonQueryFunction<false, false> | null = null
let ready: Promise<void> | null = null

function getSql() {
  const url = String(process.env.DATABASE_URL || '').trim()
  if (!url) throw new Error('DATABASE_URL is not configured. Create a free Neon database and set it in Vercel env.')
  if (!sql) sql = neon(url)
  return sql
}

export type ClubRow = {
  circleId: string
  name: string
  dailyTarget: number
  promotionRatio: number
  severeRatio: number
  inactiveDays: number
  promotionEnabled: boolean
  sortOrder: number
}

export type AssignmentRow = {
  entityType: 'member' | 'applicant'
  entityId: string
  destination: string
  position: number
}

export type BoardRow = {
  status: string
  updatedAt: string | null
  confirmedAt: string | null
}

function mapClub(row: any): ClubRow {
  return {
    circleId: String(row.circle_id),
    name: String(row.name),
    dailyTarget: Number(row.daily_target || 0),
    promotionRatio: Number(row.promotion_ratio || 1.25),
    severeRatio: Number(row.severe_ratio || 0.5),
    inactiveDays: Number(row.inactive_days || 3),
    promotionEnabled: row.promotion_enabled !== false && row.promotion_enabled !== 0,
    sortOrder: Number(row.sort_order || 0),
  }
}

function mapAssignment(row: any): AssignmentRow {
  return {
    entityType: row.entity_type === 'applicant' ? 'applicant' : 'member',
    entityId: String(row.entity_id),
    destination: String(row.destination),
    position: Number(row.position || 0),
  }
}

function seedClubsFromConfig() {
  const file = path.join(process.cwd(), 'config', 'clubs.json')
  const payload = JSON.parse(readFileSync(file, 'utf8')) as {
    clubs: Array<{
      circleId: string
      name: string
      dailyTarget: number
      promotionRatio: number
      severeRatio: number
      inactiveDays: number
      promotionEnabled?: boolean
    }>
  }
  return payload.clubs
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
      await db`
        CREATE TABLE IF NOT EXISTS clubs (
          circle_id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          daily_target INTEGER NOT NULL DEFAULT 0,
          promotion_ratio DOUBLE PRECISION NOT NULL DEFAULT 1.25,
          severe_ratio DOUBLE PRECISION NOT NULL DEFAULT 0.5,
          inactive_days INTEGER NOT NULL DEFAULT 3,
          promotion_enabled BOOLEAN NOT NULL DEFAULT TRUE,
          sort_order INTEGER NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
      await db`
        CREATE TABLE IF NOT EXISTS planning_boards (
          id INTEGER PRIMARY KEY,
          status TEXT NOT NULL DEFAULT 'draft',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          confirmed_at TIMESTAMPTZ
        )
      `
      await db`
        CREATE TABLE IF NOT EXISTS planning_assignments (
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          destination TEXT NOT NULL,
          position INTEGER NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (entity_type, entity_id)
        )
      `
      await db`
        INSERT INTO planning_boards (id, status, updated_at)
        VALUES (1, 'draft', NOW())
        ON CONFLICT (id) DO NOTHING
      `
      const existing = await db`SELECT circle_id FROM clubs LIMIT 1`
      if (existing.length === 0) {
        const seeds = seedClubsFromConfig()
        for (const [index, club] of seeds.entries()) {
          await db`
            INSERT INTO clubs (
              circle_id, name, daily_target, promotion_ratio, severe_ratio,
              inactive_days, promotion_enabled, sort_order, updated_at
            ) VALUES (
              ${club.circleId}, ${club.name}, ${club.dailyTarget}, ${club.promotionRatio},
              ${club.severeRatio}, ${club.inactiveDays}, ${club.promotionEnabled !== false},
              ${index}, NOW()
            )
            ON CONFLICT (circle_id) DO NOTHING
          `
        }
      }
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

export async function listClubs(clubIds?: string[]) {
  await ensureSchema()
  const db = getSql()
  if (clubIds && clubIds.length) {
    const rows = await db`
      SELECT * FROM clubs
      WHERE circle_id = ANY(${clubIds})
      ORDER BY sort_order ASC, name ASC
    `
    return rows.map(mapClub)
  }
  const rows = await db`SELECT * FROM clubs ORDER BY sort_order ASC, name ASC`
  return rows.map(mapClub)
}

export async function updateClub(
  circleId: string,
  clubIds: string[],
  input: {
    name: string
    dailyTarget: number
    promotionRatio: number
    severeRatio: number
    inactiveDays: number
    promotionEnabled: boolean
  },
) {
  await ensureSchema()
  if (!clubIds.includes(circleId)) return null
  const db = getSql()
  const rows = await db`
    UPDATE clubs SET
      name = ${input.name},
      daily_target = ${input.dailyTarget},
      promotion_ratio = ${input.promotionRatio},
      severe_ratio = ${input.severeRatio},
      inactive_days = ${input.inactiveDays},
      promotion_enabled = ${input.promotionEnabled},
      updated_at = NOW()
    WHERE circle_id = ${circleId} AND circle_id = ANY(${clubIds})
    RETURNING *
  `
  return rows[0] ? mapClub(rows[0]) : null
}

export async function getPlanningBoard(): Promise<BoardRow> {
  await ensureSchema()
  const db = getSql()
  const rows = await db`SELECT status, updated_at, confirmed_at FROM planning_boards WHERE id = 1`
  const row = rows[0]
  return {
    status: String(row?.status || 'draft'),
    updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
    confirmedAt: row?.confirmed_at ? new Date(row.confirmed_at).toISOString() : null,
  }
}

export async function listAssignments() {
  await ensureSchema()
  const db = getSql()
  const rows = await db`
    SELECT entity_type, entity_id, destination, position
    FROM planning_assignments
    ORDER BY destination, position
  `
  return rows.map(mapAssignment)
}

export async function saveAssignments(assignments: AssignmentRow[]) {
  await ensureSchema()
  const db = getSql()
  await db`DELETE FROM planning_assignments`
  for (const item of assignments) {
    await db`
      INSERT INTO planning_assignments (entity_type, entity_id, destination, position, updated_at)
      VALUES (${item.entityType}, ${item.entityId}, ${item.destination}, ${item.position}, NOW())
    `
  }
  await db`
    UPDATE planning_boards
    SET status = 'draft', updated_at = NOW()
    WHERE id = 1
  `
  return listAssignments()
}

export async function confirmPlan() {
  await ensureSchema()
  const db = getSql()
  await db`
    UPDATE planning_boards
    SET status = 'confirmed', confirmed_at = NOW(), updated_at = NOW()
    WHERE id = 1
  `
  const board = await getPlanningBoard()
  const assignments = await listAssignments()
  return { board, assignments }
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
