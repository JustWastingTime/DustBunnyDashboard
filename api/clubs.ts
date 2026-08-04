import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { listClubs, updateClub } from './_lib/db.js'
import { requireManager, sendError } from './_lib/shared.js'

const rankGrades = ['ss', 'splus', 's', 'aplus', 'a', 'bplus', 'b'] as const

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  dailyTarget: z.number().int().nonnegative(),
  promotionRatio: z.number().positive(),
  severeRatio: z.number().min(0).max(1),
  inactiveDays: z.number().int().positive(),
  promotionEnabled: z.boolean(),
  rankGrade: z.enum(rankGrades).nullable(),
})

export default async function handler(request: VercelRequest, response: VercelResponse) {
  try {
    const user = await requireManager(request, response)
    if (!user) return

    if (request.method === 'GET') {
      const clubs = await listClubs(user.clubIds)
      return response.json({ clubs, user, rankGrades })
    }

    if (request.method === 'PUT' || request.method === 'PATCH') {
      const circleId = String(request.query.circleId || request.body?.circleId || '').trim()
      if (!circleId) return response.status(400).json({ error: 'circleId is required.' })
      if (!user.clubIds.includes(circleId)) {
        return response.status(403).json({ error: 'You do not manage that club.' })
      }
      const input = updateSchema.parse(request.body)
      const club = await updateClub(circleId, user.clubIds, input)
      if (!club) return response.status(404).json({ error: 'Club not found.' })
      return response.json(club)
    }

    return response.status(405).json({ error: 'Method not allowed.' })
  } catch (error) {
    return sendError(response, error)
  }
}
