import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { quizApi, errorText, type CategoryFile, type CategorySummary, type QuizAccess, type RawQuestion, type Submission } from './api'
import {
  DIFFICULTIES, DIFFICULTY_LABEL, IMPORT_KEY, blankEntry, checkQuestion, entryFromRaw, entryToRaw, fillPrompt, isImageUrl, isToken, isUrl,
  newQuestion, parsePastedRows, previewOptions, questionFromRaw, questionToRaw, usesSlot,
  type Difficulty, type EditEntry, type EditQuestion, type PendingImport,
} from './model'
import { PromptText } from './QuizLibrary'
import { ApprovePanel } from './QuizTest'
import './quiz.css'

type Props = {
  access: QuizAccess
  categoryId: string
  question: string
  submissionId: string
  navigate: (to: string) => void
}

/** live: editing a published question. new: a question headed for Test. submission: a question already in Test. */
type Mode = 'live' | 'new' | 'submission'

const PAGE = 60
const GRADES = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

function stripSubmission(raw: RawQuestion): RawQuestion {
  const { submission: _meta, ...rest } = raw
  return rest
}

export function QuizEditor({ access, categoryId, question: questionParam, submissionId, navigate }: Props) {
  const [mode, setMode] = useState<Mode>('new')
  const [file, setFile] = useState<CategoryFile | null>(null)
  const [blobSha, setBlobSha] = useState('')
  const [index, setIndex] = useState<number | null>(null)
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [categories, setCategories] = useState<CategorySummary[]>([])
  const [target, setTarget] = useState('')
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
  const [approving, setApproving] = useState(false)

  const owner = access.role === 'owner'

  useEffect(() => {
    quizApi.lists().then((payload) => setLists(payload.lists)).catch(() => {})
    quizApi.categories().then((payload) => setCategories(payload.categories)).catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    setError('')
    setApproving(false)
    const load = async () => {
      let nextMode: Mode
      let next: EditQuestion
      let nextTarget = ''
      let liveIndex: number | null = null
      if (submissionId) {
        const payload = await quizApi.submission(submissionId)
        if (cancelled) return
        nextMode = 'submission'
        next = questionFromRaw(stripSubmission(payload.question))
        nextTarget = payload.submission.target || ''
        setSubmission(payload.submission)
        setFile(null)
      } else if (!categoryId || questionParam === 'new' || questionParam === '' || Number.isNaN(Number(questionParam))) {
        nextMode = 'new'
        next = newQuestion()
        nextTarget = categoryId
        setSubmission(null)
        setFile(null)
      } else {
        const payload = await quizApi.category(categoryId)
        if (cancelled) return
        liveIndex = Number(questionParam)
        if (!payload.data.questions[liveIndex]) throw new Error(`Question ${liveIndex + 1} does not exist in ${payload.data.name}.`)
        nextMode = 'live'
        next = questionFromRaw(payload.data.questions[liveIndex])
        setFile(payload.data)
        setBlobSha(payload.blobSha)
        setSubmission(null)
      }
      const base = nextMode === 'new' ? '' : JSON.stringify(questionToRaw(next)) + nextTarget
      const imported = takeImport(nextMode === 'live' ? categoryId : nextTarget, nextMode === 'live' ? liveIndex : 'new')
      if (imported) {
        const rows = imported.entries.map(entryFromRaw)
        const blank = next.entries.length === 1 && !next.entries[0].correct && !next.entries[0].subject
        next = { ...next, prompt: next.prompt || imported.promptTemplate, entries: blank ? rows : [...next.entries, ...rows] }
        setNotice(`Added ${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}. Review them, then save.`)
      }
      setMode(nextMode)
      setIndex(liveIndex)
      setTarget(nextTarget)
      setQ(next)
      setBaseline(base)
      setSelected(0)
      setFilter('')
      setLimit(PAGE)
    }
    load().catch((reason) => { if (!cancelled) setError(errorText(reason)) })
    return () => { cancelled = true }
  }, [categoryId, questionParam, submissionId])

  const dirty = q ? JSON.stringify(questionToRaw(q)) + target !== baseline : false
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
  if (!q) return <p className="muted">Loading question…</p>

  const names = new Map(categories.map((c) => [c.id, c.name]))
  const scoped = (id: string) => access.categories.includes('*') || access.categories.includes(id)
  const canEdit = mode === 'live' ? access.canPublish && scoped(categoryId) : mode === 'submission' ? Boolean(submission?.canEdit) : true
  const targets = categories.filter((c) => c.canSubmit || c.id === target)

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
  const addToken = (token: string, all = false) => setQ((prev) => (prev ? {
    ...prev,
    entries: prev.entries.map((e, j) => ((all || j === selected) && !e.raw && !e.wrong.includes(token) ? { ...e, wrong: [...e.wrong, token] } : e)),
  } : prev))
  const applyGrades = () => setQ((prev) => (prev ? {
    ...prev,
    entries: prev.entries.map((e) => (GRADES.includes(e.correct.trim().toUpperCase()) ? { ...e, wrong: GRADES.filter((g) => g !== e.correct.trim().toUpperCase()) } : e)),
  } : prev))

  const entry = q.entries[Math.min(selected, q.entries.length - 1)]
  const options = entry ? previewOptions(entry, lists, seed + selected * 7919) : []
  const difficulty = (entry?.difficulty || q.difficulty || String(file?.difficulty || 'easy')) as Difficulty
  const subject = q.shape === 'template' ? entry?.subject || '' : ''
  const promptShown = q.shape === 'template' && usesSlot(q.prompt) ? fillPrompt(q.prompt, subject || '…') : q.prompt
  const pools = Object.entries(lists).filter(([, items]) => Array.isArray(items))
  const answerOptions = [...new Set([...pools.map(([name]) => `$${name}`), ...(lists.uma || [])])]
  const categoryName = mode === 'live' ? file?.name || categoryId : `Test → ${names.get(target) || target || 'no category'}`

  const save = async () => {
    if (errors.length) { setError('Fix the problems under Checks before saving.'); return }
    if (mode !== 'live' && !target) { setError('Pick the category this question is for.'); return }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const raw = questionToRaw(q)
      if (mode === 'live' && file && index != null) {
        const questions = [...file.questions]
        questions[index] = raw
        const data = { ...file, questions }
        const result = await quizApi.saveCategory(categoryId, { data, baseBlobSha: blobSha, message: message.trim() || undefined })
        setFile(data)
        if (result.blobSha) setBlobSha(result.blobSha)
        setBaseline(JSON.stringify(raw) + target)
        setNotice(`Published: ${result.summary.text}. The bot uses it on the next round.`)
      } else if (mode === 'new') {
        const { id } = await quizApi.submit(raw, target)
        setNotice(`Added to Test for ${names.get(target) || target}. ${access.canPublish && scoped(target) ? 'Approve it when it plays well.' : 'A reviewer approves it into the category.'}`)
        navigate(`/admin/quizzes/edit?sub=${id}`)
      } else if (submissionId) {
        const { id } = await quizApi.updateSubmission(submissionId, raw, target, message.trim() || undefined)
        setNotice('Saved to Test.')
        navigate(`/admin/quizzes/edit?sub=${id}`)
      }
      setMessage('')
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    const label = mode === 'live' ? 'Delete this live question and all of its entries?' : 'Remove this question from Test?'
    if (!window.confirm(label)) return
    setBusy(true)
    setError('')
    try {
      if (mode === 'live' && file && index != null) {
        const questions = file.questions.filter((_, i) => i !== index)
        await quizApi.saveCategory(categoryId, { data: { ...file, questions }, baseBlobSha: blobSha, message: message.trim() || undefined })
        navigate(`/admin/quizzes?key=${categoryId}`)
      } else if (submissionId) {
        await quizApi.removeSubmission(submissionId)
        navigate('/admin/quizzes/test')
      }
    } catch (reason) {
      setError(errorText(reason))
      setBusy(false)
    }
  }

  const copyToTest = () => {
    const pending: PendingImport = { categoryId, question: 'new', promptTemplate: q.prompt, entries: q.entries.map(entryToRaw) }
    try {
      sessionStorage.setItem(IMPORT_KEY, JSON.stringify(pending))
      navigate(`/admin/quizzes/edit?key=${categoryId}&q=new`)
    } catch {
      setError('This browser blocked session storage.')
    }
  }

  const backHref = mode === 'live' ? `/admin/quizzes?key=${categoryId}` : '/admin/quizzes/test'
  const title = q.prompt || (mode === 'new' ? 'New question' : 'Untitled question')
  const saveLabel = mode === 'live' ? 'Publish to bot' : mode === 'new' ? 'Submit to Test' : 'Save to Test'

  return <section className="admin-grid quiz-page quiz-editor">
    <div>
      <p className="crumb">
        <a href="/admin/quizzes" onClick={(event) => { event.preventDefault(); navigate('/admin/quizzes') }}>Quizzes</a>
        {' / '}
        <a href={backHref} onClick={(event) => { event.preventDefault(); navigate(backHref) }}>{mode === 'live' ? file?.name : 'Test'}</a>
        {' / '}{mode === 'live' && index != null ? `Question ${index + 1}` : mode === 'new' ? 'New question' : 'Test question'}
      </p>
      <h1 className="quiz-h1"><PromptText text={title} /></h1>
    </div>

    {mode === 'new' && <div className="admin-banner quiz-banner">New questions go to the Test category first, where they play in the <code>testing</code> /quiz mode. {access.canPublish ? 'Approve them from Test when they’re ready.' : 'A reviewer approves them into the category you pick.'}</div>}
    {mode === 'submission' && submission && <div className="admin-banner quiz-banner">
      <span>In Test{submission.by ? `, submitted by ${submission.by}` : ''}{submission.at ? ` on ${new Date(submission.at).toLocaleDateString()}` : ''}.</span>
      {submission.canApprove && !dirty && <button type="button" className="primary" onClick={() => setApproving((v) => !v)}>Approve…</button>}
      {submission.canApprove && dirty && <span className="muted">Save your changes before approving.</span>}
    </div>}
    {approving && submission && <section className="admin-section">
      <h2>Approve into a category</h2>
      <ApprovePanel
        submission={{ ...submission, target: target || submission.target }}
        categories={categories.filter((c) => c.canEdit)}
        busy={busy}
        onCancel={() => setApproving(false)}
        onApprove={async (body) => {
          setBusy(true)
          setError('')
          try {
            const result = await quizApi.approve(submissionId, body)
            setNotice(`Approved into ${names.get(result.categoryId) || result.categoryId}. This is the live question now.`)
            navigate(`/admin/quizzes/edit?key=${result.categoryId}&q=${result.questionIndex}`)
          } catch (reason) {
            setError(errorText(reason))
          } finally {
            setBusy(false)
          }
        }}
      />
    </section>}
    {mode === 'live' && !canEdit && <div className="admin-banner quiz-banner">
      <span>Live questions can only be changed by reviewers. To suggest more entries or a fix, copy it into Test.</span>
      {q.shape === 'template' && categories.some((c) => c.id === categoryId && c.canSubmit) && <button type="button" onClick={copyToTest}>Copy to a new Test question</button>}
    </div>}
    {notice && <p className="notice quiz-ok" role="status">{notice}</p>}
    {error && <p className="notice error" role="alert">{error}</p>}

    <div className="quiz-desk">
      <div className="quiz-form">
        <section className="admin-section">
          <h2>Question
            <span className="quiz-seg" role="group" aria-label="Question shape">
              <button type="button" className={q.shape === 'template' ? 'on' : ''} disabled={!canEdit} onClick={() => update({ shape: 'template' })}>Template + entries</button>
              <button type="button" className={q.shape === 'fixed' ? 'on' : ''} disabled={!canEdit} onClick={() => { update({ shape: 'fixed', promptKey: 'prompt', entries: q.entries.length ? q.entries.slice(0, 1) : [blankEntry()] }); setSelected(0) }}>Fixed answers</button>
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
            {mode !== 'live' && <label className="admin-field">
              <span className="quiz-label">Category it’s for</span>
              <select value={target} disabled={!canEdit} onChange={(event) => setTarget(event.target.value)}>
                {!target && <option value="">Pick a category…</option>}
                {targets.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>}
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
              <small>{categoryName} · {DIFFICULTY_LABEL[difficulty] || difficulty}</small>
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
      {mode !== 'new' && <input aria-label="Change note" placeholder="Change note (optional)" value={message} onChange={(event) => setMessage(event.target.value)} />}
      <div className="admin-row">
        {mode !== 'new' && <button type="button" className="quiz-danger" disabled={busy} onClick={() => void remove()}>{mode === 'live' ? 'Delete question' : 'Remove from Test'}</button>}
        {mode !== 'new' && <button type="button" disabled={busy || !dirty} onClick={() => {
          if (mode === 'live' && file && index != null) setQ(questionFromRaw(file.questions[index]))
          else quizApi.submission(submissionId).then((payload) => {
            setQ(questionFromRaw(stripSubmission(payload.question)))
            setTarget(payload.submission.target || '')
          }).catch((reason) => setError(errorText(reason)))
          setNotice('')
        }}>Discard</button>}
        <button type="button" className="primary" disabled={busy || !dirty || errors.length > 0 || (mode !== 'live' && !target)} onClick={() => void save()}>
          {busy ? 'Saving…' : saveLabel}
        </button>
      </div>
    </div>}
  </section>
}

function takeImport(categoryId: string, question: number | 'new' | null): PendingImport | null {
  if (question == null) return null
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
