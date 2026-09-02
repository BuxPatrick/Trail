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
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameTo, setRenameTo] = useState('')

  async function rename(id: string) {
    setError(null)
    try {
      const updated = await endpoints.updateProject(id, { name: renameTo })
      setProjects(ps => ps.map(p => (p.id === id ? updated : p)))
      setRenaming(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    }
  }

  async function archive(id: string) {
    setError(null)
    try {
      await endpoints.updateProject(id, { archived: true })
      // Archiving only removes it from the default list; the project and all
      // its tickets remain, which is why this is never called Delete.
      setProjects(ps => ps.filter(p => p.id !== id))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    }
  }

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
            {renaming === p.id ? (
              <>
                <label>New name for {p.key}
                  <input value={renameTo}
                         onChange={e => setRenameTo(e.target.value)} />
                </label>
                <button type="button" onClick={() => void rename(p.id)}>Save</button>
                <button type="button" onClick={() => setRenaming(null)}>Cancel</button>
              </>
            ) : (
              <>
                <button type="button"
                        onClick={() => { setRenaming(p.id); setRenameTo(p.name) }}>
                  Rename {p.key}
                </button>
                <button type="button" onClick={() => void archive(p.id)}>
                  Archive {p.key}
                </button>
              </>
            )}
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
