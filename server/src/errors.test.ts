import { describe, it, expect, vi } from 'vitest'
import { AppError, notFound, badRequest, errorMiddleware } from './errors.js'

function mockRes() {
  const res: any = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

describe('AppError', () => {
  it('carries a code and an HTTP status', () => {
    const e = new AppError('TICKET_NOT_FOUND', 'No such ticket', 404)
    expect(e.code).toBe('TICKET_NOT_FOUND')
    expect(e.status).toBe(404)
    expect(e).toBeInstanceOf(Error)
  })

  it('notFound builds a 404', () => {
    expect(notFound('X', 'nope').status).toBe(404)
  })

  it('badRequest builds a 400', () => {
    expect(badRequest('X', 'nope').status).toBe(400)
  })
})

describe('errorMiddleware', () => {
  it('renders an AppError as { error: { code, message } }', () => {
    const res = mockRes()
    errorMiddleware(new AppError('NOPE', 'Not allowed', 403), {} as any, res, vi.fn())
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'NOPE', message: 'Not allowed' },
    })
  })

  it('never leaks the message of an unexpected error', () => {
    const res = mockRes()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    errorMiddleware(new Error('connection string is postgres://u:pw@host'),
      {} as any, res, vi.fn())
    expect(res.status).toHaveBeenCalledWith(500)
    const body = res.json.mock.calls[0][0]
    expect(body.error.code).toBe('INTERNAL')
    expect(JSON.stringify(body)).not.toContain('postgres://')
    spy.mockRestore()
  })
})
