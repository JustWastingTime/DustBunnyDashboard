import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { quizApi, errorText, type CategoryFile, type QuizAccess } from './api'
import {
  DIFFICULTIES, DIFFICULTY_LABEL, IMPORT_KEY, blankEntry, checkQuestion, entryFromRaw, fillPrompt, isImageUrl, isToken, isUrl,
  newQuestion, parsePastedRows, previewOptions, questionFromRaw, questionToRaw, usesSlot,
  type Difficulty, type EditEntry, type EditQuestion, type PendingImport,
} from './model'
import { PromptText } from './QuizLibrary'
import './quiz.css'

type Props = {
  access: QuizAccess
  categoryId: string
  question: string
  draftId: string
  navigate: (to: string) => void
}

const PAGE = 60
const GRADES = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

export function QuizEditor({ access, categoryId: categoryParam, question: questionParam, draftId: draftParam, navigate }: Props) {
  const [categoryId, setCategoryId] = useState(categoryParam)
  const [file, setFile] = useState<CategoryFile | null>(null)
  const [blobSha, setBlobSha] = useState('')
  const [draftId, setDraftId] = useState(draftParam)
  const [draftNote, setDraftNote] = useState('')
  const [index, setIndex] = useState<number | 'new'>(questionParam === 'new' || questionParam === '' ? 'new' : Number(questionParam))
  const [q, setQ] = useState<EditQuestion | null>(null)
  const [baseline, setBaseline] = useState('')
  const [lists, setLists] = useState<Record<string, string[]>>({})
  const [selected, setSelected] = useState(0)
  const [seed, setSeed] = useState(1)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [filter, setFilter] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [paste, setPaste] = useState<string | null>(null)
  const [poolEdit, setPoolEdit] = useState<{ name: string; text: string; isNew: boolean } | null>(null)

  const canEdit = access.categories.includes('*') || access.categories.includes(categoryId)
  const owner = access.role === 'owner'

  useEffect(() => {
    quizApi.lists().then((payload) => setLists(payload.lists)).catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    setError('')
    const load = async () => {
      let data: CategoryFile
      let sha: string
      let cat = categoryParam
      if (draftParam) {
        const { draft } = await quizApi.draft(draftParam)
        data = draft.data
        sha = draft.baseBlobSha
        cat = draft.categoryId
        setDraftNote(draft.status === 'changes_requested' ? `${draft.reviewedBy || 'A reviewer'} asked for changes${draft.note ? `: ${draft.note}` : '.'}` : `Draft by ${draft.authorName}, waiting for review (${draft.summary.text}).`)
      } else {
        const payload = await quizApi.category(categoryParam)
        data = payload.data
        sha = payload.blobSha
        setDraftNote('')
      }
      if (cancelled) return
      setDraftId(draftParam)
      setFilter('')
      setLimit(PAGE)
      const idx: number | 'new' = questionParam === 'new' || questionParam === '' || Number.isNaN(Number(questionParam)) ? 'new' : Number(questionParam)
      let next = idx === 'new' || !data.questions[idx] ? newQuestion() : questionFromRaw(data.questions[idx])
      const base = JSON.stringify(questionToRaw(next))
      const imported = takeImport(cat, idx)
      if (imported) {
        const rows = imported.entries.map(entryFromRaw)
        const blank = next.entries.length === 1 && !next.entries[0].correct && !next.entries[0].subject
        next = {
          ...next,
          prompt: next.prompt || imported.promptTemplate,
          entries: blank ? rows : [...next.entries, ...rows],
        }
        setNotice(`Added ${rows.length} generated entr${rows.length === 1 ? 'y' : 'ies'}. Review them, then save.`)
      }
      setCategoryId(cat)
      setFile(data)
      setBlobSha(sha)
      setIndex(idx === 'new' || !data.questions[idx] ? 'new' : idx)
      setQ(next)
      setBaseline(idx === 'new' ? '' : base)
      setSelected(0)
    }
    load().catch((reason) => { if (!cancelled) setError(errorText(reason)) })
    return () => { cancelled = true }
  }, [categoryParam, questionParam, draftParam])

  const dirty = q ? JSON.stringify(questionToRaw(q)) !== baseline : false
  const checks = useMemo(() => (q ? checkQuestion(q, lists) : []), [q, lists])
  const errors = checks.filter((c) => c.level === 'error')

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const visible = useMemo(() => {
    if (!q) return []
    const term = filter.trim().toLowerCase()
    return q.entries
      .map((entry, i) => ({ entry, i }))
      .filter(({ entry }) => !term || [entry.subject, entry.correct, ...entry.wrong].join(' ').toLowerCase().includes(term))
  }, [q, filter])

  if (error && !q) return <section className="admin-grid"><p className="notice error">{error}</p></section>
  if (!q || !file) return <p className="muted">Loading question…</p>

  const update = (patch: Partial<EditQuestion>) => setQ((prev) => (prev ? { ...prev, ...patch } : prev))
  const setEntry = (i: number, patch: Partial<EditEntry>) =>
    setQ((prev) => (prev ? { ...prev, entries: prev.entries.map((e, j) => (j === i ? { ...e, ...patch } : e)) } : prev))
  const removeEntry = (i: number) => {
    setQ((prev) => (prev ? { ...prev, entries: prev.entries.filter((_, j) => j !== i) } : prev))
    setSelected((s) => Math.max(0, s > i ? s - 1 : Math.min(s, (q.entries.length || 2) - 2)))
  }
  const addEntry = () => {
    setQ((prev) => (prev ? { ...prev, entries: [...prev.entries, blankEntry()] } : prev))
    setSelected(q.entries.length)
    setFilter('')
    setLimit((l) => Math.max(l, q.entries.length + 1))
  }
  const addToken = (token: string, all = false) => {
    setQ((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        entries: prev.entries.map((e, j) => ((all || j === selected) && !e.raw && !e.wrong.includes(token) ? { ...e, wrong: [...e.wrong, token] } : e)),
      }
    })
  }
  const applyGrades = () => setQ((prev) => (prev ? {
    ...prev,
    entries: prev.entries.map((e) => (GRADES.includes(e.correct.trim().toUpperCase()) ? { ...e, wrong: GRADES.filter((g) => g !== e.correct.trim().toUpperCase()) } : e)),
  } : prev))

  const entry = q.entries[Math.min(selected, q.entries.length - 1)]
  const options = entry ? previewOptions(entry, lists, seed + selected * 7919) : []
  const difficulty = (entry?.difficulty || q.difficulty || String(file.difficulty || 'easy')) as Difficulty
  const subject = q.shape === 'template' ? entry?.subject || '' : ''
  const promptShown = q.shape === 'template' && usesSlot(q.prompt) ? fillPrompt(q.prompt, subject || '…') : q.prompt
  const pools = Object.entries(lists).filter(([, items]) => Array.isArray(items))
  const answerOptions = [...new Set([...pools.map(([name]) => `$${name}`), ...(lists.uma || [])])]

  const save = async (deleting = false) => {
    if (!deleting && errors.length) {
      setError('Fix the problems under Checks before saving.')
      return
    }
    if (deleting && !window.confirm('Delete this question and all of its entries?')) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const raw = questionToRaw(q)
      const questions = [...file.questions]
      let nextIndex: number | 'new' = index
      if (deleting && index !== 'new') questions.splice(index, 1)
      else if (index === 'new') { questions.push(raw); nextIndex = questions.length - 1 }
      else questions[index] = raw
      const data = { ...file, questions }
      const result = await quizApi.saveCategory(categoryId, { data, baseBlobSha: blobSha, message: message.trim() || undefined, draftId: draftId || null })
      setMessage('')
      if (result.published) {
        setNotice(`Published: ${result.summary.text}. The bot uses it on the next round.`)
        if (deleting) { navigate(`/admin/quizzes?key=${categoryId}`); return }
        setFile(data)
        if (result.blobSha) setBlobSha(result.blobSha)
        setBaseline(JSON.stringify(raw))
        setDraftId('')
        setDraftNote('')
        setIndex(nextIndex)
        if (index === 'new' || draftId) navigate(`/admin/quizzes/edit?key=${categoryId}&q=${nextIndex}`)
      } else {
        setNotice(`Sent for review (${result.draft.summary.text}). A reviewer or the owner publishes it.`)
        if (deleting) { navigate('/admin/quizzes/reviews'); return }
        setFile(data)
        setBaseline(JSON.stringify(raw))
        setDraftId(result.draft.id)
        setDraftNote(`Your draft is waiting for review (${result.draft.summary.text}).`)
        setIndex(nextIndex)
        if (index === 'new' || !draftId) navigate(`/admin/quizzes/edit?draft=${result.draft.id}&q=${nextIndex}`)
      }
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setBusy(false)
    }
  }

  const back = `/admin/quizzes?key=${categoryId}`
  const title = q.prompt || (index === 'new' ? 'New question' : `Question ${Number(index) + 1}`)

  return <section className="admin-grid quiz-page quiz-editor">
    <div>
      <p className="crumb">
        <a href="/admin/quizzes" onClick={(event) => { event.preventDefault(); navigate('/admin/quizzes') }}>Quizzes</a>
        {' / '}
        <a href={back} onClick={(event) => { event.preventDefault(); navigate(back) }}>{file.name}</a>
        {' / '}{index === 'new' ? 'New question' : `Question ${Number(index) + 1}`}
      </p>
      <h1 className="quiz-h1"><PromptText text={title} /></h1>
    </div>

    {draftNote && <div className="admin-banner">{draftNote}</div>}
    {!canEdit && <div className="admin-banner">You can view this category but not edit it.</div>}
    {notice && <p className="notice quiz-ok" role="status">{notice}</p>}
    {error && <p className="notice error" role="alert">{error}</p>}

    <div className="quiz-desk">
      <div className="quiz-form">
        <section className="admin-section">
          <h2>Question
            <span className="quiz-seg" role="group" aria-label="Question shape">
              <button type="button" className={q.shape === 'template' ? 'on' : ''} disabled={!canEdit} onClick={() => update({ shape: 'template', promptKey: q.promptKey })}>Template + entries</button>
              <button type="button" className={q.shape === 'fixed' ? 'on' : ''} disabled={!canEdit} onClick={() => { update({ shape: 'fixed', promptKey: 'prompt', entries: q.entries.slice(0, 1).length ? q.entries.slice(0, 1) : [blankEntry()] }); setSelected(0) }}>Fixed answers</button>
            </span>
          </h2>
          <label className="admin-field">
            <span className="quiz-label">Prompt</span>
            <input className="quiz-prompt-input" value={q.prompt} disabled={!canEdit} onChange={(event) => update({ prompt: event.target.value })} placeholder={q.shape === 'template' ? 'Which uma has the unique skill {0}?' : 'Which of these umas did NOT win the Triple Crown?'} />
          </label>
          {q.shape === 'template' && <p className="muted quiz-help"><code className="quiz-slot">{'{0}'}</code> is replaced by each entry’s subject. Image or audio URLs as the subject are shown instead. Discord markdown like <code>__bold__</code> works.</p>}
          <div className="quiz-row">
            <div className="admin-field">
              <span className="quiz-label">Difficulty</span>
              <div className="quiz-diffs" role="group" aria-label="Difficulty">
                {DIFFICULTIES.map((d) => <button key={d} type="button" disabled={!canEdit} aria-pressed={q.difficulty === d} className={`quiz-diff-pick ${d}${q.difficulty === d ? ' on' : ''}`} onClick={() => update({ difficulty: d })}>{DIFFICULTY_LABEL[d]}</button>)}
              </div>
            </div>
          </div>
        </section>

        <section className="admin-section">
          <h2>
            <span>{q.shape === 'template' ? <>Entries <span className="muted">· {q.entries.length}</span></> : 'Answers'}</span>
            {q.shape === 'template' && canEdit && <span className="admin-row">
              <a className="quiz-button" href="/admin/quizzes/coverage" onClick={(event) => { event.preventDefault(); navigate('/admin/quizzes/coverage') }}>Generate from data</a>
              <button type="button" onClick={() => setPaste(paste == null ? '' : null)}>Paste rows</button>
            </span>}
          </h2>
          {q.shape === 'template' && <p className="muted quiz-help">The first answer is correct. Click a row to preview it.</p>}

          {paste != null && <div className="quiz-paste">
            <label className="admin-field">
              <span className="quiz-label">One entry per line: subject | correct | wrong, wrong | difficulty — or JSON rows copied from a file</span>
              <textarea value={paste} onChange={(event) => setPaste(event.target.value)} rows={6} placeholder={'Introduction to Physiology | Agnes Tachyon | $uma\n["Super-Duper Climax", ["Haru Urara", "$uma"]]'} />
            </label>
            <div className="admin-row">
              <button type="button" className="primary" onClick={() => {
                const rows = parsePastedRows(paste)
                const blank = q.entries.length === 1 && !q.entries[0].correct && !q.entries[0].subject
                update({ entries: blank ? rows : [...q.entries, ...rows] })
                setPaste(null)
                setNotice(`Added ${rows.length} pasted entr${rows.length === 1 ? 'y' : 'ies'}.`)
              }}>Add {parsePastedRows(paste).length} rows</button>
              <button type="button" onClick={() => setPaste(null)}>Cancel</button>
            </div>
          </div>}

          {q.shape === 'template' && q.entries.length > 12 && <input type="search" className="quiz-entry-search" aria-label="Filter entries" placeholder={`Filter ${q.entries.length} entries…`} value={filter} onChange={(event) => { setFilter(event.target.value); setLimit(PAGE) }} />}

          <datalist id="quiz-answer-options">{answerOptions.map((o) => <option key={o} value={o} />)}</datalist>

          <div className={`quiz-entries ${q.shape}`}>
            <div className="quiz-entry-head" aria-hidden="true">
              {q.shape === 'template' && <><span>#</span><span>Subject {'{0}'}</span></>}
              <span>Correct answer</span><span>Wrong answers</span>
              {q.shape === 'template' && <span>Difficulty</span>}<span />
            </div>
            {visible.slice(0, limit).map(({ entry: e, i }) => (
              <div key={e.uid} className={`quiz-entry${i === selected ? ' sel' : ''}${checks.some((c) => c.entry === i && c.level === 'error') ? ' bad' : ''}`} onFocusCapture={() => setSelected(i)} onClick={() => setSelected(i)}>
                {q.shape === 'template' && <>
                  <span className="muted quiz-n">{i + 1}</span>
                  <span className="quiz-subject">
                    {isImageUrl(e.subject) && <img src={e.subject} alt="" loading="lazy" />}
                    <input aria-label={`Subject ${i + 1}`} value={e.subject} disabled={!canEdit || Boolean(e.raw)} onChange={(event) => setEntry(i, { subject: event.target.value })} />
                  </span>
                </>}
                <input className="quiz-correct" aria-label={`Correct answer ${i + 1}`} list="quiz-answer-options" value={e.correct} disabled={!canEdit || Boolean(e.raw)} onChange={(event) => setEntry(i, { correct: event.target.value })} />
                <TagInput label={`Wrong answers ${i + 1}`} values={e.wrong} disabled={!canEdit || Boolean(e.raw)} onChange={(wrong) => setEntry(i, { wrong })} />
                {q.shape === 'template' && <select aria-label={`Difficulty ${i + 1}`} value={e.difficulty} disabled={!canEdit || Boolean(e.raw)} onChange={(event) => setEntry(i, { difficulty: event.target.value })} className={e.difficulty ? `quiz-diff-text ${e.difficulty}` : 'muted'}>
                  <option value="">Inherit</option>
                  {DIFFICULTIES.map((d) => <option key={d} value={d}>{DIFFICULTY_LABEL[d]}</option>)}
                </select>}
                {q.shape === 'template'
                  ? <button type="button" className="icon-button" aria-label={`Delete entry ${i + 1}`} disabled={!canEdit} onClick={(event) => { event.stopPropagation(); removeEntry(i) }}>
                    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                  : <span />}
              </div>
            ))}
            {visible.length > limit && <button type="button" className="quiz-more" onClick={() => setLimit((l) => l + PAGE)}>Show {Math.min(PAGE, visible.length - limit)} more of {visible.length - limit}</button>}
            {q.shape === 'template' && canEdit && <button type="button" className="quiz-add" onClick={addEntry}>+ Add entry</button>}
          </div>
          {filter && <p className="muted quiz-help">Filtered to {visible.length} of {q.entries.length}.</p>}
        </section>
      </div>

      <aside className="quiz-rail">
        <section className="admin-section" aria-label="Discord preview">
          <h2>Preview <button type="button" onClick={() => setSeed((s) => s + 1)}>Reroll</button></h2>
          <div className="quiz-discord">
            <div className="quiz-discord-who"><span className="quiz-avatar">T</span><strong>Tazuna</strong><span className="quiz-app">APP</span></div>
            <div className={`quiz-embed ${difficulty}`}>
              <small>{file.name} · {DIFFICULTY_LABEL[difficulty] || difficulty}</small>
              <strong>{promptShown || 'Your prompt shows here'}</strong>
              {q.shape === 'template' && isImageUrl(subject) && <img src={subject} alt="Question image" />}
              {q.shape === 'template' && isUrl(subject) && !isImageUrl(subject) && <audio controls src={subject} preload="none" />}
            </div>
            <div className="quiz-answers">
              {options.map((o, i) => <span key={`${o.text}-${i}`} className={`quiz-answer${o.correct ? ' correct' : ''}`}>
                <b>{String.fromCharCode(65 + i)}</b><span>{o.text}</span>{o.correct ? <em>correct</em> : o.token ? <em className="tok">{o.token}</em> : null}
              </span>)}
              {!options.length && <p className="muted">Add a correct answer to preview.</p>}
            </div>
          </div>
          <p className="muted quiz-help">Green = correct. Random picks change on every reroll; the bot fills up to 4 options.</p>
        </section>

        <section className="admin-section" aria-label="Random answers">
          <h2>Random answers {owner && <button type="button" onClick={() => setPoolEdit({ name: '', text: '', isNew: true })}>New pool</button>}</h2>
          <p className="muted quiz-help">A <code className="quiz-token">$pool</code> token draws names that aren’t already answers. Click a token to add it to the selected entry.</p>
          {pools.map(([name, items]) => <div key={name} className="quiz-pool">
            <button type="button" className="quiz-token big" disabled={!canEdit} onClick={() => addToken(`$${name}`)}>${name}</button>
            <span className="muted">{items.length} names</span>
            {canEdit && q.shape === 'template' && <button type="button" className="text-button" onClick={() => addToken(`$${name}`, true)}>Add to all</button>}
            {owner && <button type="button" className="text-button" onClick={() => setPoolEdit({ name, text: items.join('\n'), isNew: false })}>Edit</button>}
          </div>)}
          {poolEdit && <PoolEditor value={poolEdit} onCancel={() => setPoolEdit(null)} onSaved={(next) => { setLists(next); setPoolEdit(null) }} />}
          {canEdit && q.shape === 'template' && <div className="quiz-templates">
            <span className="quiz-label">Templates</span>
            <div className="admin-row">
              <button type="button" onClick={applyGrades} title="For entries whose answer is a grade, the other grades become wrong answers">Aptitude A–G</button>
              <button type="button" onClick={() => setQ((prev) => (prev ? { ...prev, entries: prev.entries.map((e) => (e.raw ? e : { ...e, wrong: ['$uma'] })) } : prev))} disabled={!lists.uma}>Correct + $uma only</button>
            </div>
          </div>}
        </section>

        <section className="admin-section" aria-label="Checks">
          <h2>Checks</h2>
          {!checks.length && <p className="quiz-check ok">No problems found.</p>}
          {checks.slice(0, 12).map((c, i) => <button type="button" key={i} className={`quiz-check ${c.level}`} onClick={() => { if (c.entry != null) { setSelected(c.entry); setFilter(''); setLimit(Math.max(limit, c.entry + 1)) } }}>
            {c.text}
          </button>)}
          {checks.length > 12 && <p className="muted">+{checks.length - 12} more</p>}
        </section>
      </aside>
    </div>

    {canEdit && <div className="quiz-savebar">
      <span className="muted">{dirty ? <b className="quiz-unsaved">Unsaved changes</b> : 'No changes'}{errors.length ? ` · ${errors.length} problem${errors.length === 1 ? '' : 's'} to fix` : ''}</span>
      <input aria-label="Change note" placeholder="Change note (optional)" value={message} onChange={(event) => setMessage(event.target.value)} />
      <div className="admin-row">
        {index !== 'new' && <button type="button" className="quiz-danger" disabled={busy} onClick={() => void save(true)}>Delete question</button>}
        <button type="button" disabled={busy || !dirty} onClick={() => {
          if (!file) return
          const restored = index === 'new' || !file.questions[index] ? newQuestion() : questionFromRaw(file.questions[index])
          setQ(restored)
          setNotice('')
        }}>Discard</button>
        <button type="button" className="primary" disabled={busy || (!dirty && !draftId) || errors.length > 0} onClick={() => void save()}>
          {busy ? 'Saving…' : access.canPublish ? (draftId ? 'Publish draft' : 'Publish to bot') : 'Submit for review'}
        </button>
      </div>
    </div>}
  </section>
}

function takeImport(categoryId: string, question: number | 'new'): PendingImport | null {
  try {
    const raw = sessionStorage.getItem(IMPORT_KEY)
    if (!raw) return null
    const pending = JSON.parse(raw) as PendingImport
    if (pending.categoryId !== categoryId || pending.question !== question) return null
    sessionStorage.removeItem(IMPORT_KEY)
    return pending
  } catch {
    return null
  }
}

function TagInput({ label, values, disabled, onChange }: { label: string; values: string[]; disabled: boolean; onChange: (next: string[]) => void }) {
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const commit = () => {
    const parts = text.split(',').map((p) => p.trim()).filter(Boolean)
    if (parts.length) onChange([...values, ...parts])
    setText('')
  }
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commit()
    } else if (event.key === 'Backspace' && !text && values.length) {
      onChange(values.slice(0, -1))
    }
  }
  return <div className="tag-box quiz-tags" onClick={() => input.current?.focus()}>
    {values.map((value, i) => <span key={`${value}-${i}`} className={`tag${isToken(value) ? ' quiz-token' : ''}`}>
      {value}
      {!disabled && <button type="button" aria-label={`Remove ${value}`} onClick={(event) => { event.stopPropagation(); onChange(values.filter((_, j) => j !== i)) }}>×</button>}
    </span>)}
    {!disabled && <input ref={input} aria-label={label} list="quiz-answer-options" value={text} placeholder={values.length ? '' : 'add…'} onChange={(event) => setText(event.target.value)} onKeyDown={onKey} onBlur={commit} />}
  </div>
}

function PoolEditor({ value, onCancel, onSaved }: { value: { name: string; text: string; isNew: boolean }; onCancel: () => void; onSaved: (lists: Record<string, string[]>) => void }) {
  const [name, setName] = useState(value.name)
  const [text, setText] = useState(value.text)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const items = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  return <div className="quiz-paste">
    {value.isNew && <label className="admin-field"><span className="quiz-label">Pool name (used as ${'{'}name{'}'})</span><input value={name} onChange={(event) => setName(event.target.value.replace(/[^a-z0-9_]/gi, ''))} placeholder="skill" /></label>}
    <label className="admin-field"><span className="quiz-label">${name || 'pool'} · one name per line · {items.length} names</span><textarea rows={8} value={text} onChange={(event) => setText(event.target.value)} /></label>
    {error && <p className="admin-warn">{error}</p>}
    <div className="admin-row">
      <button type="button" className="primary" disabled={busy || !name} onClick={async () => {
        setBusy(true)
        setError('')
        try {
          const result = await quizApi.saveList(name, items)
          onSaved(result.lists)
        } catch (reason) {
          setError(errorText(reason))
        } finally {
          setBusy(false)
        }
      }}>{busy ? 'Saving…' : items.length ? 'Publish pool' : 'Delete pool'}</button>
      <button type="button" onClick={onCancel}>Cancel</button>
    </div>
  </div>
}
