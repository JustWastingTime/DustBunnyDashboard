import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { listClubs, listMemberDirectory, listMemberLinks, getMemberProfileRecord, updateClub, insertClub, upsertMemberLink, getSiteTheme, setSiteTheme, listStaffAccounts, upsertStaffAccount, deleteStaffAccount, findStaffAccount } from './_lib/db.js'
import { fetchUmaJson, readAccess, requireManager, sendError } from './_lib/shared.js'
import { bunnyHistoryStints } from './_lib/tenure.js'
import { isThemeId } from './_lib/themes.js'

const rankGrades = ['ss', 'splus', 's', 'aplus', 'a', 'bplus', 'b'] as const

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  dailyTarget: z.number().int().nonnegative(),
  promotionRatio: z.number().positive(),
  severeRatio: z.number().min(0).max(1),
  inactiveDays: z.number().int().positive(),
  promotionEnabled: z.boolean(),
  rankGrade: z.enum(rankGrades).nullish(),
  cardColor: z.string().trim().regex(/^#(?:[0-9a-fA-F]{6})$/).nullish(),
  cardColor2: z.string().trim().regex(/^#(?:[0-9a-fA-F]{6})$/).nullish(),
})

const createSchema = z.object({
  create: z.literal(true),
  circleId: z.string().trim().regex(/^\d+$/, 'Circle ID must contain only digits.'),
})

const themeSchema = z.object({
  site: z.literal(true),
  theme: z.string().trim().min(1),
})

const staffSchema = z.object({
  staff: z.literal(true),
  discordId: z.string().trim().regex(/^\d{5,32}$/, 'Discord ID must be a numeric snowflake.'),
  label: z.string().trim().max(80).optional().default(''),
  remove: z.boolean().optional().default(false),
})

const linkSchema = z.object({
  link: z.literal(true),
  umaId: z.string().trim().regex(/^\d+$/, 'Uma ID must contain only digits.'),
  discordId: z.string().trim().max(32).optional().default(''),
})

export default async function handler(request: VercelRequest, response: VercelResponse) {
  try {
    const user = await requireManager(request, response)
    if (!user) return

    if (request.method === 'GET') {
      const profileId = String(request.query.profile || '').trim()
      if (profileId) {
        const clubs = await listClubs(user.clubIds)
        const stored = (await getMemberProfileRecord(profileId)) || { profile: null, clubDays: [], tournaments: [] }
        const bunnyIds = new Set(clubs.map((club) => club.circleId))
        let umaName: string | null = stored.profile?.ign || null
        let history: Array<{ year?: number; month?: number; circle_id?: string | number | null; circle_name?: string | null }> = []
        try {
          const root = await fetchUmaJson<any>(`https://uma.moe/api/v4/user/profile/${encodeURIComponent(profileId)}`)
          umaName = root?.trainer?.name || umaName
          history = Array.isArray(root?.circle_history) ? root.circle_history : []
        } catch {
          // Keep stored rows if uma.moe is unavailable.
        }
        const tenure = bunnyHistoryStints(history, bunnyIds)
        const clubNames = new Map(clubs.map((club) => [club.circleId, club.name]))
        return response.json({
          umaId: profileId,
          ign: umaName || stored.profile?.ign || profileId,
          discordId: stored.profile?.discordId || null,
          status: stored.profile?.status || (tenure.uniqueMonths ? 'former' : 'unknown'),
          currentCircleId: stored.profile?.currentCircleId || null,
          currentClubName: stored.profile?.currentCircleId ? clubNames.get(stored.profile.currentCircleId) || null : null,
          lastCircleId: stored.profile?.lastCircleId || null,
          lastClubName: stored.profile?.lastCircleId ? clubNames.get(stored.profile.lastCircleId) || null : null,
          firstSeenOn: stored.profile?.firstSeenOn || null,
          lastSeenOn: stored.profile?.lastSeenOn || null,
          observedDays: stored.profile?.observedDays || 0,
          networkMonths: tenure.uniqueMonths,
          firstNetworkMonth: tenure.first ? `${tenure.first.year}-${String(tenure.first.month).padStart(2, '0')}` : null,
          lastNetworkMonth: tenure.last ? `${tenure.last.year}-${String(tenure.last.month).padStart(2, '0')}` : null,
          stints: tenure.stints.map((stint) => ({
            ...stint,
            circleName: clubNames.get(stint.circleId) || stint.circleName || stint.circleId,
          })),
          clubDays: stored.clubDays.map((row) => ({
            ...row,
            circleName: clubNames.get(row.circleId) || row.circleId,
          })),
          tournaments: stored.tournaments,
          umaMoeUrl: `https://uma.moe/profile/${encodeURIComponent(profileId)}`,
        })
      }
      const [clubs, memberLinks, directory, theme, extraStaff] = await Promise.all([
        listClubs(user.clubIds),
        listMemberLinks(),
        listMemberDirectory(),
        getSiteTheme(),
        listStaffAccounts(),
      ])
      const ownerIds = new Set(readAccess().map((manager) => manager.discordId))
      const staff = [
        ...readAccess().map((manager) => ({
          discordId: manager.discordId,
          label: manager.label || 'Owner',
          source: 'owner' as const,
          clubIds: manager.clubIds.map(String),
        })),
        ...extraStaff
          .filter((account) => !ownerIds.has(account.discordId))
          .map((account) => ({
            discordId: account.discordId,
            label: account.label || 'Staff',
            source: 'staff' as const,
            clubIds: account.clubIds,
          })),
      ]
      return response.json({ clubs, memberLinks, directory, user, rankGrades, theme, staff })
    }

    if (request.method === 'POST') {
      const input = createSchema.parse(request.body)
      const existing = await listClubs()
      if (existing.some((club) => club.circleId === input.circleId)) {
        return response.status(409).json({ error: 'That club is already in this dashboard.' })
      }
      const data = await fetchUmaJson<any>(`https://uma.moe/api/v4/circles?circle_id=${encodeURIComponent(input.circleId)}`)
      const name = String(data?.circle?.name || '').trim()
      if (!name) throw new Error('No club was found for that circle ID on uma.moe.')
      const template = existing[0]
      const club = await insertClub({
        circleId: input.circleId,
        name,
        dailyTarget: template?.dailyTarget || 2_000_000,
        promotionRatio: template?.promotionRatio || 1.25,
        severeRatio: template?.severeRatio || 0.5,
        inactiveDays: template?.inactiveDays || 3,
        promotionEnabled: true,
      })
      if (!club) throw new Error('Could not add that club.')
      return response.status(201).json(club)
    }

    if (request.method === 'PUT' || request.method === 'PATCH') {
      if (request.body?.link === true) {
        const input = linkSchema.parse(request.body)
        const saved = await upsertMemberLink(input.umaId, input.discordId || null)
        return response.json({ umaId: input.umaId, discordId: saved?.discordId || null })
      }
      if (request.body?.site === true) {
        const input = themeSchema.parse(request.body)
        if (!isThemeId(input.theme)) return response.status(400).json({ error: 'Unknown color theme.' })
        const theme = await setSiteTheme(input.theme)
        return response.json({ theme })
      }
      if (request.body?.staff === true) {
        const input = staffSchema.parse(request.body)
        if (input.remove) {
          if (input.discordId === user.discordId) {
            return response.status(400).json({ error: 'You cannot demote yourself.' })
          }
          if (readAccess().some((manager) => manager.discordId === input.discordId)) {
            return response.status(403).json({ error: 'Owners in access.json cannot be demoted here.' })
          }
          const deleted = await deleteStaffAccount(input.discordId)
          if (!deleted) return response.status(404).json({ error: 'Staff member not found.' })
          return response.json({ ok: true, discordId: input.discordId })
        }
        if (readAccess().some((manager) => manager.discordId === input.discordId) || await findStaffAccount(input.discordId)) {
          return response.status(409).json({ error: 'That Discord account is already staff.' })
        }
        const saved = await upsertStaffAccount({
          discordId: input.discordId,
          label: input.label || 'Staff',
          clubIds: user.clubIds,
          createdBy: user.discordId,
        })
        return response.json({ staff: { discordId: saved.discordId, label: saved.label, source: 'staff', clubIds: saved.clubIds } })
      }
      const circleId = String(request.query.circleId || request.body?.circleId || '').trim()
      if (!circleId) return response.status(400).json({ error: 'circleId is required.' })
      if (!user.clubIds.includes(circleId)) {
        return response.status(403).json({ error: 'You do not manage that club.' })
      }
      const input = updateSchema.parse(request.body)
      const club = await updateClub(circleId, user.clubIds, {
        name: input.name,
        dailyTarget: input.dailyTarget,
        promotionRatio: input.promotionRatio,
        severeRatio: input.severeRatio,
        inactiveDays: input.inactiveDays,
        promotionEnabled: input.promotionEnabled,
        rankGrade: input.rankGrade ?? null,
        cardColor: input.cardColor ?? null,
        cardColor2: input.cardColor2 ?? null,
      })
      if (!club) return response.status(404).json({ error: 'Club not found.' })
      return response.json(club)
    }

    return response.status(405).json({ error: 'Method not allowed.' })
  } catch (error) {
    return sendError(response, error)
  }
}
