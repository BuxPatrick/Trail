import type { NextFunction, Request, Response } from 'express'
import type { Kysely } from 'kysely'
import type { Database } from '../db/types.js'
import { AppError } from '../errors.js'
import { verifyToken } from './verify.js'
import { provisionUser } from '../services/auth.service.js'

declare global {
  namespace Express {
    interface Request { userId?: string }
  }
}

const unauthenticated = () =>
  new AppError('NOT_AUTHENTICATED', 'Sign in to continue.', 401)

/**
 * Verifies the Neon Auth bearer token and resolves it to a Mira user,
 * provisioning that user on first sight. Sets req.userId to Mira's own uuid,
 * so every downstream service is unchanged from the session-cookie era.
 */
export function requireUser(db: Kysely<Database>) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const header = req.get('authorization')
      if (!header?.startsWith('Bearer ')) throw unauthenticated()

      const claims = await verifyToken(header.slice('Bearer '.length))
      if (!claims) throw unauthenticated()

      const user = await provisionUser(db, claims)
      req.userId = user.id
      next()
    } catch (err) {
      next(err)
    }
  }
}
