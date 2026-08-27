import type { VercelRequest, VercelResponse } from '@vercel/node'
import { clearSessionCookie, readSession, sendError } from '../_lib/auth.js'
import { DEFAULT_THEME } from '../_lib/themes.js'

export default async function handler(request: VercelRequest, response: VercelResponse) {
  try {
    if (request.method === 'GET') {
      let theme = DEFAULT_THEME
      try {
        const { getSiteTheme } = await import('../_lib/db.js')
        theme = await getSiteTheme()
      } catch {
        // Local or missing DB should still return auth.
      }
      const user = await readSession(request)
      if (!user) return response.json({ authenticated: false, theme })
      return response.json({ authenticated: true, user, theme })
    }

    if (request.method === 'POST' || request.method === 'DELETE') {
      clearSessionCookie(response)
      return response.json({ ok: true })
    }

    return response.status(405).json({ error: 'Method not allowed.' })
  } catch (error) {
    return sendError(response, error)
  }
}
