import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createProjectSchema, TICKET_STATUSES, type TicketStatus } from '@trail/shared'
import {
  endpoints, type Project, type PublicUser, type TaskItem,
} from '../api/endpoints.js'
import { ApiError } from '../api/client.js'
import {
  CircleAlert, FolderKanban, ListTodo, LogOut, Plus, Users,
} from 'lucide-react'

const STATUS_LABELS: Record<TicketStatus, string> = {
  backlog: 'Backlog',
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
  closed: 'Closed',
}

const dateLabel = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
})

export function HomePage(
  { user, onSignOut }: { user: PublicUser; onSignOut: () => Promise<void> },
) {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  async function load() {
    setError(null)
    try {
      const [projectList, taskList] = await Promise.all([
        endpoints.listProjects(),
        endpoints.listMyTasks(),
      ])
      setProjects(projectList)
      setTasks(taskList)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Trail could not load your workspace.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const focusTasks = useMemo(
    () => tasks.filter(t => t.status === 'blocked' || t.priority === 'urgent'),
    [tasks],
  )

  async function create(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const parsed = createProjectSchema.safeParse({ name })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the project details.')
      return
    }

    setBusy(true)
    try {
      const created = await endpoints.createProject(parsed.data)
      setProjects(p => [...p, created])
      setName('')
      navigate(`/projects/${created.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  async function moveTask(taskId: string, status: TicketStatus) {
    const previous = tasks
    if (status === 'done' || status === 'closed') {
      setTasks(current => current.filter(t => t.id !== taskId))
    } else {
      setTasks(current => current.map(t => (t.id === taskId ? { ...t, status } : t)))
    }

    try {
      await endpoints.updateTicket(taskId, { status })
    } catch (err) {
      setTasks(previous)
      setError(err instanceof ApiError ? err.message : 'Could not move that task.')
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Workspace navigation">
        <div className="brand-row">
          <div>
            <p className="eyebrow">Trail</p>
            <h1>My work</h1>
          </div>
          <button
            type="button"
            className="icon-button"
            title="Sign out"
            aria-label="Sign out"
            onClick={() => void onSignOut()}
          >
            <LogOut size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="account-chip">{user.displayName}</div>

        <nav className="rail-section">
          <h2><FolderKanban size={16} aria-hidden="true" /> Personal</h2>
          <div className="project-stack">
            {projects.map(p => (
              <Link
                key={p.id}
                className="project-link"
                to={`/projects/${p.id}`}
                aria-label={`${p.key} - ${p.name}`}
              >
                <span>{p.key}</span>
                {p.name}
              </Link>
            ))}
            {!projects.length && !loading && (
              <p className="muted-tight">No personal projects yet.</p>
            )}
          </div>
        </nav>

        <section className="rail-section">
          <h2><Users size={16} aria-hidden="true" /> Collaborations</h2>
          <p className="muted-tight">Coming next: shared workspaces and invited users.</p>
        </section>

        <form className="rail-form" onSubmit={create}>
          <h2><Plus size={16} aria-hidden="true" /> New project</h2>
          <label>Name
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={busy}
              placeholder="Mobile app"
              required
            />
          </label>
          <button type="submit" disabled={busy}>
            <Plus size={17} aria-hidden="true" />
            {busy ? 'Creating' : 'Create'}
          </button>
        </form>
      </aside>

      <main className="home-main">
        <header className="page-heading">
          <div>
            <p className="eyebrow">Default view</p>
            <h2>Tasks</h2>
          </div>
          <div className="task-stats" aria-label="Task summary">
            <span>{tasks.length} open</span>
            <span>{focusTasks.length} urgent or blocked</span>
          </div>
        </header>

        {error && <p role="alert">{error}</p>}
        {loading && <p role="status">Loading your tasks...</p>}

        {!loading && focusTasks.length > 0 && (
          <section className="focus-strip" aria-label="Urgent and blocked tasks">
            <CircleAlert size={18} aria-hidden="true" />
            <strong>{focusTasks.length}</strong>
            <span>need attention before they drift.</span>
          </section>
        )}

        {!loading && tasks.length === 0 ? (
          <section className="empty-state">
            <ListTodo size={28} aria-hidden="true" />
            <h3>No open tasks</h3>
            <p>Create a project, open its board, and add the first ticket.</p>
          </section>
        ) : (
          <ol className="task-list">
            {tasks.map(task => (
              <li key={task.id} className="task-row">
                <div className="task-mainline">
                  <Link to={`/tickets/${task.id}`} className="task-key">{task.key}</Link>
                  <Link to={`/tickets/${task.id}`} className="task-title">{task.title}</Link>
                </div>
                <div className="task-meta">
                  <Link to={`/projects/${task.projectId}`}>{task.projectName}</Link>
                  <span className={`badge status-${task.status}`}>
                    {STATUS_LABELS[task.status]}
                  </span>
                  <span className={`badge priority-${task.priority}`}>
                    {task.priority}
                  </span>
                  <time dateTime={task.createdAt}>
                    {dateLabel.format(new Date(task.createdAt))}
                  </time>
                </div>
                <label className="compact-label">
                  Move {task.key}
                  <select
                    value={task.status}
                    onChange={e => void moveTask(task.id, e.target.value as TicketStatus)}
                  >
                    {TICKET_STATUSES.map(status => (
                      <option key={status} value={status}>{STATUS_LABELS[status]}</option>
                    ))}
                  </select>
                </label>
              </li>
            ))}
          </ol>
        )}
      </main>
    </div>
  )
}
