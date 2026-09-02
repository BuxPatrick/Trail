// Vercel serverless entry. A catch-all so every /api/* URL reaches the same
// Express app; without the [...path] filename Vercel would look for a file
// per route (api/auth/login.ts and so on).
//
// The app is built once at module scope, so warm invocations reuse both it
// and the pg pool rather than opening a connection per request.
import { buildApp } from '../server/src/app.js'
import { db } from '../server/src/db/index.js'

export default buildApp(db)
