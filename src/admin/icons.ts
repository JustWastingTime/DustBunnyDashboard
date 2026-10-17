const SKILL_ICONS: Record<string, string> = {
  speed: 'https://gametora.com/images/umamusume/skill_icons/utx_ico_skill_10011.png',
  speednegative: 'https://gametora.com/images/umamusume/skill_icons/utx_ico_skill_10014.png',
  stamina: 'https://gametora.com/images/umamusume/skill_icons/utx_ico_skill_10021.png',
  staminanegative: 'https://gametora.com/images/umamusume/skill_icons/utx_ico_skill_10024.png',
  power: 'https://gametora.com/images/umamusume/skill_icons/utx_ico_skill_10031.png',
  powernegative: 'https://gametora.com/images/umamusume/skill_icons/utx_ico_skill_10034.png',
  guts: 'https://gametora.com/images/umamusume/skill_icons/utx_ico_skill_10041.png',
  gutsnegative: 'https://gametora.com/images/umamusume/skill_icons/utx_ico_skill_10044.png',
  gate: 'https://gametora.com/images/umamusume/skill_icons/utx_ico_skill_10051.png',
  gatenegative: 'https://gametora.com/images/umamusume/skill_icons/utx_ico_skill_10054.png',
  super7: 'https://gametora.com/images/umamusume/skill_icons/utx_ico_skill_10061.png',
  recovery: 'https://gametora.com/images/umamusume/skill_icons/utx_ico_skill_20021.png',
  recoverynegative: 'https://gametora.com/images/umamusume/skill_icons/utx_ico_skill_20024.png',
  recoverydebuff: 'https://gametora.com/images/umamusume/skill_icons/utx_ico_skill_30051.png',
  velocity: 'https://gametora.com/images/umamusume/skill_icons/utx_ico_skill_20011.png',
  velocitynegative: 'https://gametora.com/images/umamusume/skill_icons/utx_ico_skill_20014.png',
  velocitydebuff: 'https://gametora.com/images/umamusume/skill_icons/utx_ico_skill_30011.png',
  accel: 'https://gametora.com/images/umamusume/skill_icons/utx_ico_skill_20041.png',
  accelnegative: 'https://gametora.com/images/umamusume/skill_icons/utx_ico_skill_20044.png',
  acceldebuff: 'https://gametora.com/images/umamusume/skill_icons/utx_ico_skill_30021.png',
  flow: 'https://gametora.com/images/umamusume/skill_icons/utx_ico_skill_20051.png',
  focus: 'https://gametora.com/images/umamusume/skill_icons/utx_ico_skill_20061.png',
  focusnegative: 'https://gametora.com/images/umamusume/skill_icons/utx_ico_skill_20064.png',
  vision: 'https://gametora.com/images/umamusume/skill_icons/utx_ico_skill_20091.png',
  visiondebuff: 'https://gametora.com/images/umamusume/skill_icons/utx_ico_skill_30071.png',
  frenzy: 'https://gametora.com/images/umamusume/skill_icons/utx_ico_skill_30041.png',
  runaway: 'https://gametora.com/images/umamusume/skill_icons/utx_ico_skill_40012.png',
}

export const SUPPORT_ICONS: Record<string, string> = {
  speed: 'https://gametora.com/images/umamusume/icons/utx_ico_obtain_00.png',
  stamina: 'https://gametora.com/images/umamusume/icons/utx_ico_obtain_01.png',
  power: 'https://gametora.com/images/umamusume/icons/utx_ico_obtain_02.png',
  guts: 'https://gametora.com/images/umamusume/icons/utx_ico_obtain_03.png',
  wit: 'https://gametora.com/images/umamusume/icons/utx_ico_obtain_04.png',
}

export const RARITY_BADGE: Record<string, string> = {
  ssr: 'https://gametora.com/images/umamusume/icons/utx_txt_rarity_03.png',
  sr: 'https://gametora.com/images/umamusume/icons/utx_txt_rarity_02.png',
  r: 'https://gametora.com/images/umamusume/icons/utx_txt_rarity_01.png',
}

function family(category: string) {
  let key = category.toLowerCase()
  if (key.startsWith('golden') || key.startsWith('rainbow')) {
    key = key.replace(/^(golden|rainbow)/, '')
  }
  if (key.startsWith('evo') && key.length > 3) key = key.slice(3)
  return key
}

export function skillIcon(category: string) {
  const key = family(category)
  return SKILL_ICONS[key] || SKILL_ICONS[category.toLowerCase()] || ''
}

export const SKILL_TYPE_FILTERS: Array<{ id: string; label: string; icon: string; families: string[] }> = [
  { id: 'speed', label: 'Speed', icon: SKILL_ICONS.speed, families: ['speed', 'speednegative'] },
  { id: 'stamina', label: 'Stamina', icon: SKILL_ICONS.stamina, families: ['stamina', 'staminanegative'] },
  { id: 'power', label: 'Power', icon: SKILL_ICONS.power, families: ['power', 'powernegative'] },
  { id: 'guts', label: 'Guts', icon: SKILL_ICONS.guts, families: ['guts', 'gutsnegative'] },
  { id: 'gate', label: 'Gate', icon: SKILL_ICONS.gate, families: ['gate', 'gatenegative'] },
  { id: 'super7', label: 'Super 7', icon: SKILL_ICONS.super7, families: ['super7'] },
  { id: 'recovery', label: 'Recovery', icon: SKILL_ICONS.recovery, families: ['recovery', 'recoverynegative', 'recoverydebuff'] },
  { id: 'velocity', label: 'Velocity', icon: SKILL_ICONS.velocity, families: ['velocity', 'velocitynegative', 'velocitydebuff'] },
  { id: 'accel', label: 'Accel', icon: SKILL_ICONS.accel, families: ['accel', 'accelnegative', 'acceldebuff'] },
  { id: 'flow', label: 'Flow', icon: SKILL_ICONS.flow, families: ['flow'] },
  { id: 'focus', label: 'Focus', icon: SKILL_ICONS.focus, families: ['focus', 'focusnegative'] },
  { id: 'vision', label: 'Vision', icon: SKILL_ICONS.vision, families: ['vision', 'visiondebuff'] },
  { id: 'frenzy', label: 'Frenzy', icon: SKILL_ICONS.frenzy, families: ['frenzy'] },
  { id: 'runaway', label: 'Runaway', icon: SKILL_ICONS.runaway, families: ['runaway'] },
]

export function skillMatchesType(category: string, typeId: string) {
  const group = SKILL_TYPE_FILTERS.find((item) => item.id === typeId)
  if (!group) return false
  return group.families.includes(family(category))
}

export const SUPPORT_TYPES = [
  { id: 'speed', label: 'Speed' },
  { id: 'stamina', label: 'Stamina' },
  { id: 'power', label: 'Power' },
  { id: 'guts', label: 'Guts' },
  { id: 'wit', label: 'Wit' },
  { id: 'pal', label: 'Pal' },
  { id: 'group', label: 'Group' },
  { id: 'support', label: 'Support' },
]
