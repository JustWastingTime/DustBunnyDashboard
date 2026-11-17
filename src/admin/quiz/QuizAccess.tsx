import { useEffect, useState } from 'react'
import { quizApi, errorText, type CategorySummary, type DraftSummary, type QuizAccess as Access, type QuizEditor } from './api'
import './quiz.css'

const ROLE_INFO: Array<{ role: string; dot: string; can: Array<[boolean, string]> }> = [
  { role: 'Owner', dot: 'owner', can: [[true, 'Everything, including this page'], [true, 'Turn categories on or off'], [true, 'Edit $pools and add categories']] },
  { role: 'Reviewer', dot: 'reviewer', can: [[true, 'Edit questions in their categories'], [true, 'Approve and publish drafts'], [false, 'Change who has access']] },
  { role: 'Quiz editor', dot: 'editor', can: [[true, 'Edit questions in their categories'], [true, 'Use the generator'], [false, 'Publish: saves go to review']] },
]

export function QuizAccessPage({ access }: { access: Access }) {
  const [editors, setEditors] = useState<QuizEditor[]>([])
  const [categories, setCategories] = useState<CategorySummary[]>([])
  const [error, setError] = useState('')
  const [form, setForm] = useState({ discordId: '', label: '', role: 'editor' as QuizEditor['role'], categories: [] as string[], canPublish: false })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (access.role !== 'owner') return
    Promise.all([quizApi.editors(), quizApi.categories()])
      .then(([e, c]) => { setEditors(e.editors); setCategories(c.categories) })
      .catch((reason) => setError(errorText(reason)))
  }, [access.role])

  if (access.role !== 'owner') return <p>Only the bot owner can manage quiz access.</p>

  const save = async (editor: Pick<QuizEditor, 'discordId' | 'label' | 'role' | 'categories' | 'canPublish'>) => {
    setError('')
    try {
      const result = await quizApi.saveEditor(editor)
      setEditors(result.editors)
      return true
    } catch (reason) {
      setError(errorText(reason))
      return false
    }
  }

  return <section className="admin-grid quiz-page">
    <div>
      <p className="crumb">Administration</p>
      <h1>Quiz access</h1>
      <p className="muted">People sign in with Discord on this dashboard. Their access only covers quizzes, not the other data editors.</p>
    </div>
    {error && <p className="notice error">{error}</p>}

    <div className="quiz-roles">
      {ROLE_INFO.map((info) => <div key={info.role} className="admin-section">
        <h2><span><i className={`quiz-role-dot ${info.dot}`} aria-hidden="true" /> {info.role}</span></h2>
        {info.can.map(([yes, text]) => <p key={text} className={yes ? 'quiz-can' : 'quiz-can no'}><b aria-hidden="true">{yes ? '✓' : '–'}</b>{text}</p>)}
      </div>)}
    </div>

    <section className="admin-section">
      <h2>People</h2>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Person</th><th>Role</th><th>Categories</th><th>Publish</th><th></th></tr></thead>
          <tbody>
            <tr>
              <td><strong>You</strong><div className="muted">Bot owner (BOT_OWNER_IDS)</div></td>
              <td>Owner</td><td>All</td><td className="quiz-on">Always</td><td></td>
            </tr>
            {editors.map((editor) => <tr key={editor.discordId}>
              <td>
                <input aria-label={`Name for ${editor.discordId}`} defaultValue={editor.label} placeholder="Name" key={editor.label} onBlur={(event) => { if (event.target.value !== editor.label) void save({ ...editor, label: event.target.value }) }} />
                <div className="muted quiz-mono">{editor.discordId}</div>
              </td>
              <td>
                <select aria-label={`Role for ${editor.label || editor.discordId}`} value={editor.role} onChange={(event) => void save({ ...editor, role: event.target.value as QuizEditor['role'] })}>
                  <option value="editor">Quiz editor</option>
                  <option value="reviewer">Reviewer</option>
                </select>
              </td>
              <td><CategoryPicker categories={categories} value={editor.categories} onChange={(next) => void save({ ...editor, categories: next })} /></td>
              <td>
                {editor.role === 'reviewer'
                  ? <span className="quiz-on">Yes</span>
                  : <label className="quiz-inline"><input type="checkbox" checked={editor.canPublish} onChange={(event) => void save({ ...editor, canPublish: event.target.checked })} /> Without review</label>}
              </td>
              <td className="row-actions">
                <button type="button" className="quiz-danger" onClick={async () => {
                  if (!window.confirm(`Remove quiz access for ${editor.label || editor.discordId}?`)) return
                  try { setEditors((await quizApi.removeEditor(editor.discordId)).editors) } catch (reason) { setError(errorText(reason)) }
                }}>Remove</button>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>

      <form className="quiz-add-person" onSubmit={async (event) => {
        event.preventDefault()
        setBusy(true)
        if (await save(form)) setForm({ discordId: '', label: '', role: 'editor', categories: [], canPublish: false })
        setBusy(false)
      }}>
        <h3>Add a person</h3>
        <div className="quiz-row">
          <label className="admin-field grow"><span className="quiz-label">Discord user ID</span>
            <input required inputMode="numeric" pattern="\d{15,22}" value={form.discordId} onChange={(event) => setForm({ ...form, discordId: event.target.value.trim() })} placeholder="Right-click their name in Discord → Copy User ID" />
          </label>
          <label className="admin-field"><span className="quiz-label">Name</span>
            <input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} placeholder="So you know who it is" />
          </label>
          <label className="admin-field"><span className="quiz-label">Role</span>
            <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as QuizEditor['role'] })}>
              <option value="editor">Quiz editor</option>
              <option value="reviewer">Reviewer</option>
            </select>
          </label>
        </div>
        <fieldset className="quiz-fieldset">
          <legend className="quiz-label">Categories they can edit</legend>
          <CategoryPicker categories={categories} value={form.categories} onChange={(next) => setForm({ ...form, categories: next })} />
        </fieldset>
        {form.role === 'editor' && <label className="quiz-inline"><input type="checkbox" checked={form.canPublish} onChange={(event) => setForm({ ...form, canPublish: event.target.checked })} /> Can publish without review</label>}
        <div className="admin-row"><button type="submit" className="primary" disabled={busy || !form.categories.length}>{busy ? 'Adding…' : 'Add person'}</button></div>
        <p className="muted quiz-help">They open <code>/admin/quizzes</code> and log in with Discord. Every save shows in the Audit log.</p>
      </form>
    </section>
  </section>
}

function CategoryPicker({ categories, value, onChange }: { categories: CategorySummary[]; value: string[]; onChange: (next: string[]) => void }) {
  const all = value.includes('*')
  const flip = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value.filter((v) => v !== '*'), id])
  return <div className="quiz-chips">
    <label className={`quiz-chip${all ? ' on' : ''}`}><input type="checkbox" checked={all} onChange={() => onChange(all ? [] : ['*'])} />All</label>
    {!all && categories.map((c) => <label key={c.id} className={`quiz-chip${value.includes(c.id) ? ' on' : ''}`}>
      <input type="checkbox" checked={value.includes(c.id)} onChange={() => flip(c.id)} />{c.name}
    </label>)}
  </div>
}

export function QuizReviews({ access, navigate }: { access: Access; navigate: (to: string) => void }) {
  const [drafts, setDrafts] = useState<DraftSummary[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const reviewer = access.role !== 'editor'
  const load = () => quizApi.drafts().then((payload) => setDrafts(payload.drafts)).catch((reason) => setError(errorText(reason)))
  useEffect(() => { void load() }, [])

  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id)
    setError('')
    try {
      await fn()
      await load()
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setBusy('')
    }
  }

  return <section className="admin-grid quiz-page">
    <div>
      <p className="crumb"><a href="/admin/quizzes" onClick={(event) => { event.preventDefault(); navigate('/admin/quizzes') }}>Quizzes</a> / Reviews</p>
      <h1>{reviewer ? 'Review queue' : 'My drafts'}</h1>
      <p className="muted">{reviewer ? 'Drafts from quiz editors. Approving commits them to GitHub and the bot picks them up.' : 'Changes you saved. A reviewer or the owner publishes them.'}</p>
    </div>
    {error && <p className="notice error">{error}</p>}
    {!drafts && <p className="muted">Loading…</p>}
    {drafts && !drafts.length && <p className="quiz-check ok">Nothing waiting.</p>}
    <div className="quiz-drafts">
      {drafts?.map((draft) => {
        const open = `/admin/quizzes/edit?draft=${draft.id}&q=${draft.summary.first ?? 0}`
        return <article key={draft.id} className="admin-section quiz-draft">
          <div className="quiz-draft-head">
            <strong>{draft.message || draft.summary.text}</strong>
            <span className={`quiz-pill ${draft.status === 'pending' ? 'wait' : 'warn'}`}>{draft.status === 'pending' ? 'Waiting' : 'Changes requested'}</span>
          </div>
          <p className="muted">{draft.authorName} · {draft.categoryName} · {new Date(draft.updatedAt).toLocaleString()}</p>
          <div className="quiz-diffstat">
            {draft.summary.questions !== 0 && <code className={draft.summary.questions > 0 ? 'add' : 'del'}>{draft.summary.questions > 0 ? '+' : ''}{draft.summary.questions} questions</code>}
            {draft.summary.entries !== 0 && <code className={draft.summary.entries > 0 ? 'add' : 'del'}>{draft.summary.entries > 0 ? '+' : ''}{draft.summary.entries} entries</code>}
            {draft.summary.changed > 0 && <code>{draft.summary.changed} edited</code>}
          </div>
          {draft.note && <p className="admin-warn">{draft.reviewedBy}: {draft.note}</p>}
          <div className="admin-row">
            <a className="quiz-button" href={open} onClick={(event) => { event.preventDefault(); navigate(open) }}>Open</a>
            {reviewer && <>
              <button type="button" disabled={busy === draft.id} onClick={() => {
                const note = window.prompt('What should they change?') ?? null
                if (note != null) void act(draft.id, () => quizApi.rejectDraft(draft.id, note))
              }}>Request changes</button>
              <button type="button" className="primary" disabled={busy === draft.id} onClick={() => void act(draft.id, () => quizApi.approveDraft(draft.id))}>{busy === draft.id ? 'Publishing…' : 'Approve & publish'}</button>
            </>}
            {(!reviewer || access.role === 'owner') && <button type="button" className="quiz-danger" disabled={busy === draft.id} onClick={() => {
              if (window.confirm('Delete this draft?')) void act(draft.id, () => quizApi.deleteDraft(draft.id))
            }}>Delete</button>}
          </div>
        </article>
      })}
    </div>
  </section>
}
