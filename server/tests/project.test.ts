import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import { fakeVerifyToken } from './helpers/auth.js'

vi.mock('../src/auth/verify.js', () => ({ verifyToken: fakeVerifyToken }))

const { testDb, resetDb } = await import('./helpers/db.js')
const { buildApp } = await import('../src/app.js')
const { PATRICK, AMA } = await import('./helpers/auth.js')
const { projectContext } = await import('../src/services/context.js')

const app = buildApp(testDb)

/** A supertest caller that carries a Neon bearer token on every request. */
const as = (token: string) => ({
  get: (u: string) => request(app).get(u).set('Authorization', `Bearer ${token}`),
  post: (u: string) => request(app).post(u).set('Authorization', `Bearer ${token}`),
  patch: (u: string) => request(app).patch(u).set('Authorization', `Bearer ${token}`),
  delete: (u: string) => request(app).delete(u).set('Authorization', `Bearer ${token}`),
})

/** Hitting /api/me is what provisions a user, so it doubles as a fixture. */
async function provision(token: string) {
  const res = await as(token).get('/api/me')
  return res.body as { id: string; email: string; displayName: string }
}

const signedInAgent = (token: string = PATRICK) => as(token)
const OTHER = AMA

beforeEach(async () => { await resetDb() })

describe('POST /api/projects', () => {
  it('creates a project in the personal workspace and generates its key', async () => {
    const agent = await signedInAgent()
    const res = await agent.post('/api/projects').send({ name: 'Mira' })
    expect(res.status).toBe(201)
    expect(res.body.key).toBe('MIR')
    expect(res.body.name).toBe('Mira')
  })

  it('generates initials for a multi-word project name', async () => {
    const agent = await signedInAgent()
    const res = await agent.post('/api/projects').send({ name: 'Personal Website' })
    expect(res.status).toBe(201)
    expect(res.body.key).toBe('PW')
  })

  it('appends a number when the generated key is already used', async () => {
    const agent = await signedInAgent()
    await agent.post('/api/projects').send({ name: 'Mira' })
    const res = await agent.post('/api/projects').send({ name: 'Mirror' })
    expect(res.status).toBe(201)
    expect(res.body.key).toBe('MIR2')
  })

  it('requires authentication', async () => {
    const res = await request(app).post('/api/projects').send({ name: 'X' })
    expect(res.status).toBe(401)
  })
})

describe('GET /api/projects', () => {
  it('lists only the projects belonging to the caller', async () => {
    const mine = await signedInAgent()
    await mine.post('/api/projects').send({ name: 'Mira' })

    const other = await signedInAgent(OTHER)
    await other.post('/api/projects').send({ name: 'Theirs' })

    const res = await mine.get('/api/projects')
    expect(res.status).toBe(200)
    expect(res.body.map((p: any) => p.key)).toEqual(['MIR'])
  })
})

describe('GET /api/projects/:id', () => {
  it('returns a project the caller can see', async () => {
    const agent = await signedInAgent()
    const created = await agent.post('/api/projects').send({ name: 'Mira' })
    const res = await agent.get(`/api/projects/${created.body.id}`)
    expect(res.status).toBe(200)
    expect(res.body.key).toBe('MIR')
  })

  it('returns 404 - NOT 403 - for a project belonging to someone else', async () => {
    const mine = await signedInAgent()
    const created = await mine.post('/api/projects').send({ name: 'Mira' })

    const other = await signedInAgent(OTHER)
    const res = await other.get(`/api/projects/${created.body.id}`)
    // 403 would confirm the project exists. See spec section 7.
    expect(res.status).toBe(404)
  })

  it('returns 404 for an id that does not exist', async () => {
    const agent = await signedInAgent()
    const res = await agent.get('/api/projects/00000000-0000-0000-0000-000000000000')
    expect(res.status).toBe(404)
  })
})

describe('projectContext', () => {
  it('gives the owner the admin role and the inherited free mode', async () => {
    const u = await provision(PATRICK)
    const ws = await testDb.selectFrom('workspaces').select('id')
      .where('owner_id', '=', u.id).executeTakeFirstOrThrow()
    const p = await testDb.insertInto('projects')
      .values({ workspace_id: ws.id, name: 'Mira', key: 'MIRA' })
      .returning('id').executeTakeFirstOrThrow()

    expect(await projectContext(testDb, u.id, p.id))
      .toEqual({ userId: u.id, role: 'admin', mode: 'free' })
  })

  it('gives a non-member a null role', async () => {
    const u = await provision(PATRICK)
    const stranger = await provision(AMA)
    const ws = await testDb.selectFrom('workspaces').select('id')
      .where('owner_id', '=', u.id).executeTakeFirstOrThrow()
    const p = await testDb.insertInto('projects')
      .values({ workspace_id: ws.id, name: 'Mira', key: 'MIRA' })
      .returning('id').executeTakeFirstOrThrow()

    expect(await projectContext(testDb, stranger.id, p.id))
      .toEqual({ userId: stranger.id, role: null, mode: 'free' })
  })

  it('returns null when the project does not exist', async () => {
    const u = await provision(PATRICK)
    expect(await projectContext(testDb, u.id,
      '00000000-0000-0000-0000-000000000000')).toBeNull()
  })

  it('lets a project mode override the workspace mode', async () => {
    const u = await provision(PATRICK)
    const ws = await testDb.selectFrom('workspaces').select('id')
      .where('owner_id', '=', u.id).executeTakeFirstOrThrow()
    const p = await testDb.insertInto('projects')
      .values({ workspace_id: ws.id, name: 'M', key: 'M2', mode: 'managed' })
      .returning('id').executeTakeFirstOrThrow()

    expect((await projectContext(testDb, u.id, p.id))?.mode).toBe('managed')
  })
})

describe('PATCH /api/projects/:id', () => {
  it('renames a project', async () => {
    const agent = await signedInAgent()
    const p = await agent.post('/api/projects').send({ name: 'Mira' })
    const res = await agent.patch(`/api/projects/${p.body.id}`)
      .send({ name: 'Mira Tracker' })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Mira Tracker')
    expect(res.body.key).toBe('MIR')
  })

  it('archives a project, removing it from the list but not the database', async () => {
    const agent = await signedInAgent()
    const p = await agent.post('/api/projects').send({ name: 'Mira' })
    await agent.patch(`/api/projects/${p.body.id}`).send({ archived: true })

    expect((await agent.get('/api/projects')).body).toEqual([])
    // Still reachable by id - archiving is not deleting.
    expect((await agent.get(`/api/projects/${p.body.id}`)).status).toBe(200)
    const row = await testDb.selectFrom('projects').selectAll()
      .where('id', '=', p.body.id).executeTakeFirstOrThrow()
    expect(row.archived_at).not.toBeNull()
  })

  it('un-archives a project', async () => {
    const agent = await signedInAgent()
    const p = await agent.post('/api/projects').send({ name: 'Mira' })
    await agent.patch(`/api/projects/${p.body.id}`).send({ archived: true })
    await agent.patch(`/api/projects/${p.body.id}`).send({ archived: false })
    expect((await agent.get('/api/projects')).body).toHaveLength(1)
  })

  it('rejects an empty patch', async () => {
    const agent = await signedInAgent()
    const p = await agent.post('/api/projects').send({ name: 'Mira' })
    expect((await agent.patch(`/api/projects/${p.body.id}`).send({})).status).toBe(400)
  })

  it('returns 404 for a project belonging to someone else', async () => {
    const mine = await signedInAgent()
    const p = await mine.post('/api/projects').send({ name: 'Mira' })
    const other = await signedInAgent(OTHER)
    const res = await other.patch(`/api/projects/${p.body.id}`).send({ name: 'Hijacked' })
    expect(res.status).toBe(404)
  })

  it('does NOT change the key', async () => {
    const agent = await signedInAgent()
    const p = await agent.post('/api/projects').send({ name: 'Mira' })
    await agent.patch(`/api/projects/${p.body.id}`).send({ name: 'X', key: 'ZZZ' } as any)
    expect((await agent.get(`/api/projects/${p.body.id}`)).body.key).toBe('MIR')
  })
})
