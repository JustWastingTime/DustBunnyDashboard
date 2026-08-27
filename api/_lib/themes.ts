export const THEME_IDS = ['blossom', 'ocean', 'forest', 'dusk', 'sand', 'slate', 'night'] as const

export type ThemeId = (typeof THEME_IDS)[number]

export const DEFAULT_THEME: ThemeId = 'blossom'

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value)
}
