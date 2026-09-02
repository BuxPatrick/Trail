import { describe, it, expect, beforeAll } from 'vitest'
import { sql } from 'kysely'
import { testDb, resetDb } from './helpers/db.js'

beforeAll(async () => { await resetDb() })

async function columns(table: string) {
  const r = await sql<{ column_name: string }>`
    SELECT column_name FROM information_schema.columns
     WHERE table_name = ${table}
  `.execute(testDb)
  return r.rows.map(x => x.column_name).sort()
}

describe('schema', () => {
  it('creates every INC 1 table', async () => {
    const r = await sql<{ table_name: string }>`
      SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
    `.execute(testDb)
    const names = r.rows.map(x => x.table_name)
    for (const t of ['users', 'workspaces', 'workspace_members',
                     'projects', 'epics', 'tickets']) {
      expect(names).toContain(t)
    }
    // Dropped in 002: Neon Auth issues JWTs, so there is no session to store.
    expect(names).not.toContain('sessions')
  })

  it('identifies users by their Neon subject, and stores no password', async () => {
    const cols = await columns('users')
    expect(cols).toContain('neon_user_id')
    expect(cols).not.toContain('password_hash')
  })

  it('refuses two users with the same Neon subject', async () => {
    await sql`INSERT INTO users (email, neon_user_id, display_name)
              VALUES ('a@example.com', 'neon-same', 'A')`.execute(testDb)
    await expect(sql`INSERT INTO users (email, neon_user_id, display_name)
              VALUES ('b@example.com', 'neon-same', 'B')`.execute(testDb))
      .rejects.toThrow()
  })

  it('gives tickets the columns the spec requires', async () => {
    expect(await columns('tickets')).toEqual([
      'assignee_id', 'created_at', 'description', 'epic_id', 'id', 'number',
      'priority', 'project_id', 'reporter_id', 'status', 'title', 'updated_at',
    ])
  })

  it('rejects a ticket status outside the six', async () => {
    await expect(sql`
      INSERT INTO tickets (project_id, number, title, status, reporter_id)
      VALUES (gen_random_uuid(), 1, 'x', 'wontfix', gen_random_uuid())
    `.execute(testDb)).rejects.toThrow()
  })

  it('allows only one personal workspace per user', async () => {
    const u = await sql<{ id: string }>`
      INSERT INTO users (email, neon_user_id, display_name)
      VALUES ('dup@example.com', 'neon-dup', 'Dup') RETURNING id
    `.execute(testDb)
    const uid = u.rows[0]!.id
    await sql`INSERT INTO workspaces (name, kind, owner_id)
              VALUES ('Personal', 'personal', ${uid})`.execute(testDb)
    await expect(sql`INSERT INTO workspaces (name, kind, owner_id)
              VALUES ('Personal 2', 'personal', ${uid})`.execute(testDb))
      .rejects.toThrow()
  })

  it('allows many TEAM workspaces for the same owner', async () => {
    const u = await sql<{ id: string }>`
      INSERT INTO users (email, neon_user_id, display_name)
      VALUES ('teams@example.com', 'neon-teams', 'T') RETURNING id
    `.execute(testDb)
    const uid = u.rows[0]!.id
    await sql`INSERT INTO workspaces (name, kind, owner_id)
              VALUES ('Team A', 'team', ${uid})`.execute(testDb)
    await expect(sql`INSERT INTO workspaces (name, kind, owner_id)
              VALUES ('Team B', 'team', ${uid})`.execute(testDb))
      .resolves.toBeDefined()
  })

  it('SET NULL on epic delete keeps the tickets alive', async () => {
    const u = await sql<{ id: string }>`
      INSERT INTO users (email, neon_user_id, display_name)
      VALUES ('epics@example.com', 'neon-epics', 'E') RETURNING id`.execute(testDb)
    const uid = u.rows[0]!.id
    const w = await sql<{ id: string }>`
      INSERT INTO workspaces (name, kind, owner_id)
      VALUES ('P', 'personal', ${uid}) RETURNING id`.execute(testDb)
    const p = await sql<{ id: string }>`
      INSERT INTO projects (workspace_id, name, key)
      VALUES (${w.rows[0]!.id}, 'Trail', 'TRAIL') RETURNING id`.execute(testDb)
    const e = await sql<{ id: string }>`
      INSERT INTO epics (project_id, title)
      VALUES (${p.rows[0]!.id}, 'Auth') RETURNING id`.execute(testDb)
    await sql`INSERT INTO tickets (project_id, epic_id, number, title, reporter_id)
      VALUES (${p.rows[0]!.id}, ${e.rows[0]!.id}, 1, 'Hash passwords', ${uid})
    `.execute(testDb)

    await sql`DELETE FROM epics WHERE id = ${e.rows[0]!.id}`.execute(testDb)

    const left = await sql<{ epic_id: string | null }>`
      SELECT epic_id FROM tickets WHERE project_id = ${p.rows[0]!.id}
    `.execute(testDb)
    expect(left.rows).toHaveLength(1)
    expect(left.rows[0]!.epic_id).toBeNull()
  })
})
