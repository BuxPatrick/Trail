import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { loginSchema } from '@trail/shared'
import { neon } from '../auth/neon.js'

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
      const { error: authError } = await neon.signIn.email({
        email: parsed.data.email,
        password: parsed.data.password,
      })
      if (authError) { setError('Email or password is incorrect.'); return }
      await onDone()
      navigate('/')
    } catch {
      setError('Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <h1>Sign in to Trail</h1>
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
      <p>New here? <Link to="/signup">Create an account</Link></p>
    </form>
  )
}
