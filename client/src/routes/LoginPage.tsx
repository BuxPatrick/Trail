import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { loginSchema } from '@mira/shared'
import { endpoints } from '../api/endpoints.js'
import { ApiError } from '../api/client.js'

export function LoginPage({ onDone }: { onDone: () => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const parsed = loginSchema.safeParse({ email, password })
    if (!parsed.success) {
      setError('Enter your email and password.')
      return
    }
    setBusy(true)
    try {
      await endpoints.login(parsed.data)
      await onDone()
      navigate('/')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <h1>Sign in to Mira</h1>
      {error && <p role="alert">{error}</p>}
      <label>Email
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
               autoComplete="email" required />
      </label>
      <label>Password
        <input type="password" value={password}
               onChange={e => setPassword(e.target.value)}
               autoComplete="current-password" required />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  )
}
