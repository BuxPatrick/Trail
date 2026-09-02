import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { z } from 'zod'

// Resolve .env from THIS FILE, not from process.cwd(). Vitest runs from the
// repo root but `npm run dev --workspace @mira/server` runs from server/, so
// a cwd-relative lookup works under test and fails when you actually start
// the server - the worst possible split.
loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') })

const schema = z.object({
  DATABASE_URL: z.string().url(),
  TEST_DATABASE_URL: z.string().url().optional(),
  SESSION_COOKIE_NAME: z.string().default('mira_session'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  PORT: z.coerce.number().int().positive().default(3001),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
})

const env = schema.parse(process.env)

export const config = Object.freeze({
  databaseUrl: env.DATABASE_URL,
  testDatabaseUrl: env.TEST_DATABASE_URL ?? env.DATABASE_URL,
  sessionCookieName: env.SESSION_COOKIE_NAME,
  sessionTtlDays: env.SESSION_TTL_DAYS,
  port: env.PORT,
  clientOrigin: env.CLIENT_ORIGIN,
})
