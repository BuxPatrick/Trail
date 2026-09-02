import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { createProjectSchema } from '@mira/shared'
import { endpoints, type Project, type PublicUser } from '../api/endpoints.js'
import { ApiError } from '../api/client.js'

export function ProjectListPage(
  { user, onSignOut }: { user: PublicUser; onSignOut: () => Promise<void> },
) {
  const [projects, setProjects] = useState<Project[]>([])
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { void endpoints.listProjects().then(setProjects) }, [])

  async function create(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const parsed = createProjectSchema.safeParse({ name, key })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the details.')
      return
    }
    try {
      const created = await endpoints.createProject(parsed.data)
      setProjects(p => [...p, created])
      setName(''); setKey('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    }
  }

  return (
    <main>
      <header>
        <h1>Mira</h1>
        <p>Signed in as {user.displayName}</p>
        <button onClick={async () => { await endpoints.logout(); await onSignOut() }}>
          Sign out
        </button>
      </header>

      <h2>Projects</h2>
      {projects.length === 0 && <p>No projects yet. Create the first one below.</p>}
      <ul>
        {projects.map(p => (
          <li key={p.id}>
            <Link to={`/projects/${p.id}`}>{p.key} - {p.name}</Link>
          </li>
        ))}
      </ul>

      <form onSubmit={create}>
        <h3>New project</h3>
        {error && <p role="alert">{error}</p>}
        <label>Name
          <input value={name} onChange={e => setName(e.target.value)} required />
        </label>
        <label>Key
          <input value={key} onChange={e => setKey(e.target.value)}
                 placeholder="MIRA" required />
        </label>
        <button type="submit">Create project</button>
      </form>
    </main>
  )
}
