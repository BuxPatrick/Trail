import type { NextFunction, Request, Response } from 'express'
import type { Kysely } from 'kysely'
import type { Database } from '../db/types.js'
import { AppError } from '../errors.js'
import { lookupSession } from './session.js'
import { config } from '../config.js'

declare global {
  namespace Express {
    interface Request { userId?: string }
  }
}

/** Reads the session cookie, resolves the user, or fails with 401. */
export function requireUser(db: Kysely<Database>) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = req.cookies?.[config.sessionCookieName]
      if (!token) throw new AppError('NOT_AUTHENTICATED', 'Sign in to continue.', 401)
      const session = await lookupSession(db, token)
      if (!session) throw new AppError('NOT_AUTHENTICATED', 'Sign in to continue.', 401)
      req.userId = session.userId
      next()
    } catch (err) {
      next(err)
    }
  }
}
