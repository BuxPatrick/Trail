import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import type { Database } from './types.js'
import { config } from '../config.js'

export function makeDb(connectionString: string): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString }) }),
  })
}

export const db = makeDb(config.databaseUrl)
