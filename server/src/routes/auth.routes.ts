import { Router } from 'express'
import type { Kysely } from 'kysely'
import { loginSchema, signupSchema } from '@mira/shared'
import type { Database } from '../db/types.js'
import { AppError } from '../errors.js'
import { login, signup } from '../services/auth.service.js'
import { createSession, destroySession } from '../auth/session.js'
import { requireUser } from '../auth/middleware.js'
import { config } from '../config.js'

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
}

export function authRoutes(db: Kysely<Database>): Router {
  const r = Router()

  r.post('/signup', async (req, res, next) => {
    try {
      const parsed = signupSchema.safeParse(req.body)
      if (!parsed.success) {
        throw new AppError('VALIDATION_FAILED',
          parsed.error.issues[0]?.message ?? 'Invalid input.', 400)
      }
      const user = await signup(db, parsed.data)
      const { token, expiresAt } = await createSession(db, user.id, req.get('user-agent'))
      res.cookie(config.sessionCookieName, token, { ...COOKIE_OPTS, expires: expiresAt })
      res.status(201).json(user)
    } catch (err) { next(err) }
  })

  r.post('/login', async (req, res, next) => {
    try {
      const parsed = loginSchema.safeParse(req.body)
      if (!parsed.success) {
        throw new AppError('VALIDATION_FAILED', 'Invalid input.', 400)
      }
      const user = await login(db, parsed.data)
      const { token, expiresAt } = await createSession(db, user.id, req.get('user-agent'))
      res.cookie(config.sessionCookieName, token, { ...COOKIE_OPTS, expires: expiresAt })
      res.status(200).json(user)
    } catch (err) { next(err) }
  })

  r.post('/logout', async (req, res, next) => {
    try {
      const token = req.cookies?.[config.sessionCookieName]
      if (token) await destroySession(db, token)
      res.clearCookie(config.sessionCookieName, COOKIE_OPTS)
      res.status(204).end()
    } catch (err) { next(err) }
  })

  return r
}

export function meRoute(db: Kysely<Database>): Router {
  const r = Router()
  r.get('/me', requireUser(db), async (req, res, next) => {
    try {
      const u = await db.selectFrom('users')
        .select(['id', 'email', 'display_name'])
        .where('id', '=', req.userId!).executeTakeFirstOrThrow()
      res.json({ id: u.id, email: u.email, displayName: u.display_name })
    } catch (err) { next(err) }
  })
  return r
}
