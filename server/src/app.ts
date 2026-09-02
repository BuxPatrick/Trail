import express, { type Express } from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import type { Kysely } from 'kysely'
import type { Database } from './db/types.js'
import { errorMiddleware } from './errors.js'
import { authRoutes, meRoute } from './routes/auth.routes.js'
import { config } from './config.js'

/**
 * Builds the app WITHOUT listening, so tests can mount it directly.
 * The db is injected rather than imported so tests use mira_test.
 */
export function buildApp(db: Kysely<Database>): Express {
  const app = express()

  // credentials: true is required for the session cookie to cross origins in
  // development, where Vite serves on 5173 and the API on 3001.
  app.use(cors({ origin: config.clientOrigin, credentials: true }))
  app.use(express.json())
  app.use(cookieParser())

  app.use('/api/auth', authRoutes(db))
  app.use('/api', meRoute(db))

  app.use(errorMiddleware)
  return app
}
