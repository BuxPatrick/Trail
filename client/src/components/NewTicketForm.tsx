import { useState, type FormEvent } from 'react'
import {
  createTicketSchema, TICKET_PRIORITIES, type TicketPriority,
} from '@mira/shared'
import { endpoints, type Ticket } from '../api/endpoints.js'
import { ApiError } from '../api/client.js'

export function NewTicketForm(
  { projectId, onCreated }: {
    projectId: string
    onCreated: (t: Ticket) => void
  },
) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TicketPriority>('medium')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const parsed = createTicketSchema.safeParse({
      title,
      priority,
      ...(description.trim() ? { description } : {}),
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a title.')
      return
    }
    // Disable while in flight. The form clears on success, so anything typed
    // between submitting and the response landing would otherwise be wiped.
    setBusy(true)
    try {
      onCreated(await endpoints.createTicket(projectId, parsed.data))
      setTitle(''); setDescription(''); setPriority('medium')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <h2>New ticket</h2>
      {error && <p role="alert">{error}</p>}
      <label>Title
        <input value={title} onChange={e => setTitle(e.target.value)}
               disabled={busy} required />
      </label>
      <label>Description
        <textarea value={description} onChange={e => setDescription(e.target.value)} />
      </label>
      <label>Priority
        <select value={priority}
                onChange={e => setPriority(e.target.value as TicketPriority)}>
          {TICKET_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
      <button type="submit" disabled={busy}>
        {busy ? 'Adding...' : 'Add ticket'}
      </button>
    </form>
  )
}
