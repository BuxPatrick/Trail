import { sql } from 'kysely'
import { makeDb } from '../../src/db/index.js'
import { migrateToLatest } from '../../src/db/migrate.js'
import { config } from '../../src/config.js'

export const testDb = makeDb(config.testDatabaseUrl)

let migrated = false

/** Applies migrations once, then empties every table. Call in beforeEach. */
export async function resetDb(): Promise<void> {
  if (!migrated) {
    await migrateToLatest(testDb)
    migrated = true
  }
  // One statement, so FK order does not matter and it stays fast.
  await sql`
    TRUNCATE tickets, epics, projects, workspace_members, workspaces,
             users RESTART IDENTITY CASCADE
  `.execute(testDb)
}
