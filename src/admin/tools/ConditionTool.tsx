import { useState } from 'react'
import { convertConditions } from '../lib/convertConditions'

export function ConditionTool() {
  const [input, setInput] = useState('phase==0&distance_type==3')
  const [output, setOutput] = useState('')
  return <section className="admin-grid">
    <h1>Condition converter</h1>
    <p>Paste skill condition code. The result is the English list used in skill.json.</p>
    <div className="admin-split">
      <label className="admin-field">Code
        <textarea value={input} onChange={(event) => setInput(event.target.value)} />
      </label>
      <pre className="diff">{output || 'Awaiting input.'}</pre>
    </div>
    <button type="button" onClick={() => setOutput(convertConditions(input).text || 'No conditions parsed.')}>Convert</button>
  </section>
}
