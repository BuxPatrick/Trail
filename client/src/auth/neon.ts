/// <reference types="vite/client" />
import { createAuthClient } from '@neondatabase/neon-js/auth'
import { BetterAuthReactAdapter } from '@neondatabase/neon-js/auth/react/adapters'

const AUTH_URL = import.meta.env.VITE_NEON_AUTH_URL as string

if (!AUTH_URL) {
  throw new Error(
    'VITE_NEON_AUTH_URL is not set. Copy it from the Neon console (project -> Auth).',
  )
}

export const neonAuthUrl = AUTH_URL

export const neon = createAuthClient(AUTH_URL, {
  adapter: BetterAuthReactAdapter(),
})

/**
 * The bearer token for Trail's own API.
 *
 * Signing in leaves a session on the Neon Auth origin; exchanging it at
 * /token yields the JWT that our Express server verifies against the
 * project's JWKS. Held in memory only - never localStorage, where any XSS
 * on the page could read it.
 */
let accessToken: string | null = null

export const getAccessToken = () => accessToken

export async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await fetch(`${AUTH_URL}/token`, { credentials: 'include' })
    if (!res.ok) { accessToken = null; return null }
    const body = (await res.json()) as { token?: string }
    accessToken = body.token ?? null
    return accessToken
  } catch {
    accessToken = null
    return null
  }
}

export function clearAccessToken() { accessToken = null }
