import type { VercelRequest, VercelResponse } from '@vercel/node'
import { parseCookie, stringifySetCookie } from 'cookie'
import { SignJWT, jwtVerify } from 'jose'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import {
  classifyPerformance,
  getActiveCutoffMs,
  getMemberFanStats,
  getTodayFanGain,
  isMemberActive,
} from '../../server/performance.js'

export type ClubConfig = {
  circleId: string
  name: string
  dailyTarget: number
  promotionRatio: number
  severeRatio: number
  inactiveDays: number
  promotionEnabled?: boolean
}

export type ManagerAccess = {
  discordId: string
  label?: string
  clubIds: string[]
}

export type SessionUser = {
  discordId: string
  username: string
  globalName: string | null
  avatar: string | null
  clubIds: string[]
  label: string | null
}

const SESSION_COOKIE = 'dustbunny_session'

function requireEnv(name: string) {
  const value = String(process.env[name] || '').trim()
  if (!value) throw new Error(`${name} is not configured.`)
  return value
}

export function siteUrl(request: VercelRequest) {
  const configured = String(process.env.SITE_URL || '').trim().replace(/\/$/, '')
  if (configured) return configured
  const host = request.headers['x-forwarded-host'] || request.headers.host
  const proto = request.headers['x-forwarded-proto'] || 'https'
  return `${proto}://${host}`
}

export function readClubs(): ClubConfig[] {
  const file = path.join(process.cwd(), 'config', 'clubs.json')
  const payload = JSON.parse(readFileSync(file, 'utf8')) as { clubs: ClubConfig[] }
  return payload.clubs
}

export function readAccess(): ManagerAccess[] {
  const file = path.join(process.cwd(), 'config', 'access.json')
  const payload = JSON.parse(readFileSync(file, 'utf8')) as { managers: ManagerAccess[] }
  return payload.managers
}

export function findManager(discordId: string) {
  return readAccess().find((manager) => manager.discordId === String(discordId)) || null
}

async function sessionSecret() {
  return new TextEncoder().encode(requireEnv('SESSION_SECRET'))
}

export async function createSessionToken(user: SessionUser) {
  return new SignJWT({
    discordId: user.discordId,
    username: user.username,
    globalName: user.globalName,
    avatar: user.avatar,
    clubIds: user.clubIds,
    label: user.label,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('14d')
    .sign(await sessionSecret())
}

export async function readSession(request: VercelRequest): Promise<SessionUser | null> {
  const cookies = parseCookie(request.headers.cookie || '')
  const token = cookies[SESSION_COOKIE]
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, await sessionSecret())
    const discordId = String(payload.discordId || '')
    const manager = findManager(discordId)
    if (!manager) return null
    return {
      discordId,
      username: String(payload.username || ''),
      globalName: payload.globalName == null ? null : String(payload.globalName),
      avatar: payload.avatar == null ? null : String(payload.avatar),
      clubIds: manager.clubIds.map(String),
      label: manager.label || null,
    }
  } catch {
    return null
  }
}

export function setSessionCookie(response: VercelResponse, token: string) {
  const secure = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL)
  response.setHeader(
    'Set-Cookie',
    stringifySetCookie({
      name: SESSION_COOKIE,
      value: token,
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: 60 * 60 * 24 * 14,
    }),
  )
}

export function clearSessionCookie(response: VercelResponse) {
  const secure = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL)
  response.setHeader(
    'Set-Cookie',
    stringifySetCookie({
      name: SESSION_COOKIE,
      value: '',
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: 0,
    }),
  )
}

export async function requireManager(request: VercelRequest, response: VercelResponse) {
  const user = await readSession(request)
  if (!user) {
    response.status(401).json({ error: 'Discord login required.' })
    return null
  }
  return user
}

export function sendError(response: VercelResponse, error: unknown, fallback = 'Unexpected server error.') {
  if (error instanceof z.ZodError) {
    return response.status(400).json({ error: error.issues.map((issue) => issue.message).join(' ') })
  }
  const message = error instanceof Error ? error.message : fallback
  const status = /not configured|rejected this API key|UMA_API_KEY/i.test(message) ? 500 : 400
  console.error(error)
  return response.status(status).json({ error: message })
}

export async function fetchUmaJson<T>(url: string): Promise<T> {
  const key = String(process.env.UMA_API_KEY || process.env.UMA_MOE_API_KEY || '').trim()
  if (!key) throw new Error('UMA_API_KEY is not configured.')
  const response = await fetch(url, {
    headers: { 'X-API-Key': key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) {
    if (response.status === 404) throw new Error('Not found on uma.moe.')
    if (response.status === 401 || response.status === 403) throw new Error('uma.moe rejected this API key.')
    throw new Error(`uma.moe returned ${response.status}.`)
  }
  return response.json() as Promise<T>
}

export async function resolveUmaProfile(umaId: string) {
  const root = await fetchUmaJson<any>(`https://uma.moe/api/v4/user/profile/${encodeURIComponent(umaId)}`)
  const trainer = root?.trainer ?? root?.user ?? root?.profile ?? root
  const month = root?.fan_history?.monthly?.[0]
  const circle = root?.circle ?? trainer?.circle ?? root?.club
  const ign = trainer?.name ?? trainer?.trainer_name ?? month?.trainer_name
  if (!ign) throw new Error(`Trainer ${umaId} was not found on uma.moe.`)
  const currentClubIdRaw = circle?.circle_id ?? circle?.id ?? month?.circle_id
  const currentClubId = currentClubIdRaw == null ? null : String(currentClubIdRaw)
  let member: any = null
  if (currentClubId) {
    const circleData = await fetchUmaJson<any>(`https://uma.moe/api/v4/circles?circle_id=${encodeURIComponent(currentClubId)}`)
    member = (circleData?.members || []).find((item: any) => String(item.viewer_id) === String(umaId))
  }
  const stats = getMemberFanStats(member?.daily_fans)
  return {
    ign: String(ign),
    currentClubId,
    currentClubName: circle?.name ?? month?.circle_name ?? null,
    lastUpdatedAt: member?.last_updated ?? null,
    totalFans: stats.totalFans,
    monthlyGain: stats.monthlyGain,
    dailyAverage: stats.dailyAverage,
    todayGain: getTodayFanGain(member?.daily_fans),
    dailyGains: stats.dailyGains,
  }
}

export async function buildPublicClub(club: ClubConfig) {
  const data = await fetchUmaJson<any>(`https://uma.moe/api/v4/circles?circle_id=${encodeURIComponent(club.circleId)}`)
  const roster = data?.members || []
  const cutoff = getActiveCutoffMs(roster)
  const members = roster
    .filter((member: any) => isMemberActive(member, cutoff))
    .map((member: any) => {
      const stats = getMemberFanStats(member.daily_fans)
      const decision = classifyPerformance({
        dailyAverage: stats.dailyAverage,
        dailyTarget: club.dailyTarget,
        lastUpdatedAt: member.last_updated,
        promotionRatio: club.promotionRatio,
        severeRatio: club.severeRatio,
        inactiveDays: club.inactiveDays,
        promotionEnabled: club.promotionEnabled !== false,
      })
      return {
        umaId: String(member.viewer_id),
        ign: member.trainer_name || 'Unknown',
        lastUpdatedAt: member.last_updated ?? null,
        totalFans: stats.totalFans,
        monthlyGain: stats.monthlyGain,
        dailyAverage: stats.dailyAverage,
        todayGain: getTodayFanGain(member.daily_fans),
        dailyGains: stats.dailyGains,
        band: decision.band,
        reason: decision.reason,
      }
    })
  return {
    ...club,
    rank: data?.circle?.live_rank || data?.circle?.monthly_rank || null,
    lastMonthRank: data?.circle?.last_month_rank ?? null,
    sourceUpdatedAt: data?.circle?.last_updated ?? null,
    members,
  }
}
