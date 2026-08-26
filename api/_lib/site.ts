import { readFileSync } from 'node:fs'
import path from 'node:path'

export type SiteConfig = {
  siteTitle: string
  siteName: string
  networkName: string
  description: string
  themeColor: string
  sessionCookie: string
  publicEyebrow: string
  applyTitle: string
  applyBlocked: string
  discordFooter: string
  discordWebhookName: string
  tenureNote: string
  formerMemberReason: string
}

let cached: SiteConfig | null = null

export function readSite(): SiteConfig {
  if (cached) return cached
  const file = path.join(process.cwd(), 'config', 'site.json')
  cached = JSON.parse(readFileSync(file, 'utf8')) as SiteConfig
  return cached
}
