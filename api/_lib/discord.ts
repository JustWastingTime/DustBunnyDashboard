const number = new Intl.NumberFormat('en-US')

export type ApplyNotifyInput = {
  ign: string
  umaId: string
  discordUsername: string
  clubName: string
  clubId: string
  dailyAverage: number
  monthlyGain: number
  todayGain: number
  totalFans: number
  dailyGains: number[]
  notes?: string
  currentClubName?: string | null
  siteUrl?: string
}

function chartConfig(dailyGains: number[]) {
  const values = dailyGains.slice(-30)
  const labels = values.map((_, index) => String(index + 1))
  return {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Daily fans',
        data: values,
        backgroundColor: 'rgba(229, 122, 155, 0.75)',
        borderColor: 'rgba(196, 93, 122, 1)',
        borderWidth: 1,
        borderRadius: 3,
      }],
    },
    options: {
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: 'Last 30 days · daily fan gain',
          color: '#5c3a46',
          font: { size: 14, weight: '600' },
        },
      },
      scales: {
        x: {
          ticks: { maxTicksLimit: 10, color: '#8a6a74', font: { size: 10 } },
          grid: { display: false },
        },
        y: {
          ticks: { color: '#8a6a74', font: { size: 10 } },
          grid: { color: 'rgba(196, 93, 122, 0.12)' },
        },
      },
    },
  }
}

async function chartImageUrl(dailyGains: number[]) {
  if (!dailyGains.length) return null
  try {
    const response = await fetch('https://quickchart.io/chart/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        width: 640,
        height: 280,
        backgroundColor: '#fff8fa',
        format: 'png',
        chart: chartConfig(dailyGains),
      }),
    })
    if (!response.ok) return null
    const payload = await response.json() as { success?: boolean; url?: string }
    return payload.url || null
  } catch {
    return null
  }
}

function buildEmbed(input: ApplyNotifyInput, chartUrl: string | null) {
  const fields = [
    { name: 'IGN', value: input.ign, inline: true },
    { name: 'Discord', value: input.discordUsername, inline: true },
    { name: 'Applying to', value: input.clubName, inline: true },
    { name: 'Uma ID', value: `\`${input.umaId}\``, inline: true },
    { name: 'Daily average', value: `${number.format(input.dailyAverage)} / day`, inline: true },
    { name: 'Monthly gain', value: number.format(input.monthlyGain), inline: true },
    { name: 'Today', value: `+${number.format(input.todayGain)}`, inline: true },
    { name: 'Total fans', value: number.format(input.totalFans), inline: true },
  ]
  if (input.currentClubName) {
    fields.push({ name: 'Current club', value: input.currentClubName, inline: true })
  }
  if (input.notes?.trim()) {
    fields.push({ name: 'Notes', value: input.notes.trim().slice(0, 900), inline: false })
  }

  return {
    title: 'New club application',
    description: `**${input.ign}** applied to **${input.clubName}**.`,
    color: 0xe57a9b,
    fields,
    image: chartUrl ? { url: chartUrl } : undefined,
    footer: { text: 'Dust Bunny Dashboard · pending review' },
    timestamp: new Date().toISOString(),
    url: input.siteUrl ? `${input.siteUrl.replace(/\/$/, '')}/staff` : undefined,
  }
}

/** Posts an application notice to Discord. Never throws — apply flow must not fail on notify. */
export async function notifyApplication(input: ApplyNotifyInput) {
  const webhook = String(process.env.DISCORD_APPLY_WEBHOOK_URL || '').trim()
  if (!webhook) return { sent: false as const, reason: 'not_configured' as const }

  try {
    const chartUrl = await chartImageUrl(input.dailyGains)
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'Club Applications',
        embeds: [buildEmbed(input, chartUrl)],
      }),
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      console.error('Discord apply webhook failed', response.status, body.slice(0, 300))
      return { sent: false as const, reason: 'http_error' as const }
    }
    return { sent: true as const }
  } catch (error) {
    console.error('Discord apply webhook error', error)
    return { sent: false as const, reason: 'exception' as const }
  }
}
