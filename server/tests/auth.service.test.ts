import { describe, it, expect, beforeEach } from 'vitest'
import { testDb, resetDb } from './helpers/db.js'
import { signup, login } from '../src/services/auth.service.js'
import { createSession, lookupSession, destroySession } from '../src/auth/session.js'

const INPUT = {
  email: 'patrick@example.com',
  password: 'correct horse battery',
  displayName: 'Patrick',
}

beforeEach(async () => { await resetDb() })

describe('signup', () => {
  it('creates the user without exposing the hash', async () => {
    const u = await signup(testDb, INPUT)
    expect(u.email).toBe('patrick@example.com')
    expect(u.displayName).toBe('Patrick')
    expect(u).not.toHaveProperty('password_hash')
  })

  it('creates a personal workspace and makes the user its admin', async () => {
    const u = await signup(testDb, INPUT)
    const ws = await testDb.selectFrom('workspaces')
      .selectAll().where('owner_id', '=', u.id).executeTakeFirstOrThrow()
    expect(ws.kind).toBe('personal')
    expect(ws.mode).toBe('free')

    const m = await testDb.selectFrom('workspace_members')
      .selectAll().where('user_id', '=', u.id).executeTakeFirstOrThrow()
    expect(m.role).toBe('admin')
    expect(m.workspace_id).toBe(ws.id)
  })

  it('rejects a duplicate email', async () => {
    await signup(testDb, INPUT)
    await expect(signup(testDb, INPUT)).rejects.toMatchObject({ code: 'EMAIL_TAKEN' })
  })

  it('creates exactly one user row even after a rejected retry', async () => {
    await signup(testDb, INPUT)
    await expect(signup(testDb, INPUT)).rejects.toThrow()
    const rows = await testDb.selectFrom('users')
      .select('id').where('email', '=', 'patrick@example.com').execute()
    expect(rows).toHaveLength(1)
  })
})

describe('login', () => {
  it('accepts the correct password', async () => {
    await signup(testDb, INPUT)
    const u = await login(testDb, { email: INPUT.email, password: INPUT.password })
    expect(u.email).toBe('patrick@example.com')
  })

  it('gives a wrong password and an unknown email the identical error', async () => {
    await signup(testDb, INPUT)
    const wrongPw: any = await login(testDb,
      { email: INPUT.email, password: 'wrong horse battery' }).catch(e => e)
    const noUser: any = await login(testDb,
      { email: 'nobody@example.com', password: 'whatever at all' }).catch(e => e)
    expect(wrongPw.code).toBe('INVALID_CREDENTIALS')
    expect(noUser.code).toBe('INVALID_CREDENTIALS')
    expect(wrongPw.message).toBe(noUser.message)
  })
})

describe('sessions', () => {
  it('round-trips a session token', async () => {
    const u = await signup(testDb, INPUT)
    const { token } = await createSession(testDb, u.id)
    expect(await lookupSession(testDb, token)).toEqual({ userId: u.id })
  })

  it('returns null for an unknown token', async () => {
    expect(await lookupSession(testDb, 'nope')).toBeNull()
  })

  it('returns null for an expired session', async () => {
    const u = await signup(testDb, INPUT)
    const { token } = await createSession(testDb, u.id)
    await testDb.updateTable('sessions')
      .set({ expires_at: new Date(Date.now() - 1000) })
      .where('id', '=', token).execute()
    expect(await lookupSession(testDb, token)).toBeNull()
  })

  it('destroys a session', async () => {
    const u = await signup(testDb, INPUT)
    const { token } = await createSession(testDb, u.id)
    await destroySession(testDb, token)
    expect(await lookupSession(testDb, token)).toBeNull()
  })

  it('issues a different token each time', async () => {
    const u = await signup(testDb, INPUT)
    const a = await createSession(testDb, u.id)
    const b = await createSession(testDb, u.id)
    expect(a.token).not.toBe(b.token)
  })
})
