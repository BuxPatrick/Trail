import { describe, it, expect } from 'vitest'
import { signupSchema, createTicketSchema, TICKET_STATUSES } from './index.js'

describe('signupSchema', () => {
  it('accepts a valid signup', () => {
    const r = signupSchema.safeParse({
      email: 'patrick@example.com',
      password: 'correct horse battery',
      displayName: 'Patrick',
    })
    expect(r.success).toBe(true)
  })

  it('rejects a password under 12 characters', () => {
    const r = signupSchema.safeParse({
      email: 'patrick@example.com',
      password: 'short',
      displayName: 'Patrick',
    })
    expect(r.success).toBe(false)
  })

  it('lowercases and trims the email', () => {
    const r = signupSchema.parse({
      email: '  Patrick@Example.COM ',
      password: 'correct horse battery',
      displayName: 'Patrick',
    })
    expect(r.email).toBe('patrick@example.com')
  })
})

describe('createTicketSchema', () => {
  it('defaults status to backlog and priority to medium', () => {
    const r = createTicketSchema.parse({ title: 'Set up the database' })
    expect(r.status).toBe('backlog')
    expect(r.priority).toBe('medium')
  })

  it('rejects a status that is not in the enum', () => {
    const r = createTicketSchema.safeParse({ title: 'x', status: 'wontfix' })
    expect(r.success).toBe(false)
  })

  it('rejects an empty title', () => {
    expect(createTicketSchema.safeParse({ title: '   ' }).success).toBe(false)
  })
})

describe('TICKET_STATUSES', () => {
  it('is exactly the six statuses from the spec, in board order', () => {
    expect(TICKET_STATUSES).toEqual([
      'backlog', 'todo', 'in_progress', 'blocked', 'done', 'closed',
    ])
  })
})
