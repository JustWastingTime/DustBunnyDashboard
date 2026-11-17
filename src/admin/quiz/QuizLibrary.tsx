import { useEffect, useMemo, useState } from 'react'
import { quizApi, errorText, type CategoryFile, type CategorySummary, type QuizAccess, type TestSummary } from './api'
import { DIFFICULTIES, DIFFICULTY_LABEL, shapeOf, usesSlot, type Difficulty } from './model'
import './quiz.css'

type Props = { access: QuizAccess; selected: string; navigate: (to: string) => void }

export function QuizLibrary({ access, selected, navigate }: Props) {
  const [categories, setCategories] = useState<CategorySummary[]>([])
  const [test, setTest] = useState<TestSummary | null>(null)
  const [file, setFile] = useState<{ id: string; data: CategoryFile } | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [shape, setShape] = useState('')
  const [creating, setCreating] = useState(false)
  const owner = access.role === 'owner'

  const loadList = () => quizApi.categories().then((payload) => {
    setCategories(payload.categories)
    setTest(payload.test)
  }).catch((reason) => setError(errorText(reason)))
  useEffect(() => { void loadList() }, [])

  const current = selected || categories.find((c) => c.enabled)?.id || categories[0]?.id || ''
  useEffect(() => {
    if (!current) return
    setFile(null)
    quizApi.category(current).then((payload) => setFile({ id: current, data: payload.data })).catch((reason) => setError(errorText(reason)))
  }, [current])

  const summary = categories.find((c) => c.id === current)
  const rows = useMemo(() => {
    const questions = file?.id === current ? file.data.questions : []
    const q = query.trim().toLowerCase()
    return questions
      .map((question, index) => ({ question, index }))
      .filter(({ question }) => {
        const d = question.difficulty || 'easy'
        if (difficulty && d !== difficulty) return false
        if (shape && shapeOf(question) !== shape) return false
        if (!q) return true
        return JSON.stringify(question).toLowerCase().includes(q)
      })
  }, [file, current, query, difficulty, shape])

  const toggle = async (category: CategorySummary) => {
    setError('')
    try {
      await quizApi.setEnabled(category.id, !category.enabled)
      await loadList()
    } catch (reason) {
      setError(errorText(reason))
    }
  }

  return <section className="admin-grid quiz-page">
    <div className="quiz-head">
      <div>
        <p className="crumb">Library</p>
        <h1>Quizzes</h1>
      </div>
      <div className="admin-row">
        <a className="quiz-button" href="/admin/quizzes/coverage" onClick={(event) => { event.preventDefault(); navigate('/admin/quizzes/coverage') }}>Coverage &amp; generator</a>
        {current && summary?.canSubmit && <a className="quiz-button primary" href={`/admin/quizzes/edit?key=${current}&q=new`} onClick={(event) => { event.preventDefault(); navigate(`/admin/quizzes/edit?key=${current}&q=new`) }}>New question</a>}
      </div>
    </div>

    {error && <p className="notice error">{error}</p>}

    <div className="quiz-split">
      <aside className="admin-section quiz-cats" aria-label="Categories">
        {test && <a className="quiz-test-card" href="/admin/quizzes/test" onClick={(event) => { event.preventDefault(); navigate('/admin/quizzes/test') }}>
          <span className="quiz-test-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18"><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3M7.5 14h9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <span className="quiz-cat-text">
            <strong>Test</strong>
            <small>{test.total} question{test.total === 1 ? '' : 's'}{access.canPublish ? '' : test.mine ? ` · ${test.mine} yours` : ''}</small>
          </span>
          {access.canPublish && test.waiting > 0 && <span className="quiz-badge" aria-label={`${test.waiting} waiting for approval`}>{test.waiting}</span>}
        </a>}
        <h2>Categories {owner && <button type="button" className="icon-button add" aria-label="New category" onClick={() => setCreating((v) => !v)}>+</button>}</h2>
        {creating && <NewCategory onDone={async (id) => { setCreating(false); await loadList(); if (id) navigate(`/admin/quizzes?key=${id}`) }} />}
        {categories.map((category) => (
          <div key={category.id} className={`quiz-cat${category.id === current ? ' on' : ''}`}>
            <a href={`/admin/quizzes?key=${category.id}`} onClick={(event) => { event.preventDefault(); navigate(`/admin/quizzes?key=${category.id}`) }}>
              <span className={`quiz-dot${category.enabled ? ' live' : ''}`} aria-hidden="true" />
              <span className="quiz-cat-text">
                <strong>{category.name}</strong>
                <small>{category.questions} questions · {category.entries} entries</small>
              </span>
            </a>
            {owner
              ? <label className="quiz-switch" title={category.enabled ? 'In /quiz rotation' : 'Not in /quiz rotation'}>
                <input type="checkbox" checked={category.enabled} onChange={() => void toggle(category)} aria-label={`Include ${category.name} in /quiz`} />
                <span>{category.enabled ? 'On' : 'Off'}</span>
              </label>
              : <small className={category.enabled ? 'quiz-on' : 'muted'}>{category.enabled ? 'On' : 'Off'}</small>}
          </div>
        ))}
        <p className="muted quiz-note">Categories that are off never roll in /quiz. New questions wait in Test until they’re approved.</p>
      </aside>

      <div className="admin-section quiz-main">
        {summary && <>
          <div className="quiz-head">
            <div>
              <h2 className="quiz-title">{summary.name} <span className={`quiz-pill ${summary.enabled ? 'live' : ''}`}>{summary.enabled ? 'Enabled' : 'Off'}</span>{!summary.canEdit && <span className="quiz-pill">{summary.canSubmit ? 'Submit via Test' : 'Read only'}</span>}</h2>
              <p className="muted">{summary.questions} questions · {summary.entries} entries · categories/{summary.id}.json</p>
            </div>
          </div>
          <DifficultyBar counts={summary.difficulty} />
        </>}

        <div className="quiz-filters">
          <input type="search" placeholder="Search prompts and answers…" aria-label="Search questions" value={query} onChange={(event) => setQuery(event.target.value)} />
          <select aria-label="Difficulty" value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
            <option value="">All difficulties</option>
            {DIFFICULTIES.map((d) => <option key={d} value={d}>{DIFFICULTY_LABEL[d]}</option>)}
          </select>
          <select aria-label="Shape" value={shape} onChange={(event) => setShape(event.target.value)}>
            <option value="">All shapes</option>
            <option>Template</option>
            <option>Fixed answers</option>
            <option>Image</option>
            <option>Audio</option>
          </select>
        </div>

        {!file && current && <p className="muted">Loading questions from GitHub…</p>}
        {file && <div className="table-wrap">
          <table className="data-table quiz-table">
            <thead><tr><th>#</th><th>Prompt</th><th>Shape</th><th>Entries</th><th>Difficulty</th><th>Random</th></tr></thead>
            <tbody>
              {rows.map(({ question, index }) => {
                const prompt = String(question.promptTemplate || question.prompt || '')
                const d = (question.difficulty || 'easy') as Difficulty
                const tokens = [...new Set(JSON.stringify(question.entries || question.answers || []).match(/"\$[a-z0-9_]+"/gi) || [])].map((t) => t.slice(1, -1))
                const href = `/admin/quizzes/edit?key=${current}&q=${index}`
                return <tr key={index}>
                  <td className="muted">{index + 1}</td>
                  <td><a className="quiz-prompt" href={href} onClick={(event) => { event.preventDefault(); navigate(href) }}><PromptText text={prompt} /></a></td>
                  <td className="muted">{shapeOf(question)}</td>
                  <td>{Array.isArray(question.entries) ? question.entries.length : 1}</td>
                  <td><span className={`quiz-diff ${d}`}>{DIFFICULTY_LABEL[d] || d}</span></td>
                  <td>{tokens.length ? tokens.map((t) => <code key={t} className="quiz-token">{t}</code>) : <span className="muted">—</span>}</td>
                </tr>
              })}
              {!rows.length && <tr><td colSpan={6} className="muted">No questions match.</td></tr>}
            </tbody>
          </table>
        </div>}
      </div>
    </div>
  </section>
}

export function PromptText({ text }: { text: string }) {
  if (!usesSlot(text)) return <>{text}</>
  const parts = text.split(/(\{0\}|\{name\})/)
  return <>{parts.map((part, i) => (part === '{0}' || part === '{name}' ? <code key={i} className="quiz-slot">{part}</code> : <span key={i}>{part}</span>))}</>
}

function DifficultyBar({ counts }: { counts: Record<Difficulty, number> }) {
  const total = DIFFICULTIES.reduce((sum, d) => sum + counts[d], 0)
  if (!total) return null
  return <div className="quiz-mix">
    <div className="quiz-mix-bar" role="img" aria-label={DIFFICULTIES.map((d) => `${counts[d]} ${d}`).join(', ')}>
      {DIFFICULTIES.filter((d) => counts[d]).map((d) => <span key={d} className={d} style={{ flex: counts[d] }} />)}
    </div>
    <div className="quiz-mix-key">
      {DIFFICULTIES.map((d) => <span key={d}><i className={d} />{DIFFICULTY_LABEL[d]} {counts[d]}</span>)}
    </div>
  </div>
}

function NewCategory({ onDone }: { onDone: (id: string | null) => void }) {
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <form className="quiz-new-cat" onSubmit={async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await quizApi.createCategory(id.trim().toLowerCase(), name.trim())
      onDone(id.trim().toLowerCase())
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setBusy(false)
    }
  }}>
    <label className="admin-field"><span>File id</span><input required pattern="[a-z0-9_\-]{1,40}" value={id} onChange={(event) => setId(event.target.value)} placeholder="e.g. racetracks" /></label>
    <label className="admin-field"><span>Display name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Racetracks" /></label>
    {error && <p className="admin-warn">{error}</p>}
    <div className="admin-row">
      <button type="submit" className="primary" disabled={busy}>{busy ? 'Creating…' : 'Create (off)'}</button>
      <button type="button" onClick={() => onDone(null)}>Cancel</button>
    </div>
  </form>
}
