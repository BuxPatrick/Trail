// Vercel serverless entry. vercel.json rewrites every /api/* URL here, so one
// Express app serves them all. A [...path].ts catch-all was tried first and
// only ever matched single-segment paths - /api/projects worked while
// /api/projects/:id fell through to Vercel's own 404.
//
// The app is built once at module scope, so warm invocations reuse both it
// and the pg pool rather than opening a connection per request.
import { buildApp } from '../server/src/app.js'
import { db } from '../server/src/db/index.js'

export default buildApp(db)
