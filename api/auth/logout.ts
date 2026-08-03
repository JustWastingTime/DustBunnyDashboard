import type { VercelRequest, VercelResponse } from '@vercel/node'
import { clearSessionCookie, sendError } from '../_lib/shared.js'

export default async function handler(request: VercelRequest, response: VercelResponse) {
  try {
    if (request.method !== 'POST' && request.method !== 'GET') {
      return response.status(405).json({ error: 'Method not allowed.' })
    }
    clearSessionCookie(response)
    if (request.method === 'GET') {
      response.writeHead(302, { Location: '/' })
      response.end()
      return
    }
    return response.json({ ok: true })
  } catch (error) {
    return sendError(response, error)
  }
}
