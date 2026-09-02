import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  TICKET_PRIORITIES, TICKET_STATUSES,
  type TicketPriority, type TicketStatus, type UpdateTicketInput,
} from '@mira/shared'
import { endpoints, type Ticket } from '../api/endpoints.js'
import { ApiError } from '../api/client.js'

export function TicketPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<TicketStatus>('backlog')
  const [priority, setPriority] = useState<TicketPriority>('medium')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    try {
      const t = await endpoints.getTicket(id)
      setTicket(t)
      setTitle(t.title)
      setDescription(t.description ?? '')
      setStatus(t.status)
      setPriority(t.priority)
    } catch {
      setError('That ticket could not be loaded.')
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!id || !ticket) return
    setError(null); setSaved(false)

    // Send only what actually changed: updateTicketSchema rejects an empty
    // patch, and rewriting untouched columns is noise.
    const patch: UpdateTicketInput = {}
    if (title !== ticket.title) patch.title = title
    if (description !== (ticket.description ?? '')) patch.description = description
    if (status !== ticket.status) patch.status = status
    if (priority !== ticket.priority) patch.priority = priority

    if (Object.keys(patch).length === 0) { setSaved(true); return }

    try {
      const updated = await endpoints.updateTicket(id, patch)
      setTicket(updated)
      setSaved(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    }
  }

  async function remove() {
    if (!id) return
    if (!confirm('Delete this ticket permanently? This cannot be undone.')) return
    try {
      await endpoints.deleteTicket(id)
      navigate('/')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    }
  }

  if (error && !ticket) {
    return <main className="page-main"><p role="alert">{error}</p><Link to="/">Tasks</Link></main>
  }
  if (!ticket) return <main className="page-main"><p>Loading...</p></main>

  return (
    <main className="page-main">
      <header className="topbar">
        <Link to="/">Tasks</Link>
        <h1>{ticket.key}</h1>
      </header>

      {error && <p role="alert">{error}</p>}
      {saved && <p role="status">Saved.</p>}

      <form onSubmit={save}>
        <label>Title
          <input value={title} onChange={e => setTitle(e.target.value)} required />
        </label>
        <label>Description
          <textarea value={description} rows={6}
                    onChange={e => setDescription(e.target.value)} />
        </label>
        <label>Status
          <select value={status}
                  onChange={e => setStatus(e.target.value as TicketStatus)}>
            {TICKET_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>Priority
          <select value={priority}
                  onChange={e => setPriority(e.target.value as TicketPriority)}>
            {TICKET_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <button type="submit">Save changes</button>
      </form>

      <button type="button" onClick={remove}>Delete ticket</button>
    </main>
  )
}
