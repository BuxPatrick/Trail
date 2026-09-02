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
const OTHER = {
  email: 'ama@example.com',
  password: 'correct horse battery',
  displayName: 'Ama',
}

async function withProject() {
  const agent = request.agent(app)
  await agent.post('/api/auth/signup').send(INPUT)
  const p = await agent.post('/api/projects').send({ name: 'Mira', key: 'MIRA' })
  return { agent, projectId: p.body.id as string }
}

async function stranger() {
  const agent = request.agent(app)
  await agent.post('/api/auth/signup').send(OTHER)
  return agent
}

beforeEach(async () => { await resetDb() })

describe('POST /api/projects/:id/tickets', () => {
  it('creates a ticket numbered from 1 and keyed MIRA-1', async () => {
    const { agent, projectId } = await withProject()
    const res = await agent.post(`/api/projects/${projectId}/tickets`)
      .send({ title: 'Set up the database' })
    expect(res.status).toBe(201)
    expect(res.body.number).toBe(1)
    expect(res.body.key).toBe('MIRA-1')
    expect(res.body.status).toBe('backlog')
    expect(res.body.priority).toBe('medium')
  })

  it('increments the number for each new ticket', async () => {
    const { agent, projectId } = await withProject()
    for (const t of ['One', 'Two', 'Three']) {
      await agent.post(`/api/projects/${projectId}/tickets`).send({ title: t })
    }
    const list = await agent.get(`/api/projects/${projectId}/tickets`)
    expect(list.body.map((t: any) => t.key)).toEqual(['MIRA-1', 'MIRA-2', 'MIRA-3'])
  })

  it('never reuses a number under concurrent creation', async () => {
    const { agent, projectId } = await withProject()
    await Promise.all(Array.from({ length: 10 }, (_, i) =>
      agent.post(`/api/projects/${projectId}/tickets`).send({ title: `T${i}` })))
    const list = await agent.get(`/api/projects/${projectId}/tickets`)
    const numbers = list.body
      .map((t: any) => t.number)
      .sort((a: number, b: number) => a - b)
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('rejects an empty title', async () => {
    const { agent, projectId } = await withProject()
    const res = await agent.post(`/api/projects/${projectId}/tickets`)
      .send({ title: '   ' })
    expect(res.status).toBe(400)
  })

  it('returns 404 for a project the caller cannot see', async () => {
    const { projectId } = await withProject()
    const other = await stranger()
    const res = await other.post(`/api/projects/${projectId}/tickets`)
      .send({ title: 'Sneaky' })
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/tickets/:id', () => {
  it('moves a ticket to a new status', async () => {
    const { agent, projectId } = await withProject()
    const t = await agent.post(`/api/projects/${projectId}/tickets`)
      .send({ title: 'Set up the database' })
    const res = await agent.patch(`/api/tickets/${t.body.id}`)
      .send({ status: 'in_progress' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('in_progress')
    expect(res.body.key).toBe('MIRA-1')
  })

  it('rejects a status outside the six', async () => {
    const { agent, projectId } = await withProject()
    const t = await agent.post(`/api/projects/${projectId}/tickets`).send({ title: 'X' })
    const res = await agent.patch(`/api/tickets/${t.body.id}`).send({ status: 'wontfix' })
    expect(res.status).toBe(400)
  })

  it('rejects an empty patch', async () => {
    const { agent, projectId } = await withProject()
    const t = await agent.post(`/api/projects/${projectId}/tickets`).send({ title: 'X' })
    expect((await agent.patch(`/api/tickets/${t.body.id}`).send({})).status).toBe(400)
  })

  it('bumps updated_at', async () => {
    const { agent, projectId } = await withProject()
    const t = await agent.post(`/api/projects/${projectId}/tickets`).send({ title: 'X' })
    const before = await testDb.selectFrom('tickets').select('updated_at')
      .where('id', '=', t.body.id).executeTakeFirstOrThrow()
    await new Promise(r => setTimeout(r, 10))
    await agent.patch(`/api/tickets/${t.body.id}`).send({ status: 'done' })
    const after = await testDb.selectFrom('tickets').select('updated_at')
      .where('id', '=', t.body.id).executeTakeFirstOrThrow()
    expect(new Date(after.updated_at as any).getTime())
      .toBeGreaterThan(new Date(before.updated_at as any).getTime())
  })

  it('returns 404 for a ticket in a project the caller cannot see', async () => {
    const { agent, projectId } = await withProject()
    const t = await agent.post(`/api/projects/${projectId}/tickets`).send({ title: 'X' })
    const other = await stranger()
    const res = await other.patch(`/api/tickets/${t.body.id}`).send({ status: 'done' })
    expect(res.status).toBe(404)
  })
})

describe('GET /api/projects/:id/tickets', () => {
  it('returns an empty array for a new project', async () => {
    const { agent, projectId } = await withProject()
    const res = await agent.get(`/api/projects/${projectId}/tickets`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('returns 404 for a project the caller cannot see', async () => {
    const { projectId } = await withProject()
    const other = await stranger()
    expect((await other.get(`/api/projects/${projectId}/tickets`)).status).toBe(404)
  })
})

describe('GET /api/tickets/:id', () => {
  it('returns one ticket with its key', async () => {
    const { agent, projectId } = await withProject()
    const t = await agent.post(`/api/projects/${projectId}/tickets`)
      .send({ title: 'Set up the database', description: 'Postgres + Kysely' })
    const res = await agent.get(`/api/tickets/${t.body.id}`)
    expect(res.status).toBe(200)
    expect(res.body.key).toBe('MIRA-1')
    expect(res.body.description).toBe('Postgres + Kysely')
  })

  it('returns 404 for a ticket the caller cannot see', async () => {
    const { agent, projectId } = await withProject()
    const t = await agent.post(`/api/projects/${projectId}/tickets`).send({ title: 'X' })
    const other = await stranger()
    expect((await other.get(`/api/tickets/${t.body.id}`)).status).toBe(404)
  })

  it('returns 404 for an id that does not exist', async () => {
    const { agent } = await withProject()
    expect((await agent.get(
      '/api/tickets/00000000-0000-0000-0000-000000000000')).status).toBe(404)
  })
})

describe('DELETE /api/tickets/:id', () => {
  it('deletes the ticket', async () => {
    const { agent, projectId } = await withProject()
    const t = await agent.post(`/api/projects/${projectId}/tickets`).send({ title: 'X' })
    expect((await agent.delete(`/api/tickets/${t.body.id}`)).status).toBe(204)
    expect((await agent.get(`/api/projects/${projectId}/tickets`)).body).toEqual([])
  })

  it('does NOT reuse the deleted number for the next ticket', async () => {
    const { agent, projectId } = await withProject()
    const t = await agent.post(`/api/projects/${projectId}/tickets`).send({ title: 'One' })
    await agent.delete(`/api/tickets/${t.body.id}`)
    const next = await agent.post(`/api/projects/${projectId}/tickets`)
      .send({ title: 'Two' })
    // The counter never rewinds: MIRA-1 must not come to mean a second thing.
    expect(next.body.key).toBe('MIRA-2')
  })

  it('returns 404 for a ticket the caller cannot see', async () => {
    const { agent, projectId } = await withProject()
    const t = await agent.post(`/api/projects/${projectId}/tickets`).send({ title: 'X' })
    const other = await stranger()
    expect((await other.delete(`/api/tickets/${t.body.id}`)).status).toBe(404)
  })
})
