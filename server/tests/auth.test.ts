import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import { fakeVerifyToken } from './helpers/auth.js'

vi.mock('../src/auth/verify.js', () => ({ verifyToken: fakeVerifyToken }))

const { testDb, resetDb } = await import('./helpers/db.js')
const { buildApp } = await import('../src/app.js')
const { PATRICK, AMA } = await import('./helpers/auth.js')

const app = buildApp(testDb)
const auth = (t: string) => ({ Authorization: `Bearer ${t}` })

beforeEach(async () => { await resetDb() })

describe('GET /api/me', () => {
  it('rejects a request with no Authorization header', async () => {
    const res = await request(app).get('/api/me')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('NOT_AUTHENTICATED')
  })

  it('rejects a token that does not verify', async () => {
    const res = await request(app).get('/api/me').set(auth('not-a-real-token'))
    expect(res.status).toBe(401)
  })

  it('rejects an Authorization header that is not Bearer', async () => {
    const res = await request(app).get('/api/me').set({ Authorization: PATRICK })
    expect(res.status).toBe(401)
  })

  it('returns the user for a verified token', async () => {
    const res = await request(app).get('/api/me').set(auth(PATRICK))
    expect(res.status).toBe(200)
    expect(res.body.email).toBe('patrick@example.com')
    expect(res.body.displayName).toBe('Patrick')
  })
})

describe('provisioning on first authenticated request', () => {
  it('creates the user, a personal workspace, and an admin membership', async () => {
    await request(app).get('/api/me').set(auth(PATRICK)).expect(200)

    const user = await testDb.selectFrom('users').selectAll()
      .where('neon_user_id', '=', 'neon-patrick').executeTakeFirstOrThrow()
    expect(user.email).toBe('patrick@example.com')

    const ws = await testDb.selectFrom('workspaces').selectAll()
      .where('owner_id', '=', user.id).executeTakeFirstOrThrow()
    expect(ws.kind).toBe('personal')
    expect(ws.mode).toBe('free')

    const m = await testDb.selectFrom('workspace_members').selectAll()
      .where('user_id', '=', user.id).executeTakeFirstOrThrow()
    expect(m.role).toBe('admin')
  })

  it('is idempotent across many requests', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app).get('/api/me').set(auth(PATRICK)).expect(200)
    }
    expect(await testDb.selectFrom('users').selectAll().execute()).toHaveLength(1)
    expect(await testDb.selectFrom('workspaces').selectAll().execute()).toHaveLength(1)
  })

  it('survives concurrent first requests without duplicating the user', async () => {
    // Two cold requests can race; the unique index on neon_user_id settles it.
    await Promise.all(Array.from({ length: 5 }, () =>
      request(app).get('/api/me').set(auth(PATRICK))))
    expect(await testDb.selectFrom('users').selectAll().execute()).toHaveLength(1)
    expect(await testDb.selectFrom('workspaces').selectAll().execute()).toHaveLength(1)
  })

  it('keeps separate subjects as separate users', async () => {
    await request(app).get('/api/me').set(auth(PATRICK)).expect(200)
    await request(app).get('/api/me').set(auth(AMA)).expect(200)
    expect(await testDb.selectFrom('users').selectAll().execute()).toHaveLength(2)
    expect(await testDb.selectFrom('workspaces').selectAll().execute()).toHaveLength(2)
  })
})
