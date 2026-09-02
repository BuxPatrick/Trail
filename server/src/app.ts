import express, { type Express } from 'express'
import cors from 'cors'
import type { Kysely } from 'kysely'
import type { Database } from './db/types.js'
import { errorMiddleware } from './errors.js'
import { meRoute } from './routes/auth.routes.js'
import { projectRoutes } from './routes/project.routes.js'
import { projectTicketRoutes, ticketRoutes } from './routes/ticket.routes.js'
import { config } from './config.js'

/**
 * Builds the app WITHOUT listening, so tests can mount it directly.
 * The db is injected rather than imported so tests use mira_test.
 */
export function buildApp(db: Kysely<Database>): Express {
  const app = express()

  // Behind Vercel's proxy, req.ip and req.protocol are otherwise the proxy's,
  // not the caller's - which matters for the per-IP rate limiting still to come.
  app.set('trust proxy', 1)

  // Auth now travels in an Authorization header rather than a cookie, so
  // credentials are no longer needed - but the header must be allowed through.
  app.use(cors({ origin: config.clientOrigin, allowedHeaders: ['Content-Type', 'Authorization'] }))
  app.use(express.json())

  app.use('/api', meRoute(db))
  app.use('/api/projects/:projectId/tickets', projectTicketRoutes(db))
  app.use('/api/projects', projectRoutes(db))
  app.use('/api/tickets', ticketRoutes(db))

  app.use(errorMiddleware)
  return app
}
