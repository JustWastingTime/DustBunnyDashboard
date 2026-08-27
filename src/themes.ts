export const THEME_IDS = ['blossom', 'ocean', 'forest', 'dusk', 'sand', 'slate', 'night'] as const

export type ThemeId = (typeof THEME_IDS)[number]

export const DEFAULT_THEME: ThemeId = 'blossom'

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value)
}

export const THEMES: Array<{ id: ThemeId; label: string; hint: string; swatch: string }> = [
  { id: 'blossom', label: 'Blossom', hint: 'Dust Bunny pink', swatch: '#e57a9b' },
  { id: 'ocean', label: 'Ocean', hint: 'Cool blue', swatch: '#3d8ebd' },
  { id: 'forest', label: 'Forest', hint: 'Leaf green', swatch: '#4f9a6a' },
  { id: 'dusk', label: 'Dusk', hint: 'Violet', swatch: '#8a5cad' },
  { id: 'sand', label: 'Sand', hint: 'Warm gold', swatch: '#c4844a' },
  { id: 'slate', label: 'Slate', hint: 'Quiet teal', swatch: '#5b7c8a' },
  { id: 'night', label: 'Night', hint: 'Dark mode', swatch: '#2a2428' },
]

const STORAGE_KEY = 'club-theme'

export function applySiteTheme(theme?: string | null) {
  const id = isThemeId(theme) ? theme : isThemeId(localStorage.getItem(STORAGE_KEY)) ? localStorage.getItem(STORAGE_KEY) as ThemeId : DEFAULT_THEME
  document.documentElement.dataset.theme = id
  if (isThemeId(theme)) localStorage.setItem(STORAGE_KEY, theme)
}
