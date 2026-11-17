import type { RawEntry, RawQuestion } from './api'

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' }

/** Mirrors the bot: resolveMcqAnswers pads wrong answers from $pools up to this many. */
export const MIN_WRONG = 3

export type EditEntry = {
  uid: string
  subject: string
  correct: string
  wrong: string[]
  difficulty: string
  flags: string[]
  /** Old flat rows (no answers list) that the bot skips; saving the question rewrites them. */
  legacy?: boolean
  /** Object-form entries are kept as-is; the editor shows them read-only. */
  raw?: Record<string, unknown>
}

export type EditQuestion = {
  shape: 'template' | 'fixed'
  promptKey: 'promptTemplate' | 'prompt'
  prompt: string
  difficulty: string
  extra: Record<string, unknown>
  entries: EditEntry[]
  /** Original key order, so saving keeps the file's layout. */
  keyOrder: string[]
}

let uidCounter = 0
export const uid = () => `e${++uidCounter}`

export function blankEntry(): EditEntry {
  return { uid: uid(), subject: '', correct: '', wrong: [], difficulty: '', flags: [] }
}

export function entryFromRaw(raw: RawEntry): EditEntry {
  if (!Array.isArray(raw)) {
    const answers = Array.isArray(raw.answers) ? raw.answers.map(String) : []
    return { uid: uid(), subject: String(raw.subject ?? raw.imageUrl ?? raw.audioUrl ?? raw.prompt ?? ''), correct: answers[0] || '', wrong: answers.slice(1), difficulty: String(raw.difficulty || ''), flags: [], raw }
  }
  if (!Array.isArray(raw[1])) {
    const flat = (raw as unknown[]).map((value) => String(value ?? ''))
    return { uid: uid(), subject: '', correct: flat[0] || '', wrong: flat.slice(1), difficulty: '', flags: [], legacy: true }
  }
  const [subject, answers, ...rest] = raw
  const list = Array.isArray(answers) ? answers.map(String) : []
  const difficulty = rest.find((value) => (DIFFICULTIES as readonly string[]).includes(String(value).toLowerCase())) || ''
  return {
    uid: uid(),
    subject: String(subject ?? ''),
    correct: list[0] || '',
    wrong: list.slice(1),
    difficulty: String(difficulty).toLowerCase(),
    flags: rest.map(String).filter((value) => value.toLowerCase() !== String(difficulty).toLowerCase()),
  }
}

export function entryToRaw(entry: EditEntry): RawEntry {
  if (entry.raw) return entry.raw
  const answers = [entry.correct, ...entry.wrong.filter((w) => w.trim())]
  const out: RawEntry = [entry.subject, answers]
  if (entry.difficulty) out.push(entry.difficulty)
  out.push(...entry.flags)
  return out
}

export function questionFromRaw(raw: RawQuestion): EditQuestion {
  const extra: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (['promptTemplate', 'prompt', 'difficulty', 'entries', 'answers'].includes(key)) continue
    extra[key] = value
  }
  if (Array.isArray(raw.entries)) {
    const promptKey = raw.promptTemplate != null ? 'promptTemplate' : 'prompt'
    return {
      shape: 'template',
      promptKey,
      prompt: String(raw[promptKey] ?? ''),
      difficulty: String(raw.difficulty || ''),
      extra,
      entries: raw.entries.map(entryFromRaw),
      keyOrder: Object.keys(raw),
    }
  }
  if (raw.promptTemplate != null) extra.promptTemplate = raw.promptTemplate
  const answers = Array.isArray(raw.answers) ? raw.answers.map(String) : []
  return {
    shape: 'fixed',
    promptKey: 'prompt',
    prompt: String(raw.prompt ?? ''),
    difficulty: String(raw.difficulty || ''),
    extra,
    entries: [{ ...blankEntry(), correct: answers[0] || '', wrong: answers.slice(1) }],
    keyOrder: Object.keys(raw),
  }
}

function ordered(fields: Record<string, unknown>, keyOrder: string[]): RawQuestion {
  const out: RawQuestion = {}
  for (const key of keyOrder) if (key in fields) out[key] = fields[key]
  for (const key of Object.keys(fields)) if (!(key in out)) out[key] = fields[key]
  // Entries and answers stay last, as in the hand-written files.
  for (const key of ['entries', 'answers']) {
    if (key in out && !keyOrder.includes(key)) {
      const value = out[key]
      delete out[key]
      out[key] = value
    }
  }
  return out
}

export function questionToRaw(q: EditQuestion): RawQuestion {
  const difficulty = q.difficulty ? { difficulty: q.difficulty } : {}
  if (q.shape === 'template') {
    return ordered({ [q.promptKey]: q.prompt, ...difficulty, ...q.extra, entries: q.entries.map(entryToRaw) }, q.keyOrder)
  }
  const first = q.entries[0] || blankEntry()
  return ordered({ prompt: q.prompt, ...difficulty, ...q.extra, answers: [first.correct, ...first.wrong.filter((w) => w.trim())] }, q.keyOrder)
}

export function newQuestion(): EditQuestion {
  return { shape: 'template', promptKey: 'promptTemplate', prompt: '', difficulty: 'easy', extra: {}, entries: [blankEntry()], keyOrder: [] }
}

export const isToken = (value: string) => value.startsWith('$') && value.length > 1
export const isUrl = (value: string) => /^https?:\/\//i.test(value)
export const isImageUrl = (value: string) => isUrl(value) && /\.(png|jpe?g|gif|webp|bmp|svg)(?:[?#].*)?$/i.test(value)
export const usesSlot = (prompt: string) => prompt.includes('{0}') || prompt.includes('{name}')
export const fillPrompt = (prompt: string, subject: string) => prompt.replace(/\{0\}/g, subject).replace(/\{name\}/g, subject)

export type Check = { level: 'error' | 'warn'; text: string; entry?: number }

const norm = (value: string) => value.trim().toLowerCase()

export function checkQuestion(q: EditQuestion, lists: Record<string, string[]>): Check[] {
  const out: Check[] = []
  if (!q.prompt.trim()) out.push({ level: 'error', text: 'The prompt is empty.' })
  if (q.shape === 'template' && !q.entries.length) out.push({ level: 'error', text: 'Add at least one entry.' })
  const slot = usesSlot(q.prompt)
  const subjects = new Map<string, number>()
  const corrects = new Map<string, number[]>()
  q.entries.forEach((entry, i) => {
    if (entry.raw) return
    const n = i + 1
    const label = q.shape === 'fixed' ? 'Answers' : `Entry ${n}`
    if (entry.legacy) out.push({ level: 'warn', text: `${label} was in an old format the bot skips. Saving this question fixes it.`, entry: i })
    if (q.shape === 'template') {
      if (slot && !entry.subject.trim()) out.push({ level: 'error', text: `${label} needs a subject for {0}.`, entry: i })
      if (!slot && entry.subject.trim() && !isUrl(entry.subject)) out.push({ level: 'warn', text: `${label}: the subject is not shown because the prompt has no {0}.`, entry: i })
      const key = norm(entry.subject)
      if (key) {
        if (subjects.has(key)) out.push({ level: 'warn', text: `${label} repeats the subject of entry ${(subjects.get(key) || 0) + 1}.`, entry: i })
        else subjects.set(key, i)
      }
    }
    if (!entry.correct.trim()) out.push({ level: 'error', text: `${label} has no correct answer.`, entry: i })
    else if (isToken(entry.correct)) out.push({ level: 'error', text: `${label}: the correct answer cannot be a random token.`, entry: i })
    else corrects.set(norm(entry.correct), [...(corrects.get(norm(entry.correct)) || []), n])
    const tokens = entry.wrong.filter(isToken)
    for (const token of tokens) {
      if (!Array.isArray(lists[token.slice(1)])) out.push({ level: 'error', text: `${label}: there is no ${token} pool.`, entry: i })
    }
    const plain = entry.wrong.filter((w) => !isToken(w) && w.trim())
    const all = [entry.correct, ...plain].map(norm).filter(Boolean)
    if (new Set(all).size !== all.length) out.push({ level: 'warn', text: `${label} lists the same answer twice.`, entry: i })
    if (!tokens.length && plain.length === 0) out.push({ level: 'error', text: `${label} has no wrong answers. Add some or a $pool.`, entry: i })
    else if (!tokens.length && plain.length < MIN_WRONG) out.push({ level: 'warn', text: `${label} shows only ${plain.length + 1} options.`, entry: i })
  })
  if (q.shape === 'template') {
    for (const rows of corrects.values()) {
      if (rows.length > 1 && rows.length <= 4) out.push({ level: 'warn', text: `“${q.entries[rows[0] - 1].correct}” is the answer to entries ${rows.join(', ')}. Fine if intended.` })
    }
  }
  return out
}

function rng(seed: number) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

export type PreviewOption = { text: string; correct: boolean; token: string | null }

/** Same rules as the bot's resolveMcqAnswers, with a seed so Reroll is stable per click. */
export function previewOptions(entry: EditEntry, lists: Record<string, string[]>, seed: number): PreviewOption[] {
  const random = rng(seed)
  const correct = entry.correct.trim()
  if (!correct) return []
  const exclude = new Set([norm(correct)])
  const options: PreviewOption[] = [{ text: correct, correct: true, token: null }]
  for (const w of entry.wrong) {
    if (isToken(w) || !w.trim()) continue
    options.push({ text: w.trim(), correct: false, token: null })
    exclude.add(norm(w))
  }
  const pools = [...new Set(entry.wrong.filter(isToken))]
  const pool = [...new Set(pools.flatMap((token) => (lists[token.slice(1)] || []).map((name) => ({ name, token }))).map((item) => JSON.stringify(item)))].map((s) => JSON.parse(s) as { name: string; token: string })
  let wrong = options.length - 1
  let attempts = 0
  while (wrong < MIN_WRONG && attempts < Math.max(pool.length, MIN_WRONG) * 2) {
    const available = pool.filter((item) => !exclude.has(norm(item.name)))
    if (!available.length) break
    const pick = available[Math.floor(random() * available.length)]
    options.push({ text: pick.name, correct: false, token: pick.token })
    exclude.add(norm(pick.name))
    wrong += 1
    attempts += 1
  }
  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[options[i], options[j]] = [options[j], options[i]]
  }
  return options
}

/** Paste rows: `subject | correct | wrong, wrong` (tab works too), or one JSON array per line. */
export function parsePastedRows(text: string): EditEntry[] {
  const rows: EditEntry[] = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim().replace(/,$/, '')
    if (!trimmed) continue
    if (trimmed.startsWith('[')) {
      try {
        rows.push(entryFromRaw(JSON.parse(trimmed) as RawEntry))
        continue
      } catch {
        // fall through to the column format
      }
    }
    const cells = trimmed.includes('\t') ? trimmed.split('\t') : trimmed.split('|')
    const [subject = '', correct = '', wrong = '', difficulty = ''] = cells.map((cell) => cell.trim())
    rows.push({
      ...blankEntry(),
      subject,
      correct,
      wrong: wrong.split(',').map((w) => w.trim()).filter(Boolean),
      difficulty: (DIFFICULTIES as readonly string[]).includes(difficulty.toLowerCase()) ? difficulty.toLowerCase() : '',
    })
  }
  return rows
}

export function shapeOf(q: RawQuestion): string {
  if (!Array.isArray(q.entries)) return 'Fixed answers'
  const url = q.entries.map((e) => (Array.isArray(e) ? String(e[0] ?? '') : '')).find(isUrl)
  if (url) return isImageUrl(url) ? 'Image' : 'Audio'
  return 'Template'
}

export const IMPORT_KEY = 'tazuna-quiz-import'
export type PendingImport = { categoryId: string; question: number | 'new'; promptTemplate: string; entries: RawEntry[] }
