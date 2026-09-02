import { buildApp } from './app.js'
import { db } from './db/index.js'
import { migrateToLatest } from './db/migrate.js'
import { config } from './config.js'

await migrateToLatest(db)
buildApp(db).listen(config.port, () => {
  console.log(`Mira API listening on http://localhost:${config.port}`)
})
