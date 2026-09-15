import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { findBlacklistMatch, upsertApplicant } from './_lib/db.js'
import { notifyApplication } from './_lib/discord.js'
import { loadClubs, resolveUmaProfile, sendError } from './_lib/shared.js'
import { readSite } from './_lib/site.js'

const applySchema = z.object({
  umaId: z.string().trim().regex(/^\d+$/, 'Uma ID must contain only digits.'),
  discordUsername: z.string().trim().min(2).max(64),
  targetClubId: z.string().trim().optional().default(''),
  targetClubIds: z.array(z.string().trim().min(1)).optional(),
  notes: z.string().trim().max(2000).default(''),
}).superRefine((input, ctx) => {
  const ids = input.targetClubIds?.length ? input.targetClubIds : (input.targetClubId ? [input.targetClubId] : [])
  if (!ids.length) ctx.addIssue({ code: 'custom', message: 'Select at least one club.', path: ['targetClubIds'] })
})

export default async function handler(request: VercelRequest, response: VercelResponse) {
  try {
    if (request.method === 'GET') {
      const clubs = await loadClubs()
      return response.json({
        clubs: clubs.map((club) => ({ circleId: club.circleId, name: club.name })),
      })
    }
    if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' })

    const input = applySchema.parse(request.body)
    const clubs = await loadClubs()
    const targetClubIds = [...new Set((input.targetClubIds?.length ? input.targetClubIds : [input.targetClubId]).filter(Boolean))]
    const selected = targetClubIds.map((id) => clubs.find((item) => item.circleId === id))
    if (!targetClubIds.length || selected.some((club) => !club)) {
      return response.status(400).json({ error: 'Selected club is not accepting applications.' })
    }
    const clubNames = selected.map((club) => club!.name)

    const blocked = await findBlacklistMatch(input.umaId, input.discordUsername)
    if (blocked) {
      return response.status(403).json({ error: readSite().applyBlocked })
    }

    const profile = await resolveUmaProfile(input.umaId)
    const applicant = await upsertApplicant({
      umaId: input.umaId,
      ign: profile.ign,
      discordUsername: input.discordUsername,
      targetClubId: targetClubIds[0],
      targetClubIds,
      status: 'pending',
      privateNotes: input.notes,
      publishPublicly: true,
      currentClubId: profile.currentClubId,
      currentClubName: profile.currentClubName,
      lastUpdatedAt: profile.lastUpdatedAt,
      totalFans: profile.totalFans,
      monthlyGain: profile.monthlyGain,
      dailyAverage: profile.dailyAverage,
      todayGain: profile.todayGain,
      dailyGains: profile.dailyGains,
    })

    await notifyApplication({
      ign: applicant.ign,
      umaId: applicant.umaId,
      discordUsername: input.discordUsername,
      clubName: clubNames.join(', '),
      dailyAverage: profile.dailyAverage,
      monthlyGain: profile.monthlyGain,
      dailyGains: profile.dailyGains,
      notes: input.notes,
      currentClubName: profile.currentClubName,
    })

    return response.status(201).json({
      ok: true,
      applicant: {
        umaId: applicant.umaId,
        ign: applicant.ign,
        targetClubId: applicant.targetClubId,
        targetClubIds: applicant.targetClubIds,
        status: applicant.status,
      },
    })
  } catch (error) {
    return sendError(response, error)
  }
}
