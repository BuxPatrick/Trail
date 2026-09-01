const BASE = 'http://localhost:3001/api'

export class ApiError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    // Without this the session cookie is not sent across the dev origins.
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
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
