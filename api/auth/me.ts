import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readSession, sendError } from '../_lib/shared.js'

export default async function handler(request: VercelRequest, response: VercelResponse) {
  try {
    if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed.' })
    const user = await readSession(request)
    if (!user) return response.json({ authenticated: false })
    return response.json({ authenticated: true, user })
  } catch (error) {
    return sendError(response, error)
  }
}
