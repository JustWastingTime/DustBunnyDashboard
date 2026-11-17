import { useEffect, useMemo, useState } from 'react'
import { quizApi, errorText, type CategoryFile, type CategorySummary, type QuizAccess, type Submission } from './api'
import { DIFFICULTY_LABEL, type Difficulty } from './model'
import { PromptText } from './QuizLibrary'
import './quiz.css'

type Props = { access: QuizAccess; navigate: (to: string) => void }

export function QuizTest({ access, navigate }: Props) {
  const [subs, setSubs] = useState<Submission[] | null>(null)
  const [categories, setCategories] = useState<CategorySummary[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [open, setOpen] = useState('')
  const [busy, setBusy] = useState('')
  const [oldDrafts, setOldDrafts] = useState(0)

  const load = () => Promise.all([quizApi.test(), quizApi.categories()])
    .then(([test, cats]) => { setSubs(test.submissions); setOldDrafts(test.oldDrafts || 0); setCategories(cats.categories) })
    .catch((reason) => setError(errorText(reason)))
  useEffect(() => { void load() }, [])

  const names = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])
  const groups = useMemo(() => {
    const list = subs || []
    return [
      { title: 'Waiting for your approval', items: list.filter((s) => s.canApprove) },
      { title: 'Your submissions', items: list.filter((s) => !s.canApprove && s.byId && s.canEdit) },
      { title: 'Other test questions', items: list.filter((s) => !s.canApprove && !(s.byId && s.canEdit)) },
    ].filter((g) => g.items.length)
  }, [subs])

  const run = async (id: string, fn: () => Promise<string>) => {
    setBusy(id)
    setError('')
    setNotice('')
    try {
      setNotice(await fn())
      setOpen('')
      await load()
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setBusy('')
    }
  }

  const retarget = (s: Submission, target: string) => run(s.id, async () => {
    const { question } = await quizApi.submission(s.id)
    await quizApi.updateSubmission(s.id, question, target)
    return `Moved to ${names.get(target) || target}.`
  })

  return <section className="admin-grid quiz-page">
    <div className="quiz-head">
      <div>
        <p className="crumb"><a href="/admin/quizzes" onClick={(event) => { event.preventDefault(); navigate('/admin/quizzes') }}>Quizzes</a> / Test</p>
        <h1>Test questions</h1>
        <p className="muted">New questions start here and play in the <code>testing</code> /quiz mode. Approving moves one into the category it was made for.</p>
      </div>
      <a className="quiz-button primary" href="/admin/quizzes/edit?q=new" onClick={(event) => { event.preventDefault(); navigate('/admin/quizzes/edit?q=new') }}>New question</a>
    </div>
    {error && <p className="notice error" role="alert">{error}</p>}
    {notice && <p className="notice quiz-ok" role="status">{notice}</p>}
    {oldDrafts > 0 && <div className="admin-banner quiz-banner">
      <span>{oldDrafts} draft{oldDrafts === 1 ? '' : 's'} from the old review queue {oldDrafts === 1 ? 'is' : 'are'} still waiting. Old drafts can’t be approved any more, so move them into Test.</span>
      <button type="button" className="primary" disabled={busy === 'import'} onClick={() => void run('import', async () => {
        const result = await quizApi.importDrafts()
        return `Moved ${result.imported} question${result.imported === 1 ? '' : 's'} into Test${result.skipped.length ? ` (${result.skipped.length} draft${result.skipped.length === 1 ? ' had' : 's had'} no changes left)` : ''}.`
      })}>{busy === 'import' ? 'Moving…' : 'Move into Test'}</button>
    </div>}
    {!subs && !error && <p className="muted">Loading Test from GitHub…</p>}
    {subs && !subs.length && <p className="quiz-check ok">Test is empty. Nothing waiting.</p>}

    {groups.map((group) => <section key={group.title} className="quiz-test-group">
      <h2 className="quiz-group-title">{group.title} <span className="muted">· {group.items.length}</span></h2>
      <div className="quiz-test-list">
        {group.items.map((s) => {
          const href = `/admin/quizzes/edit?sub=${s.id}`
          const d = (s.difficulty || 'easy') as Difficulty
          return <article key={s.id} className="admin-section quiz-sub">
            <div className="quiz-sub-main">
              <a className="quiz-prompt quiz-sub-prompt" href={href} onClick={(event) => { event.preventDefault(); navigate(href) }}><PromptText text={s.prompt || 'Untitled question'} /></a>
              <p className="muted quiz-sub-meta">
                {s.shape === 'template' ? `${s.entries} entr${s.entries === 1 ? 'y' : 'ies'}` : 'Fixed answers'}
                {' · '}<span className={`quiz-diff ${d}`}>{DIFFICULTY_LABEL[d] || d}</span>
                {s.by ? ` · by ${s.by}` : ''}{s.at ? ` · ${new Date(s.at).toLocaleDateString()}` : ''}
              </p>
              {s.note && <p className="quiz-sub-note">{s.note}</p>}
            </div>
            <label className="quiz-sub-target">
              <span className="quiz-label">For</span>
              {s.canEdit
                ? <select value={s.target || ''} disabled={busy === s.id} onChange={(event) => void retarget(s, event.target.value)}>
                  {!s.target && <option value="">Pick a category…</option>}
                  {categories.filter((c) => c.canSubmit || c.id === s.target).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                : <strong>{s.target ? names.get(s.target) || s.target : 'No category yet'}</strong>}
            </label>
            <div className="admin-row quiz-sub-actions">
              <a className="quiz-button" href={href} onClick={(event) => { event.preventDefault(); navigate(href) }}>{s.canEdit ? 'Edit' : 'View'}</a>
              {s.canApprove && <button type="button" className="primary" aria-expanded={open === s.id} onClick={() => setOpen(open === s.id ? '' : s.id)}>Approve…</button>}
              {!s.canApprove && s.canEdit && !s.target && access.role === 'owner' && <span className="muted">Pick a category to approve</span>}
              {s.canEdit && <button type="button" className="quiz-danger" disabled={busy === s.id} onClick={() => {
                if (window.confirm('Remove this question from Test?')) void run(s.id, async () => { await quizApi.removeSubmission(s.id); return 'Removed from Test.' })
              }}>Remove</button>}
            </div>
            {open === s.id && s.target && <ApprovePanel
              submission={s}
              categories={categories.filter((c) => c.canEdit)}
              busy={busy === s.id}
              onCancel={() => setOpen('')}
              onApprove={(body) => run(s.id, async () => {
                const result = await quizApi.approve(s.id, body)
                return `Approved into ${names.get(result.categoryId) || result.categoryId}, question ${result.questionIndex + 1}.`
              })}
            />}
          </article>
        })}
      </div>
    </section>)}
  </section>
}

type ApproveBody = { target: string; mode: 'new' | 'merge' | 'replace'; questionIndex?: number; keep?: boolean }

export function ApprovePanel({ submission, categories, busy, onApprove, onCancel }: {
  submission: Submission
  categories: CategorySummary[]
  busy: boolean
  onApprove: (body: ApproveBody) => void
  onCancel?: () => void
}) {
  const [target, setTarget] = useState(submission.target || categories[0]?.id || '')
  const [file, setFile] = useState<CategoryFile | null>(null)
  const [choice, setChoice] = useState('new')
  const [keep, setKeep] = useState(false)

  useEffect(() => {
    if (!target) return
    setFile(null)
    quizApi.category(target).then((payload) => {
      setFile(payload.data)
      // An edited copy of a live question replaces it; otherwise, same prompt already live means add the entries to it.
      const edited = target === submission.target ? submission.note.match(/^Edited version of question (\d+)/) : null
      const replaceAt = edited ? Number(edited[1]) - 1 : -1
      const same = submission.shape === 'template'
        ? payload.data.questions.findIndex((q) => Array.isArray(q.entries) && String(q.promptTemplate || q.prompt || '').trim() === submission.prompt.trim())
        : -1
      setChoice(replaceAt >= 0 && payload.data.questions[replaceAt] ? `r${replaceAt}` : same >= 0 ? `m${same}` : 'new')
    }).catch(() => setFile(null))
  }, [target, submission.prompt, submission.shape, submission.target, submission.note])

  const mergeable = submission.shape === 'template'
    ? (file?.questions || []).map((q, i) => ({ q, i })).filter(({ q }) => Array.isArray(q.entries))
    : []

  return <div className="quiz-approve">
    <div className="quiz-row">
      <label className="admin-field"><span className="quiz-label">Category</span>
        <select value={target} onChange={(event) => setTarget(event.target.value)}>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="admin-field grow"><span className="quiz-label">How</span>
        <select value={choice} disabled={!file} onChange={(event) => setChoice(event.target.value)}>
          <option value="new">Add as a new question</option>
          {mergeable.length > 0 && <optgroup label="Add its entries to">
            {mergeable.map(({ q, i }) => <option key={i} value={`m${i}`}>{i + 1}. {String(q.promptTemplate || q.prompt || '').slice(0, 60)}</option>)}
          </optgroup>}
          {(file?.questions.length || 0) > 0 && <optgroup label="Replace">
            {(file?.questions || []).map((q, i) => <option key={i} value={`r${i}`}>{i + 1}. {String(q.promptTemplate || q.prompt || '').slice(0, 60)}</option>)}
          </optgroup>}
        </select>
      </label>
    </div>
    <label className="quiz-inline"><input type="checkbox" checked={keep} onChange={(event) => setKeep(event.target.checked)} /> Keep a copy in Test</label>
    <div className="admin-row">
      <button type="button" className="primary" disabled={busy || !file || !target} onClick={() => onApprove({
        target,
        mode: choice === 'new' ? 'new' : choice.startsWith('r') ? 'replace' : 'merge',
        questionIndex: choice === 'new' ? undefined : Number(choice.slice(1)),
        keep,
      })}>{busy ? 'Approving…' : choice.startsWith('r') ? `Replace question ${Number(choice.slice(1)) + 1}` : 'Approve & publish'}</button>
      {onCancel && <button type="button" onClick={onCancel}>Cancel</button>}
    </div>
  </div>
}
