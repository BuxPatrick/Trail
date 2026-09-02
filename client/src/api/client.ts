import { getAccessToken } from '../auth/neon.js'

// Relative: the Vite proxy in dev, a Vercel rewrite in production. Auth no
// longer depends on this being same-origin - it is a bearer token now - but
// one origin still keeps the deployment simple.
const BASE = '/api'

export class ApiError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  // Auth travels as a Neon Auth bearer token, not a cookie, so there is
  // nothing cross-site to negotiate.
  const token = getAccessToken()
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
    ...init,
  })

  if (!res.ok) {
    // The server always sends { error: { code, message } } - but a proxy or a
    // crash might not, so never assume the shape.
    let code = 'UNKNOWN'
    let message = 'Something went wrong.'
    try {
      const body: any = await res.json()
      if (body?.error?.code) { code = body.error.code; message = body.error.message }
    } catch { /* keep the defaults */ }
    throw new ApiError(code, message, res.status)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}
