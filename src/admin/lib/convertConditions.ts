import rulesJson from './conditions.json'

type FieldDef = {
  values?: Record<string, string>
  ops?: Record<string, string | Record<string, string>>
  label?: string
  bare?: string
  special?: string
}

type Rules = {
  fields: Record<string, FieldDef>
  compounds?: { match: string[]; text: string }[]
  order_rate_notes?: Record<string, Record<string, string>>
  fieldOrder?: string[]
}

const RULES = rulesJson as Rules
const FIELD_RANK = new Map((RULES.fieldOrder || []).map((name, index) => [name, index]))
const OP_RE = /(>=|<=|==|!=|>|<)/
const CM_FIELD = 9
const TT_FIELD = 12

type Placement = { cm: { start: number; end: number } | null; tt: { start: number; end: number } | null }
  | { cm?: { op: string; value: number }; tt?: { op: string; value: number } }

function normalizeOps(text: string) {
  return String(text || '').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/\r/g, '')
}

function splitTopLevel(expr: string, joinerChars: string[]) {
  const parts: { text: string; joiner: string | null }[] = []
  let buf = ''
  let depth = 0
  for (let i = 0; i < expr.length; i += 1) {
    const ch = expr[i]
    if (ch === '(') depth += 1
    if (ch === ')') depth = Math.max(0, depth - 1)
    if (depth === 0 && joinerChars.includes(ch)) {
      if (buf.trim()) parts.push({ text: buf.trim(), joiner: ch })
      buf = ''
      continue
    }
    buf += ch
  }
  if (buf.trim()) parts.push({ text: buf.trim(), joiner: null })
  return parts
}

function stripParens(s: string) {
  let t = s.trim()
  while (t.startsWith('(') && t.endsWith(')')) {
    let depth = 0
    let balanced = true
    for (let i = 0; i < t.length; i += 1) {
      if (t[i] === '(') depth += 1
      if (t[i] === ')') depth -= 1
      if (depth === 0 && i < t.length - 1) { balanced = false; break }
    }
    if (!balanced || depth !== 0) break
    t = t.slice(1, -1).trim()
  }
  return t
}

function fieldRank(field: string | null) {
  if (!field) return 9000
  if (FIELD_RANK.has(field)) return FIELD_RANK.get(field) as number
  return 8000
}

function phaseLabel(value: string) {
  return RULES.fields.phase?.values?.[String(value)] || `phase ${value}`
}

function ordinal(n: number) {
  const num = Number(n)
  const v = num % 100
  if (v >= 11 && v <= 13) return `${num}th`
  switch (num % 10) {
    case 1: return `${num}st`
    case 2: return `${num}nd`
    case 3: return `${num}rd`
    default: return `${num}th`
  }
}

function positionRange(op: string, value: number, fieldSize: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  let start = 1
  let end = fieldSize
  if (op === '>=') { start = n; end = fieldSize }
  else if (op === '>') { start = n + 1; end = fieldSize }
  else if (op === '<=') { start = 1; end = n }
  else if (op === '<') { start = 1; end = n - 1 }
  else if (op === '==') return ordinal(n)
  else return null
  start = Math.max(1, Math.min(fieldSize, start))
  end = Math.max(1, Math.min(fieldSize, end))
  if (start > end) return null
  if (start === end) return ordinal(start)
  return `${ordinal(start)} to ${ordinal(end)}`
}

function applyPlacementBound(bounds: { start: number; end: number }, op: string, value: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return
  if (op === '>=') bounds.start = Math.max(bounds.start, n)
  else if (op === '>') bounds.start = Math.max(bounds.start, n + 1)
  else if (op === '<=') bounds.end = Math.min(bounds.end, n)
  else if (op === '<') bounds.end = Math.min(bounds.end, n - 1)
  else if (op === '==') { bounds.start = n; bounds.end = n }
}

function mergePlacementConstraints(constraints: { side: string; op: string; value: number }[]) {
  if (!constraints.length) return null
  const cm = { start: 1, end: CM_FIELD }
  const tt = { start: 1, end: TT_FIELD }
  let hasCm = false
  let hasTt = false
  for (const c of constraints) {
    if (c.side === 'cm') { applyPlacementBound(cm, c.op, c.value); hasCm = true }
    else if (c.side === 'tt') { applyPlacementBound(tt, c.op, c.value); hasTt = true }
  }
  if (!hasCm && !hasTt) return null
  return { cm: hasCm ? cm : null, tt: hasTt ? tt : null }
}

function extractPlacementHints(raw: string) {
  const text = normalizeOps(raw)
  const constraints: { side: string; op: string; value: number }[] = []
  const patterns = [
    {
      re: /\(\s*CM\s*(>=|<=|==|!=|>|<)\s*(-?\d+)\s*\|\s*(?:LoH|LOH|TT)\s*(>=|<=|==|!=|>|<)\s*(-?\d+)\s*\)/gi,
      map: (cmOp: string, cmVal: string, ttOp: string, ttVal: string) => {
        constraints.push({ side: 'cm', op: cmOp, value: Number(cmVal) })
        constraints.push({ side: 'tt', op: ttOp, value: Number(ttVal) })
      },
    },
    {
      re: /\(\s*(?:LoH|LOH|TT)\s*(>=|<=|==|!=|>|<)\s*(-?\d+)\s*\|\s*CM\s*(>=|<=|==|!=|>|<)\s*(-?\d+)\s*\)/gi,
      map: (ttOp: string, ttVal: string, cmOp: string, cmVal: string) => {
        constraints.push({ side: 'tt', op: ttOp, value: Number(ttVal) })
        constraints.push({ side: 'cm', op: cmOp, value: Number(cmVal) })
      },
    },
  ]
  let cleaned = text
  for (const { re, map } of patterns) {
    cleaned = cleaned.replace(re, (...args: string[]) => {
      map(args[1], args[2], args[3], args[4])
      return ''
    })
  }
  return { hints: mergePlacementConstraints(constraints), cleaned }
}

function formatBoundsRange(bounds: { start: number; end: number } | null, fieldSize: number) {
  if (!bounds) return null
  const start = Math.max(1, Math.min(fieldSize, bounds.start))
  const end = Math.max(1, Math.min(fieldSize, bounds.end))
  if (start > end) return null
  if (start === end) return ordinal(start)
  return `${ordinal(start)} to ${ordinal(end)}`
}

function formatPlacementHint(hints: Placement | null) {
  if (!hints) return null
  const cmBound = 'cm' in hints ? hints.cm : null
  const ttBound = 'tt' in hints ? hints.tt : null
  if (cmBound && 'op' in cmBound || ttBound && 'op' in ttBound) {
    const cm = cmBound && 'op' in cmBound ? positionRange(cmBound.op, cmBound.value, CM_FIELD) : null
    const tt = ttBound && 'op' in ttBound ? positionRange(ttBound.op, ttBound.value, TT_FIELD) : null
    if (!cm || !tt) return null
    return `${cm} (CM), ${tt} (TT)`
  }
  const cm = formatBoundsRange(cmBound && 'start' in cmBound ? cmBound : null, CM_FIELD)
  const tt = formatBoundsRange(ttBound && 'start' in ttBound ? ttBound : null, TT_FIELD)
  if (!cm || !tt) return null
  return `${cm} (CM), ${tt} (TT)`
}

function fill(template: string, op: string, value: string) {
  return template
    .replaceAll('{value}', value)
    .replaceAll('{op}', op)
    .replaceAll('{prev}', String(Number(value) - 1))
    .replaceAll('{inv}', String(100 - Number(value)))
}

function formatField(field: string, op: string | null, value: string | null, placementHints: Placement | null) {
  const def = RULES.fields[field]
  if (!def) return `${field} ${op} ${value}`
  if (def.special === 'order_rate' || field === 'order') {
    if (placementHints) {
      const fromHint = formatPlacementHint(placementHints)
      if (fromHint) return fromHint
    }
    if (def.special === 'order_rate' && op) {
      const note = RULES.order_rate_notes?.[op]?.[String(value)]
      if (note) return note
      const rate = Number(value)
      if (Number.isFinite(rate)) {
        const derived = formatPlacementHint({
          cm: { op, value: Math.max(1, Math.ceil((rate / 100) * CM_FIELD)) },
          tt: { op, value: Math.max(1, Math.ceil((rate / 100) * TT_FIELD)) },
        })
        if (derived) return derived
      }
      return `Order rate ${op} ${value}`
    }
  }
  if (op && def.ops && typeof def.ops[op] === 'object' && def.ops[op][String(value)] != null) {
    return def.ops[op][String(value)]
  }
  if (field === 'phase' && op) {
    if (op === '>=') return `${phaseLabel(value || '')} and beyond`
    if (op === '<=' && String(value) === '1') return 'Early race or mid race'
    if (op === '<=') return `Up to ${phaseLabel(value || '')}`
    if (op === '==') return phaseLabel(value || '')
    if (op === '!=') return `Not ${phaseLabel(value || '')}`
  }
  if (op && def.ops && typeof def.ops[op] === 'string') return fill(def.ops[op], op, String(value))
  if (def.values && def.values[String(value)] != null && (op === '==' || op == null)) return def.values[String(value)]
  if (def.values && def.values[String(value)] != null && op === '!=') return `Not ${def.values[String(value)]}`
  if (def.label && op) return fill(def.label, op, String(value))
  if (def.bare && (value == null || value === '' || value === '1')) return def.bare
  return `${field} ${op} ${value}`
}

function parseAtomRaw(raw: string) {
  const text = stripParens(raw)
  if (!text) return null
  if (!OP_RE.test(text) && RULES.fields[text]) return { field: text, op: null as string | null, value: null as string | null, raw: text }
  const match = text.match(/^([a-zA-Z0-9_]+)\s*(>=|<=|==|!=|>|<)\s*(-?\d+(?:\.\d+)?)$/)
  if (!match) return { field: null, op: null, value: null, raw: text }
  return { field: match[1], op: match[2], value: match[3], raw: text }
}

function entryFromAtom(raw: string, placementHints: Placement | null) {
  const parsed = parseAtomRaw(raw)
  if (!parsed) return null
  const text = parsed.field != null ? formatField(parsed.field, parsed.op, parsed.value, placementHints) : parsed.raw
  if (!text) return null
  return { field: parsed.field, text, rank: fieldRank(parsed.field) }
}

function tryCompounds(atoms: string[]) {
  for (const compound of RULES.compounds || []) {
    const needed = compound.match.map((item) => item.replace(/\s+/g, ''))
    const normalized = atoms.map((item) => item.replace(/\s+/g, ''))
    if (needed.every((item) => normalized.includes(item))) return compound
  }
  return null
}

function translateExpr(expr: string, placementHints: Placement | null) {
  const cleaned = stripParens(normalizeOps(expr).replace(/\n+/g, '&').replace(/\s+/g, '').replace(/&+/g, '&'))
  if (!cleaned) return []
  const andParts = splitTopLevel(cleaned, ['&'])
  const flatAtoms = andParts.map((part) => stripParens(part.text))
  const hasOr = flatAtoms.some((atom) => atom.includes('@') || atom.includes('|') || atom.includes('('))
  if (!hasOr) {
    const compound = tryCompounds(flatAtoms)
    if (compound && flatAtoms.length === 2) {
      return [{ field: 'is_finalcorner', text: compound.text, rank: fieldRank('is_finalcorner') }]
    }
  }
  const entries: { field: string | null; text: string; rank: number }[] = []
  let orderRateEmitted = false
  const placementText = formatPlacementHint(placementHints)
  for (const part of andParts) {
    const chunk = stripParens(part.text)
    if (chunk.includes('@') || chunk.includes('|') || (chunk.includes('(') && chunk.includes(')'))) {
      const orParts = splitTopLevel(chunk, ['@', '|'])
      if (orParts.length > 1) {
        const parsed = orParts.map((item) => entryFromAtom(item.text, placementHints)).filter((item) => item != null)
        if (!parsed.length) continue
        entries.push({
          field: parsed[0].field,
          text: parsed.map((item) => item.text).join(' OR '),
          rank: Math.min(...parsed.map((item) => item.rank)),
        })
        continue
      }
    }
    const parsed = parseAtomRaw(chunk)
    if (parsed?.field === 'order_rate' || parsed?.field === 'order') {
      if (orderRateEmitted) continue
      if (placementText) {
        entries.push({ field: 'order_rate', text: placementText, rank: fieldRank('order_rate') })
        orderRateEmitted = true
        continue
      }
    }
    const entry = entryFromAtom(chunk, placementHints)
    if (entry) entries.push(entry)
    if (entry?.field === 'order_rate' || entry?.field === 'order') orderRateEmitted = true
  }
  const idxFinal = entries.findIndex((entry) => entry.text === 'Final corner and beyond')
  const idxCorner = entries.findIndex((entry) => entry.text === 'Any corner' || entry.text === 'Not a corner')
  if (idxFinal >= 0 && idxCorner >= 0) {
    const cornerLine = entries[idxCorner].text
    entries[idxFinal].text = cornerLine === 'Not a corner' ? 'Final non-corner' : 'Final corner'
    entries[idxFinal].field = 'is_finalcorner'
    entries[idxFinal].rank = fieldRank('is_finalcorner')
    entries.splice(idxCorner, 1)
  }
  return entries
}

export function convertConditions(input: string) {
  const { hints, cleaned } = extractPlacementHints(input)
  const code = normalizeOps(cleaned).split('\n').map((line) => line.trim()).filter(Boolean).join('\n')
  const blocks = code.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean)
  const all = blocks.length <= 1
    ? translateExpr(code.replace(/\n/g, '&').replace(/&+/g, '&'), hints)
    : blocks.flatMap((block) => translateExpr(block.replace(/\n/g, '&').replace(/&+/g, '&'), hints))
  const lines = [...all]
    .sort((a, b) => (a.rank - b.rank) || a.text.localeCompare(b.text))
    .map((entry) => entry.text)
    .filter(Boolean)
  return { lines, text: lines.map((line) => `${JSON.stringify(line)},`).join('\n') }
}
