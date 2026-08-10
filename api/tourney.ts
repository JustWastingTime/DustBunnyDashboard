import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  getTournamentBoard,
  listTournamentsForUser,
} from './_lib/db.js'
import { requireUser, sendError } from './_lib/shared.js'

export default async function handler(request: VercelRequest, response: VercelResponse) {
  try {
    const user = await requireUser(request, response)
    if (!user) return
    if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed.' })

    const id = Number(request.query.id)
    if (Number.isInteger(id) && id > 0) {
      const board = await getTournamentBoard(id)
      if (!board) return response.status(404).json({ error: 'Tournament not found.' })
      const onRoster = board.players.some((player) => player.discordId === user.discordId)
      if (!user.isManager && !onRoster) {
        return response.status(403).json({ error: 'You are not on this tournament roster.' })
      }
      return response.json({
        ...board,
        canEditAll: Boolean(user.isManager),
        locked: board.tournament.locked,
        user,
      })
    }

    const tournaments = await listTournamentsForUser(user.discordId, Boolean(user.isManager))
    return response.json({ tournaments, user })
  } catch (error) {
    return sendError(response, error)
  }
}
