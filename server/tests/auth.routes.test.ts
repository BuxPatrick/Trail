import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { testDb, resetDb } from './helpers/db.js'
import { buildApp } from '../src/app.js'

const app = buildApp(testDb)

const INPUT = {
  email: 'patrick@example.com',
  password: 'correct horse battery',
  displayName: 'Patrick',
}

beforeEach(async () => { await resetDb() })

describe('POST /api/auth/signup', () => {
  it('creates the account and sets an httpOnly session cookie', async () => {
    const res = await request(app).post('/api/auth/signup').send(INPUT)
    expect(res.status).toBe(201)
    expect(res.body.email).toBe('patrick@example.com')
    expect(res.body).not.toHaveProperty('passwordHash')

    const cookie = res.headers['set-cookie']![0]!
    expect(cookie).toContain('mira_session=')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
  })

  it('rejects a short password with 400', async () => {
    const res = await request(app).post('/api/auth/signup')
      .send({ ...INPUT, password: 'short' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_FAILED')
  })

  it('rejects a duplicate email with 409', async () => {
    await request(app).post('/api/auth/signup').send(INPUT)
    const res = await request(app).post('/api/auth/signup').send(INPUT)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('EMAIL_TAKEN')
  })
})

describe('POST /api/auth/login', () => {
  it('logs in and sets a cookie', async () => {
    await request(app).post('/api/auth/signup').send(INPUT)
    const res = await request(app).post('/api/auth/login')
      .send({ email: INPUT.email, password: INPUT.password })
    expect(res.status).toBe(200)
    expect(res.headers['set-cookie']![0]!).toContain('mira_session=')
  })

  it('returns 401 for a wrong password', async () => {
    await request(app).post('/api/auth/signup').send(INPUT)
    const res = await request(app).post('/api/auth/login')
      .send({ email: INPUT.email, password: 'wrong horse battery' })
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS')
  })
})

describe('GET /api/me', () => {
  it('returns the current user when a session cookie is present', async () => {
    const agent = request.agent(app)
    await agent.post('/api/auth/signup').send(INPUT)
    const res = await agent.get('/api/me')
    expect(res.status).toBe(200)
    expect(res.body.email).toBe('patrick@example.com')
  })

  it('returns 401 with no cookie', async () => {
    const res = await request(app).get('/api/me')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('NOT_AUTHENTICATED')
  })

  it('returns 401 once the session is destroyed by logout', async () => {
    const agent = request.agent(app)
    await agent.post('/api/auth/signup').send(INPUT)
    await agent.post('/api/auth/logout')
    const res = await agent.get('/api/me')
    expect(res.status).toBe(401)
  })
})

describe('POST /api/auth/logout', () => {
  it('deletes the session row, not merely the cookie', async () => {
    const agent = request.agent(app)
    await agent.post('/api/auth/signup').send(INPUT)
    expect(await testDb.selectFrom('sessions').selectAll().execute())
      .toHaveLength(1)
    await agent.post('/api/auth/logout')
    // The whole point of sessions over JWTs: logout revokes server-side.
    expect(await testDb.selectFrom('sessions').selectAll().execute())
      .toHaveLength(0)
  })

  it('succeeds even with no session', async () => {
    expect((await request(app).post('/api/auth/logout')).status).toBe(204)
  })
})
