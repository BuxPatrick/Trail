import { describe, it, expect, vi, afterEach } from 'vitest'
import { api, ApiError } from './client.js'

afterEach(() => { vi.unstubAllGlobals() })

function stubFetch(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }))
}

describe('api', () => {
  it('returns the parsed body on success', async () => {
    stubFetch(200, { id: '1', email: 'p@example.com' })
    expect(await api('/me')).toEqual({ id: '1', email: 'p@example.com' })
  })

  it('always sends credentials so the session cookie travels', async () => {
    stubFetch(200, {})
    await api('/me')
    const init = (fetch as any).mock.calls[0][1]
    expect(init.credentials).toBe('include')
  })

  it('throws an ApiError carrying the server code and status', async () => {
    stubFetch(401, { error: { code: 'NOT_AUTHENTICATED', message: 'Sign in.' } })
    const err = (await api('/me').catch(e => e)) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('NOT_AUTHENTICATED')
    expect(err.status).toBe(401)
    expect(err.message).toBe('Sign in.')
  })

  it('still throws a usable error when the body is not the expected shape', async () => {
    stubFetch(500, 'gateway exploded')
    const err = (await api('/me').catch(e => e)) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('UNKNOWN')
    expect(err.status).toBe(500)
  })
})
