import { useCallback, useEffect, useState } from 'react'
import { endpoints, type PublicUser } from '../api/endpoints.js'
import { clearAccessToken, refreshAccessToken } from './neon.js'

/**
 * Bridges Neon Auth to Mira's own user record.
 *
 * Neon owns the credential; Mira owns the profile, workspace and membership.
 * Fetching /api/me is what provisions that Mira-side state on first sight, so
 * this hook is both "who am I" and "make sure I exist here".
 */
export function useSession() {
  const [user, setUser] = useState<PublicUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const token = await refreshAccessToken()
      if (!token) { setUser(null); return }
      setUser(await endpoints.me())
    } catch {
      // A 401 here is the normal signed-out state, not an error to surface.
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const signOut = useCallback(async () => {
    const { neon } = await import('./neon.js')
    try { await neon.signOut() } catch { /* already gone; clear anyway */ }
    clearAccessToken()
    setUser(null)
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  return { user, loading, refresh, signOut }
}
