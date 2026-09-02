import { Migrator, type Kysely } from 'kysely'
import type { Database } from './types.js'
import * as m001 from './migrations/001_initial.js'

/**
 * Migrations are listed explicitly rather than read off disk, so the set is
 * identical in dev, test and production and cannot depend on the CWD.
 */
const migrations = { '001_initial': m001 }

export async function migrateToLatest(db: Kysely<Database>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: { getMigrations: async () => migrations },
  })
  const { error, results } = await migrator.migrateToLatest()
  for (const r of results ?? []) {
    if (r.status === 'Error') console.error(`migration failed: ${r.migrationName}`)
  }
  if (error) throw error
}
