import { useEffect, useState } from 'react'
import { adminApi } from '../api'

export function SkillMapPreview({ skill }: { skill: Record<string, unknown> }) {
  const [meets, setMeets] = useState<Array<{ number: string; name: string }>>([])
  const [maps, setMaps] = useState<Array<{ name: string }>>([])
  const [cmNumber, setCmNumber] = useState('')
  const [mapQuery, setMapQuery] = useState('')
  const [png, setPng] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    adminApi.catalog()
      .then((payload) => { setMeets(payload.meets); setMaps(payload.maps) })
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
  }, [])

  const render = async (draft: Record<string, unknown>, course: string, cm: string) => {
    setBusy(true)
    setError('')
    try {
      const result = await adminApi.preview({
        skill: draft,
        cmNumber: course.trim() ? undefined : cm,
        mapQuery: course.trim() || undefined,
      })
      setPng(result.pngBase64 || '')
      setNote(result.shouldShowChart
        ? `${result.label}${result.doesNotWork ? ' — does not work on this course' : ''}`
        : `${result.label}: no chart. ${(result.reasons || []).join(' ')}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const signature = JSON.stringify({
    name: skill.skill_name,
    map: skill.activation_map,
    effect: skill.effect,
    description: skill.description,
  })

  useEffect(() => {
    const handle = setTimeout(() => { void render(skill, mapQuery, cmNumber) }, 700)
    return () => clearTimeout(handle)
  }, [signature, cmNumber, mapQuery])

  return <section className="admin-grid preview-panel">
    <h2>Activation preview</h2>
    <div className="preview-controls">
      <label className="admin-field">Champions Meet
        <select value={cmNumber} disabled={Boolean(mapQuery)} onChange={(event) => setCmNumber(event.target.value)}>
          <option value="">Next meet</option>
          {meets.map((meet) => <option key={meet.number} value={meet.number}>{meet.number} — {meet.name}</option>)}
        </select>
      </label>
      <label className="admin-field">Course
        <select value={mapQuery} onChange={(event) => setMapQuery(event.target.value)}>
          <option value="">Use Champions Meet</option>
          {maps.map((map) => <option key={map.name} value={map.name}>{map.name}</option>)}
        </select>
      </label>
      <button type="button" disabled={busy} onClick={() => void render(skill, mapQuery, cmNumber)}>{busy ? 'Rendering…' : 'Render'}</button>
    </div>
    {error && <p className="notice error">{error}</p>}
    {note && <p className="muted">{note}</p>}
    {png && <img className="admin-map" alt="Skill activation map" src={`data:image/png;base64,${png}`} />}
  </section>
}
