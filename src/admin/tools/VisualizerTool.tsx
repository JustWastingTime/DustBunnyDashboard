import { useEffect, useState } from 'react'
import { adminApi } from '../api'

export function VisualizerTool() {
  const [meets, setMeets] = useState<Array<{ number: string; name: string }>>([])
  const [maps, setMaps] = useState<Array<{ name: string }>>([])
  const [cmNumber, setCmNumber] = useState('')
  const [mapQuery, setMapQuery] = useState('')
  const [skillName, setSkillName] = useState('')
  const [skillJson, setSkillJson] = useState('')
  const [png, setPng] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    adminApi.catalog().then((payload) => { setMeets(payload.meets); setMaps(payload.maps) }).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
  }, [])
  return <section className="admin-grid">
    <h1>Skill visualizer</h1>
    <p>Preview uses the same map renderer as the Discord skill command.</p>
    {error && <p className="notice error">{error}</p>}
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
      <button type="button" onClick={async () => {
      setError(''); setNote('')
      try {
        let skill: unknown
        if (skillJson.trim()) skill = JSON.parse(skillJson)
        const result = await adminApi.preview({
          skill,
          skillName: skill ? undefined : skillName,
          cmNumber: mapQuery.trim() ? undefined : cmNumber,
          mapQuery: mapQuery.trim() || undefined,
        })
        setPng(result.pngBase64 || '')
        setNote(result.shouldShowChart
          ? `${result.label}${result.doesNotWork ? ' — does not work on this course' : ''}`
          : `${result.label}: no chart. ${(result.reasons || []).join(' ')}`)
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason))
      }
    }}>Render</button>
    </div>
    <label className="admin-field">Saved skill name
      <input value={skillName} onChange={(event) => setSkillName(event.target.value)} />
    </label>
    <label className="admin-field">Or a skill JSON draft
      <textarea value={skillJson} onChange={(event) => setSkillJson(event.target.value)} placeholder='{"skill_name":"Example","activation_map":{...}}' />
    </label>
    {note && <p>{note}</p>}
    {png && <img className="admin-map" alt="Skill activation map" src={`data:image/png;base64,${png}`} />}
  </section>
}
