import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readClubs, requireManager, sendError } from './_lib/shared.js'

export default async function handler(request: VercelRequest, response: VercelResponse) {
  try {
    if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed.' })
    const user = await requireManager(request, response)
    if (!user) return
    const clubs = readClubs().filter((club) => user.clubIds.includes(club.circleId))
    return response.json({ clubs, user })
  } catch (error) {
    return sendError(response, error)
  }
}
