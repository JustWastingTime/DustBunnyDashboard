import { useState } from 'react'
import { parseEvents } from '../lib/parseEvents'

const SAMPLE = `Watch Where You're Going!
Top
Extra Tank hint +1
Special Week bond +5
Bottom
Guts +15
Bond +5`

export function EventTool() {
  const [input, setInput] = useState(SAMPLE)
  const [output, setOutput] = useState('')
  return <section className="admin-grid">
    <h1>Event formatter</h1>
    <p>Paste event text (blank line between events, Top/Bottom for choices, a ❯ line for a chain). The JSON can be dropped into a support card.</p>
    <div className="admin-split">
      <label className="admin-field">Events
        <textarea value={input} onChange={(event) => setInput(event.target.value)} />
      </label>
      <pre className="diff">{output || 'Awaiting input.'}</pre>
    </div>
    <button type="button" onClick={() => {
      const events = parseEvents(input)
      setOutput(events.length ? JSON.stringify(events.length === 1 ? events[0] : events, null, 2) : 'Could not parse event text.')
    }}>Format</button>
  </section>
}
