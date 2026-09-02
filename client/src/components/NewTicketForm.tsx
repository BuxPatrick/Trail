import { useState, type FormEvent } from 'react'
import { createTicketSchema } from '@mira/shared'
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
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const parsed = createTicketSchema.safeParse({
      title,
      ...(description.trim() ? { description } : {}),
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a title.')
      return
    }
    try {
      onCreated(await endpoints.createTicket(projectId, parsed.data))
      setTitle(''); setDescription('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    }
  }

  return (
    <form onSubmit={submit}>
      <h2>New ticket</h2>
      {error && <p role="alert">{error}</p>}
      <label>Title
        <input value={title} onChange={e => setTitle(e.target.value)} required />
      </label>
      <label>Description
        <textarea value={description} onChange={e => setDescription(e.target.value)} />
      </label>
      <button type="submit">Add ticket</button>
    </form>
  )
}
