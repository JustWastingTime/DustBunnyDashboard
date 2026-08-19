import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { listClubs, listMemberLinks, updateClub, upsertMemberLink } from './_lib/db.js'
import { requireManager, sendError } from './_lib/shared.js'

const rankGrades = ['ss', 'splus', 's', 'aplus', 'a', 'bplus', 'b'] as const

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  dailyTarget: z.number().int().nonnegative(),
  promotionRatio: z.number().positive(),
  severeRatio: z.number().min(0).max(1),
  inactiveDays: z.number().int().positive(),
  promotionEnabled: z.boolean(),
  rankGrade: z.enum(rankGrades).nullish(),
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
      const [clubs, memberLinks] = await Promise.all([
        listClubs(user.clubIds),
        listMemberLinks(),
      ])
      return response.json({ clubs, memberLinks, user, rankGrades })
    }

    if (request.method === 'PUT' || request.method === 'PATCH') {
      if (request.body?.link === true) {
        const input = linkSchema.parse(request.body)
        const saved = await upsertMemberLink(input.umaId, input.discordId || null)
        return response.json({ umaId: input.umaId, discordId: saved?.discordId || null })
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
      })
      if (!club) return response.status(404).json({ error: 'Club not found.' })
      return response.json(club)
    }

    return response.status(405).json({ error: 'Method not allowed.' })
  } catch (error) {
    return sendError(response, error)
  }
}
