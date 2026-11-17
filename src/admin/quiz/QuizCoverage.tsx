import { useEffect, useMemo, useState } from 'react'
import {
  quizApi, errorText,
  type CategoryFile, type CategorySummary, type CoverageCheck, type CoverageDataset, type CoverageItem, type RawEntry, type Recipe,
} from './api'
import { IMPORT_KEY, type PendingImport } from './model'
import { PromptText } from './QuizLibrary'
import './quiz.css'

const TABS: Array<[CoverageDataset, string]> = [['umas', 'Umas'], ['cards', 'Support cards'], ['skills', 'Skills']]
const ANY = 'any'

type Coverage = { datasets: Record<CoverageDataset, CoverageItem[]>; checks: CoverageCheck[]; recipes: Recipe[] }

export function QuizCoverage({ navigate }: { navigate: (to: string) => void }) {
  const [data, setData] = useState<Coverage | null>(null)
  const [categories, setCategories] = useState<CategorySummary[]>([])
  const [error, setError] = useState('')
  const [tab, setTab] = useState<CoverageDataset>('umas')
  const [checkKey, setCheckKey] = useState('')
  const [showSmall, setShowSmall] = useState(false)
  const [search, setSearch] = useState('')
  const [group, setGroup] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [recipeId, setRecipeId] = useState('')
  const [targetCat, setTargetCat] = useState('')
  const [targetFile, setTargetFile] = useState<CategoryFile | null>(null)
  const [targetQ, setTargetQ] = useState<string>('new')
  const [result, setResult] = useState<{ entries: RawEntry[]; skipped: Array<{ key: string; reason: string }>; promptTemplate: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => {
    setData(null)
    Promise.all([quizApi.coverage(), quizApi.categories()])
      .then(([coverage, cats]) => { setData(coverage); setCategories(cats.categories) })
      .catch((reason) => setError(errorText(reason)))
  }
  useEffect(load, [])

  const items = useMemo(() => data?.datasets[tab] || [], [data, tab])
  const checks = useMemo(() => {
    if (!data) return []
    const own = data.checks.filter((c) => c.dataset === tab).sort((a, b) => b.covered.length - a.covered.length)
    const union = new Set(own.filter((c) => c.enabled).flatMap((c) => c.covered))
    const any: CoverageCheck = { dataset: tab, categoryId: '', categoryName: 'All enabled categories', enabled: true, index: -1, prompt: 'Appears in any question', entries: 0, covered: [...union] }
    return [any, ...own]
  }, [data, tab])
  const keyOf = (c: CoverageCheck) => (c.index < 0 ? ANY : `${c.categoryId}:${c.index}`)
  const active = checks.find((c) => keyOf(c) === checkKey) || checks.find((c) => c.index >= 0) || checks[0]
  const listed = checks.filter((c) => c.index < 0 || showSmall || c.covered.length >= 3 || keyOf(c) === checkKey)

  const groups = [...new Set(items.map((item) => item.rarity || item.group || '').filter(Boolean))].sort()
  const missing = useMemo(() => {
    if (!active) return []
    const covered = new Set(active.covered)
    const term = search.trim().toLowerCase()
    return items.filter((item) => !covered.has(item.key)
      && (!group || item.rarity === group || item.group === group)
      && (!term || `${item.key} ${item.label}`.toLowerCase().includes(term)))
  }, [active, items, search, group])

  const recipes = (data?.recipes || []).filter((r) => r.datasets.includes(tab))
  const recipe = recipes.find((r) => r.id === recipeId) || recipes.find((r) => r.promptTemplate === active?.prompt) || recipes[0]

  // Point the generator at the question that the selected check is about.
  const activeCat = active?.categoryId || ''
  const activeIndex = active?.index ?? -1
  useEffect(() => {
    if (activeIndex < 0) return
    setTargetCat(activeCat)
    setTargetQ(String(activeIndex))
    setPicked(new Set())
    setResult(null)
  }, [activeCat, activeIndex, tab])

  useEffect(() => {
    if (!targetCat) { setTargetFile(null); return }
    quizApi.category(targetCat).then((payload) => setTargetFile(payload.data)).catch(() => setTargetFile(null))
  }, [targetCat])

  const editable = categories.filter((c) => c.canSubmit)
  const toggle = (key: string) => setPicked((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  const generate = async () => {
    if (!recipe || !picked.size) return
    setBusy(true)
    setError('')
    try {
      const out = await quizApi.generate(recipe.id, [...picked])
      setResult(out)
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setBusy(false)
    }
  }

  const openInEditor = () => {
    if (!result || !targetCat) return
    // Only publishers add straight to a live question; everyone else starts a Test question with the same prompt,
    // which the approver can merge into that live question.
    const live = categories.find((c) => c.id === targetCat)?.canEdit === true
    const existing = targetQ === 'new' ? null : targetFile?.questions[Number(targetQ)]
    const question: number | 'new' = targetQ !== 'new' && live ? Number(targetQ) : 'new'
    const prompt = existing ? String(existing.promptTemplate || existing.prompt || result.promptTemplate) : result.promptTemplate
    const pending: PendingImport = { categoryId: targetCat, question, promptTemplate: prompt, entries: result.entries }
    try {
      sessionStorage.setItem(IMPORT_KEY, JSON.stringify(pending))
    } catch {
      setError('This browser blocked session storage, so generated rows cannot be handed to the editor.')
      return
    }
    navigate(`/admin/quizzes/edit?key=${targetCat}&q=${question}`)
  }

  return <section className="admin-grid quiz-page">
    <div className="quiz-head">
      <div>
        <p className="crumb"><a href="/admin/quizzes" onClick={(event) => { event.preventDefault(); navigate('/admin/quizzes') }}>Quizzes</a> / Coverage</p>
        <h1>Coverage &amp; generator</h1>
      </div>
      <button type="button" onClick={load}>Rescan</button>
    </div>
    {error && <p className="notice error">{error}</p>}

    <div className="quiz-tabs" role="tablist" aria-label="Dataset">
      {TABS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => { setTab(id); setCheckKey(''); setGroup(''); setPicked(new Set()); setResult(null); setRecipeId('') }}>
        {label} <span className="muted">{data?.datasets[id]?.length ?? ''}</span>
      </button>)}
    </div>

    {!data && !error && <p className="muted">Scanning quiz files…</p>}
    {data && <div className="quiz-desk">
      <div className="quiz-form">
        <section className="admin-section">
          <h2>Checks <label className="quiz-inline"><input type="checkbox" checked={showSmall} onChange={(event) => setShowSmall(event.target.checked)} /> Show small matches</label></h2>
          <p className="muted quiz-help">Each check asks: does every item appear as the subject or correct answer of this question?</p>
          {listed.map((c) => {
            const pct = items.length ? Math.round((c.covered.length / items.length) * 100) : 0
            const key = keyOf(c)
            return <button key={key} type="button" className={`quiz-check-row${active && keyOf(active) === key ? ' on' : ''}`} onClick={() => { setCheckKey(key); setRecipeId('') }}>
              <span className="quiz-check-text">
                <span><PromptText text={c.prompt} /></span>
                <small className="muted">{c.categoryName}{c.entries ? ` · ${c.entries} entries` : ''}{c.index >= 0 && !c.enabled ? ' · off' : ''}</small>
              </span>
              <span className="quiz-meter"><span className={pct === 100 ? 'full' : pct >= 60 ? 'mid' : 'low'} style={{ width: `${pct}%` }} /></span>
              <span className="quiz-count">{c.covered.length}/{items.length}</span>
            </button>
          })}
        </section>

        {active && <section className="admin-section">
          <h2>
            <span>Missing from “<PromptText text={active.prompt} />” <span className="quiz-missing-n">· {items.length - active.covered.length}</span></span>
          </h2>
          <div className="quiz-filters">
            <input type="search" aria-label="Filter missing items" placeholder="Filter…" value={search} onChange={(event) => setSearch(event.target.value)} />
            {groups.length > 1 && <select aria-label="Group" value={group} onChange={(event) => setGroup(event.target.value)}>
              <option value="">All</option>
              {groups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>}
            <button type="button" onClick={() => setPicked(new Set(missing.map((m) => m.key)))}>Select {missing.length}</button>
            {picked.size > 0 && <button type="button" onClick={() => setPicked(new Set())}>Clear</button>}
          </div>
          <div className="quiz-chips">
            {missing.slice(0, 300).map((item) => <label key={item.key} className={`quiz-chip${picked.has(item.key) ? ' on' : ''}`}>
              <input type="checkbox" checked={picked.has(item.key)} onChange={() => toggle(item.key)} />
              {item.label}{item.rarity ? <small> {item.rarity}</small> : null}
            </label>)}
            {missing.length > 300 && <span className="muted">+{missing.length - 300} more. Filter to narrow.</span>}
            {!missing.length && <p className="quiz-check ok">Nothing missing here.</p>}
          </div>
        </section>}
      </div>

      <aside className="quiz-rail">
        <section className="admin-section quiz-generator" aria-label="Generator">
          <h2>Generator</h2>
          {!recipes.length && <p className="muted">No recipes for this dataset yet.</p>}
          {recipes.length > 0 && <>
            <label className="admin-field"><span className="quiz-label">Recipe</span>
              <select value={recipe?.id || ''} onChange={(event) => { setRecipeId(event.target.value); setResult(null) }}>
                {recipes.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </label>
            {recipe && <p className="muted quiz-help">Prompt: <PromptText text={recipe.promptTemplate} /></p>}
            <label className="admin-field"><span className="quiz-label">Add to category</span>
              <select value={targetCat} onChange={(event) => { setTargetCat(event.target.value); setTargetQ('new') }}>
                <option value="">Pick a category…</option>
                {editable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            {targetCat && <label className="admin-field"><span className="quiz-label">Question</span>
              <select value={targetQ} onChange={(event) => setTargetQ(event.target.value)}>
                <option value="new">New question</option>
                {(targetFile?.questions || []).map((q, i) => Array.isArray(q.entries) && <option key={i} value={i}>{i + 1}. {String(q.promptTemplate || q.prompt || '').slice(0, 70)}</option>)}
              </select>
            </label>}
            <button type="button" className="primary" disabled={busy || !picked.size || !recipe} onClick={() => void generate()}>
              {busy ? 'Generating…' : `Generate for ${picked.size} selected`}
            </button>
          </>}
          {result && <div className="quiz-gen-preview">
            <span className="quiz-label">Preview · {result.entries.length} entries</span>
            <div className="quiz-gen-rows">
              {result.entries.slice(0, 8).map((entry, i) => Array.isArray(entry) && <div key={i}>
                <small className="muted">{String(entry[0])}</small>
                <span><b className="quiz-on">{entry[1][0]}</b> <span className="muted">+ {entry[1].slice(1).join(', ')}</span></span>
              </div>)}
              {result.entries.length > 8 && <p className="muted">+{result.entries.length - 8} more rows</p>}
            </div>
            {result.skipped.length > 0 && <p className="admin-warn">Skipped {result.skipped.length}: {result.skipped.slice(0, 5).map((s) => `${s.key} (${s.reason})`).join(', ')}{result.skipped.length > 5 ? '…' : ''}</p>}
            <button type="button" className="primary" disabled={!targetCat || !result.entries.length} onClick={openInEditor}>
              {targetCat ? 'Review in editor' : 'Pick a category first'}
            </button>
            <p className="muted quiz-help">Rows open as unsaved changes. {categories.find((c) => c.id === targetCat)?.canEdit && targetQ !== 'new' ? 'You publish them straight to the live question.' : 'Saving puts them in Test until they are approved.'}</p>
          </div>}
        </section>
      </aside>
    </div>}
  </section>
}
