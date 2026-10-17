import { useState } from 'react'
import { suggestActivationMap } from '../lib/activationMap'

export function ActivationTool() {
  const [input, setInput] = useState('Final corner\n≤200m of the race remaining')
  const [output, setOutput] = useState('')
  return <section className="admin-grid">
    <h1>Activation map importer</h1>
    <p>Paste English conditions or raw condition code. This proposes the activation_map block. Review it before saving a skill.</p>
    <div className="admin-split">
      <label className="admin-field">Conditions
        <textarea value={input} onChange={(event) => setInput(event.target.value)} />
      </label>
      <pre className="diff">{output || 'Awaiting input.'}</pre>
    </div>
    <button type="button" onClick={() => {
      const map = suggestActivationMap(input)
      setOutput(map ? JSON.stringify(map, null, 2) : 'No map suggested for that text.')
    }}>Suggest map</button>
  </section>
}
