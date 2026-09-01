import { useCallback, useEffect, useState } from 'react'
import { endpoints, type PublicUser } from '../api/endpoints.js'

export function useSession() {
  const [user, setUser] = useState<PublicUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setUser(await endpoints.me())
    } catch {
      // A 401 here is the normal signed-out state, not an error to surface.
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  return { user, loading, refresh }
}
