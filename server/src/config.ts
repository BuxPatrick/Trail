import 'dotenv/config'
import { z } from 'zod'

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
