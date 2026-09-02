import { Router } from 'express'
import type { Kysely } from 'kysely'
import type { Database } from '../db/types.js'
import { requireUser } from '../auth/middleware.js'
import { listMyTasks } from '../services/ticket.service.js'

/**
 * Neon Auth owns signup, login, logout and password reset now, so Mira
 * exposes none of them. All that remains is "who am I", which doubles as the
 * call that provisions a first-time user via requireUser.
 */
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

  r.get('/me/tasks', requireUser(db), async (req, res, next) => {
    try {
      res.json(await listMyTasks(db, req.userId!))
    } catch (err) { next(err) }
  })

  return r
}
