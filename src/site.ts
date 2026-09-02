import siteJson from '../config/site.json' with { type: 'json' }

export const site = { ...siteJson }

export function applyRuntimeSite(next?: Partial<typeof siteJson> | null) {
  if (!next || typeof next !== 'object') return
  Object.assign(site, next)
}
