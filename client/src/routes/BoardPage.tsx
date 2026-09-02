import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { endpoints, type Project, type Ticket } from '../api/endpoints.js'
import { Board } from '../components/Board.js'
import { NewTicketForm } from '../components/NewTicketForm.js'

export function BoardPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [allProjects, setAllProjects] = useState<Project[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    try {
      // The switcher reuses listProjects, so it costs one request and no
      // new endpoint.
      const [p, t, all] = await Promise.all([
        endpoints.getProject(id), endpoints.listTickets(id),
        endpoints.listProjects(),
      ])
      setProject(p); setTickets(t); setAllProjects(all)
    } catch {
      setError('That project could not be loaded.')
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  if (error) return <main className="page-main"><p role="alert">{error}</p><Link to="/">Tasks</Link></main>
  if (!project || !id) return <main className="page-main"><p>Loading...</p></main>

  return (
    <main className="page-main">
      <header className="topbar">
        <Link to="/">Tasks</Link>
        <h1>{project.key} - {project.name}</h1>

        {allProjects.length > 1 && (
          <label>Switch project
            <select value={id} onChange={e => navigate(`/projects/${e.target.value}`)}>
              {allProjects.map(p => (
                <option key={p.id} value={p.id}>{p.key} - {p.name}</option>
              ))}
            </select>
          </label>
        )}
      </header>

      {/* Board first: on a phone the create form would otherwise fill the
          whole screen and push the board you came to look at below the fold. */}
      <Board
        tickets={tickets}
        onStatusChange={async (ticketId, status) => {
          const updated = await endpoints.updateTicket(ticketId, { status })
          setTickets(prev => prev.map(t => (t.id === ticketId ? updated : t)))
        }}
      />

      <NewTicketForm
        projectId={id}
        onCreated={t => setTickets(prev => [...prev, t])}
      />
    </main>
  )
}
