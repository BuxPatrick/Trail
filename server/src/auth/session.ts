import { randomBytes } from 'node:crypto'
import type { Kysely } from 'kysely'
import type { Database } from '../db/types.js'
import { config } from '../config.js'

/** 32 random bytes: opaque, unguessable, and revocable - unlike a JWT. */
const newToken = () => randomBytes(32).toString('base64url')

export async function createSession(
  db: Kysely<Database>,
  userId: string,
  userAgent?: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken()
  const expiresAt = new Date(
    Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000,
  )
  await db.insertInto('sessions').values({
    id: token,
    user_id: userId,
    expires_at: expiresAt,
    user_agent: userAgent ?? null,
  }).execute()
  return { token, expiresAt }
}

export async function lookupSession(
  db: Kysely<Database>,
  token: string,
): Promise<{ userId: string } | null> {
  const row = await db.selectFrom('sessions')
    .select('user_id')
    .where('id', '=', token)
    .where('expires_at', '>', new Date())
    .executeTakeFirst()
  return row ? { userId: row.user_id } : null
}

export async function destroySession(
  db: Kysely<Database>,
  token: string,
): Promise<void> {
  await db.deleteFrom('sessions').where('id', '=', token).execute()
}
