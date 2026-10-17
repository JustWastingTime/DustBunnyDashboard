const CHAIN_MARK = /^[（(]?[❯>]+[）)]?\s*$/
const CHOICE_MARK = /^(?:[（(])?(Top|Bottom|Bot|Middle|Mid|Left|Right|Option\s*\d+)(?:[）)])?$/i
const RANDOM_EITHER = /^randomly\s+either$/i
const OR_SEP = /^or$/i

export type ParsedEvent = { name: string; type: 'event' | 'chain'; results: string[] }

function isRewardLine(line: string) {
  return /(?:\+|-)\d+|hint|bond|energy|mood|skill points|event chain ended|fans/i.test(line)
}
function isChoiceLabel(line: string) { return CHOICE_MARK.test(line.trim()) }
function isRandomEither(line: string) { return RANDOM_EITHER.test(line.trim()) }
function isOrSeparator(line: string) { return OR_SEP.test(line.trim()) }
function isStructureLine(line: string) {
  const t = line.trim()
  return isChoiceLabel(t) || isRandomEither(t) || isOrSeparator(t) || CHAIN_MARK.test(t)
}

function normalizeReward(line: string) {
  const text = line.trim()
  if (!text) return ''
  const namedBond = text.match(/^(.+?)\s+bond\s*([+-]?\d+)\s*$/i)
  if (namedBond) {
    const delta = namedBond[2].startsWith('+') || namedBond[2].startsWith('-') ? namedBond[2] : `+${namedBond[2]}`
    return `Bond ${delta}`
  }
  const bareBond = text.match(/^bond\s*([+-]?\d+)\s*$/i)
  if (bareBond) {
    const delta = bareBond[1].startsWith('+') || bareBond[1].startsWith('-') ? bareBond[1] : `+${bareBond[1]}`
    return `Bond ${delta}`
  }
  return text
}

function joinBranch(lines: string[]) {
  const normalized = lines.map(normalizeReward).filter(Boolean)
  if (!normalized.length) return ''
  const bonds = normalized.filter((text) => /^Bond\s*[+-]?\d+/i.test(text))
  const hints = normalized.filter((text) => /\bhint\b/i.test(text))
  if (!bonds.length || !hints.length) return normalized.join(', ')
  const out: string[] = []
  let emitted = false
  for (const item of normalized) {
    if (/^Bond\s*[+-]?\d+/i.test(item) || /\bhint\b/i.test(item)) {
      if (!emitted) { out.push(...bonds, ...hints); emitted = true }
      continue
    }
    out.push(item)
  }
  return out.join(', ')
}

function joinRewards(lines: string[]) {
  const cleaned = lines.map((line) => line.trim()).filter((line) => line && !isChoiceLabel(line))
  if (cleaned.some(isRandomEither) || cleaned.some(isOrSeparator)) {
    const branches: string[][] = []
    let current: string[] = []
    for (const line of cleaned.filter((item) => !isRandomEither(item))) {
      if (isOrSeparator(line)) { branches.push(current); current = []; continue }
      current.push(line)
    }
    branches.push(current)
    return branches.map(joinBranch).filter(Boolean).join(', OR ')
  }
  return joinBranch(cleaned)
}

function parseSingleEvent(text: string): ParsedEvent | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length)
  if (!lines.length) return null
  const type = lines.some((line) => CHAIN_MARK.test(line.trim())) ? 'chain' : 'event'
  const body = lines.filter((line) => !CHAIN_MARK.test(line))
  const choiceIndexes: number[] = []
  body.forEach((line, index) => { if (isChoiceLabel(line)) choiceIndexes.push(index) })
  if (choiceIndexes.length >= 1) {
    const name = body.slice(0, choiceIndexes[0]).filter((line) => !isStructureLine(line)).join(' ').trim() || 'Untitled Event'
    const results: string[] = []
    for (let c = 0; c < choiceIndexes.length; c += 1) {
      const start = choiceIndexes[c]
      const end = c + 1 < choiceIndexes.length ? choiceIndexes[c + 1] : body.length
      results.push(joinRewards(body.slice(start + 1, end)))
    }
    return { name, type, results: results.filter((result) => result.length) }
  }
  let name = ''
  const rewards: string[] = []
  for (const line of body) {
    if (isStructureLine(line) && !isRandomEither(line) && !isOrSeparator(line)) continue
    if (!name && !isRewardLine(line) && !isRandomEither(line) && !isOrSeparator(line)) {
      name = line.replace(/^[（(]?[❯>]+[）)]?\s*/, '').trim()
      continue
    }
    if (!name) { name = line; continue }
    rewards.push(line)
  }
  if (!name) return null
  return { name, type, results: [joinRewards(rewards) || ''] }
}

/** Pasted event text → supporter.json event objects. */
export function parseEvents(input: string): ParsedEvent[] {
  const raw = String(input || '').trim()
  if (!raw) return []
  const chunks: string[] = []
  let current: string[] = []
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (current.length) { chunks.push(current.join('\n')); current = [] }
      continue
    }
    if (CHAIN_MARK.test(trimmed) && current.length) {
      chunks.push(current.join('\n'))
      current = [trimmed]
      continue
    }
    current.push(trimmed)
  }
  if (current.length) chunks.push(current.join('\n'))
  return chunks.map(parseSingleEvent).filter((event): event is ParsedEvent => Boolean(event))
}
