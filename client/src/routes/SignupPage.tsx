import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signupSchema } from '@trail/shared'
import { neon } from '../auth/neon.js'

export function SignupPage({ onDone }: { onDone: () => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    // The SAME schema the server validates with - one definition, both sides.
    const parsed = signupSchema.safeParse({ email, password, displayName })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check your details.')
      return
    }
    setBusy(true)
    try {
      // Neon Auth owns the credential. onDone() then fetches /api/me, which
      // is what provisions this user's Trail record and personal workspace.
      const { error: authError } = await neon.signUp.email({
        email: parsed.data.email,
        password: parsed.data.password,
        name: parsed.data.displayName,
      })
      if (authError) { setError(authError.message ?? 'Could not create that account.'); return }
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
      <h1>Create your Trail account</h1>
      {error && <p role="alert">{error}</p>}
      <label>Name
        <input value={displayName} onChange={e => setDisplayName(e.target.value)}
               autoComplete="name" required />
      </label>
      <label>Email
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
               autoComplete="email" required />
      </label>
      <label>Password
        <input type="password" value={password}
               onChange={e => setPassword(e.target.value)}
               autoComplete="new-password" required />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? 'Creating...' : 'Create account'}
      </button>
      <p>Already have an account? <Link to="/login">Sign in</Link></p>
    </form>
  )
}
