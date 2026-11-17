import { describe, expect, it } from 'vitest'
import { checkQuestion, parsePastedRows, previewOptions, questionFromRaw, questionToRaw } from './model'
import type { RawQuestion } from './api'

const lists = { uma: ['Agnes Tachyon', 'Gold Ship', 'Rice Shower', 'Oguri Cap', 'Seiun Sky'] }

describe('quiz model', () => {
  it('round-trips template and fixed questions unchanged', () => {
    const samples: RawQuestion[] = [
      { promptTemplate: 'Which uma has the unique skill {0}?', difficulty: 'easy', entries: [['Introduction to Physiology', ['Agnes Tachyon', '$uma']], ['X', ['Gold Ship', 'Rice Shower'], 'medium']] },
      { promptTemplate: 'Who is that?', difficulty: 'hard', silhouette: true, entries: [['https://cdn.example/a.png', ['A', 'B'], 'expert', 'silhouette']] },
      { prompt: 'Which of these umas do NOT have a dorm roommate?', difficulty: 'hard', answers: ['Fuji Kiseki', 'Agnes Digital', 'Special Week'] },
      { promptTemplate: 'Which uma stays in Ritto dorm?', entries: [['', ['Oguri Cap', 'Inari One']]] },
    ]
    for (const raw of samples) expect(questionToRaw(questionFromRaw(raw))).toEqual(raw)
  })

  it('flags missing subjects, unknown pools, and token answers', () => {
    const q = questionFromRaw({ promptTemplate: 'Q {0}', entries: [['', ['A', '$nope']], ['S', ['$uma', 'B']]] })
    const text = checkQuestion(q, lists).map((c) => c.text).join('\n')
    expect(text).toMatch(/needs a subject/)
    expect(text).toMatch(/no \$nope pool/)
    expect(text).toMatch(/cannot be a random token/)
  })

  it('fills $uma to four options without repeating answers', () => {
    const q = questionFromRaw({ promptTemplate: 'Q {0}', entries: [['S', ['Agnes Tachyon', 'Gold Ship', '$uma']]] })
    for (let seed = 1; seed < 20; seed += 1) {
      const options = previewOptions(q.entries[0], lists, seed)
      expect(options).toHaveLength(4)
      expect(new Set(options.map((o) => o.text)).size).toBe(4)
      expect(options.filter((o) => o.correct).map((o) => o.text)).toEqual(['Agnes Tachyon'])
    }
  })

  it('parses pasted rows in both formats', () => {
    const rows = parsePastedRows('Skill A | Gold Ship | $uma, Rice Shower | hard\n["Skill B", ["Oguri Cap", "$uma"]],')
    expect(rows.map((r) => [r.subject, r.correct, r.wrong, r.difficulty])).toEqual([
      ['Skill A', 'Gold Ship', ['$uma', 'Rice Shower'], 'hard'],
      ['Skill B', 'Oguri Cap', ['$uma'], ''],
    ])
  })
})
