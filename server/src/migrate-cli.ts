// Run migrations against whatever DATABASE_URL points at. Serverless
// functions must not migrate on cold start - concurrent instances would race
// the same DDL - so this is an explicit step run before a deploy goes live.
import { db } from './db/index.js'
import { migrateToLatest } from './db/migrate.js'

await migrateToLatest(db)
await db.destroy()
console.log('Migrations applied.')
