import { convertConditions } from './convertConditions'

type SkillLike = {
  description?: string
  preconditions?: unknown
  effect?: Array<{ description?: string; conditions?: unknown; preconditions?: unknown }>
}

function lower(value: unknown) {
  return String(value ?? '').toLowerCase()
}

function flattenTexts(values: unknown, out: unknown[] = []) {
  const list = Array.isArray(values) ? values : []
  for (const value of list) {
    if (Array.isArray(value)) flattenTexts(value, out)
    else if (value != null && value !== '') out.push(value)
  }
  return out
}

function collectTexts(skill: SkillLike) {
  const texts: unknown[] = []
  if (Array.isArray(skill.preconditions)) texts.push(...flattenTexts(skill.preconditions))
  if (Array.isArray(skill.effect)) {
    for (const effect of skill.effect) {
      if (Array.isArray(effect.preconditions)) texts.push(...flattenTexts(effect.preconditions))
      if (Array.isArray(effect.conditions)) texts.push(...effect.conditions)
      if (effect.description) texts.push(effect.description)
    }
  }
  if (skill.description) texts.push(skill.description)
  return texts.map((text) => lower(text))
}

function extractRemainingDistanceMeters(text: string) {
  const normalized = lower(text)
  const direct = normalized.match(/(?:last\s+)?(\d+)\s*m(?:eters?)?\s*(?:remaining|of the race|or less remaining)?/)
  if (direct) return Number(direct[1])
  const withRemaining = normalized.match(/with\s+(\d+)\s*m(?:eters?)?\s*or less remaining/)
  if (withRemaining) return Number(withRemaining[1])
  return null
}

export type ActivationTrigger = Record<string, unknown>
export type ActivationMap = { show_chart: boolean; triggers: ActivationTrigger[] }

/** Same rules as scripts/generateActivationMaps.js. */
export function buildActivationMapForSkill(skill: SkillLike): ActivationMap | null {
  const texts = collectTexts(skill)
  const allText = texts.join(' | ')
  const triggers: ActivationTrigger[] = []
  const courseFields: Record<string, string[]> = {}

  if (/\b(sprint|mile|medium|long)\b/.test(allText)) {
    const found = new Set<string>()
    for (const text of texts) {
      for (const item of text.match(/\b(sprint|mile|medium|long)\b/g) ?? []) found.add(item)
    }
    if (found.size) courseFields.distance_types = [...found]
  }
  const terrains: string[] = []
  if (allText.includes('turf')) terrains.push('turf')
  if (allText.includes('dirt')) terrains.push('dirt')
  if (terrains.length) courseFields.terrains = terrains
  const directions: string[] = []
  if (allText.includes('counterclockwise') || allText.includes('left-handed') || allText.includes('left handed')) {
    directions.push('counterclockwise')
  }
  if (/\bclockwise\b/.test(allText) || allText.includes('right-handed') || allText.includes('right handed')) {
    directions.push('clockwise')
  }
  if (directions.length) courseFields.directions = directions

  if (allText.includes('final corner')) {
    triggers.push({ type: 'box', target: 'layout', match: 'corner', select: 'last' })
  }
  if (allText.includes('any corner') || allText.includes('random point on a random corner') || allText.includes('random point on corner 1/2/3/4')) {
    triggers.push({ type: 'box', target: 'layout', match: 'corner' })
  }
  if (allText.includes('not a corner')) triggers.push({ type: 'box', target: 'layout', match: 'not_a_corner' })
  if (allText.includes('random point on a random straight')) triggers.push({ type: 'box', target: 'layout', match: 'straight' })
  if (allText.includes('final straight')) triggers.push({ type: 'box', target: 'layout', match: 'straight', select: 'last' })
  if (allText.includes('second half of early race')) {
    triggers.push({
      type: 'box', target: 'zones', labels: ['opening leg', 'early'],
      clip_within_segment_start_ratio: 0.5, clip_within_segment_end_ratio: 1,
    })
  }
  if (allText.includes('first half of mid race')) {
    triggers.push({
      type: 'box', target: 'zones', labels: ['middle leg', 'mid'],
      clip_within_segment_start_ratio: 0, clip_within_segment_end_ratio: 0.5,
    })
  }
  for (const text of texts) {
    const meters = extractRemainingDistanceMeters(text)
    if (Number.isFinite(meters) && meters && meters > 0) {
      triggers.push({ type: 'line', distance_mode: 'remaining', value: meters })
    }
  }
  if (!triggers.length) return null
  for (const trigger of triggers) {
    for (const [key, value] of Object.entries(courseFields)) {
      if (trigger[key] == null) trigger[key] = value
    }
  }
  return { show_chart: true, triggers }
}

/** English condition lines, or raw condition code, → an activation_map (or null). */
export function suggestActivationMap(input: string): ActivationMap | null {
  const text = String(input || '').trim()
  if (!text) return null
  const looksLikeCode = /[a-zA-Z_]+\s*(>=|<=|==|!=|>|<)/.test(text)
  const lines = looksLikeCode
    ? convertConditions(text).lines
    : text.split(/\r?\n/).map((line) => line.replace(/^["']|["'],?$/g, '').trim()).filter(Boolean)
  return buildActivationMapForSkill({
    description: lines.join(' '),
    effect: [{ description: lines.join(' '), conditions: lines }],
  })
}
