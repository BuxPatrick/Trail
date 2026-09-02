import type { Kysely } from 'kysely'
import type { Database } from '../db/types.js'
import type { NeonClaims } from '../auth/verify.js'

export type PublicUser = { id: string; email: string; displayName: string }

/**
 * Turns a verified Neon identity into a Mira user, creating the row and its
 * personal workspace the first time we see that subject.
 *
 * This replaces the old signup(): Neon owns credentials now, but Mira still
 * owns the "every user has somewhere to put a project" invariant, so that
 * provisioning has to happen on first authenticated request instead.
 *
 * Idempotent by design - it runs on EVERY request, so it must be cheap on the
 * common path and safe under concurrency.
 */
export async function provisionUser(
  db: Kysely<Database>,
  claims: NeonClaims,
): Promise<PublicUser> {
  const existing = await db.selectFrom('users')
    .select(['id', 'email', 'display_name'])
    .where('neon_user_id', '=', claims.neonUserId)
    .executeTakeFirst()

  if (existing) {
    return {
      id: existing.id,
      email: existing.email,
      displayName: existing.display_name,
    }
  }

  return db.transaction().execute(async trx => {
    // Two concurrent first requests can both reach here; the unique index on
    // neon_user_id settles it and the loser re-reads the winner's row.
    const inserted = await trx.insertInto('users').values({
      email: claims.email,
      neon_user_id: claims.neonUserId,
      display_name: claims.displayName,
    })
      .onConflict(oc => oc.column('neon_user_id').doNothing())
      .returning(['id', 'email', 'display_name'])
      .executeTakeFirst()

    if (!inserted) {
      const winner = await trx.selectFrom('users')
        .select(['id', 'email', 'display_name'])
        .where('neon_user_id', '=', claims.neonUserId)
        .executeTakeFirstOrThrow()
      return {
        id: winner.id,
        email: winner.email,
        displayName: winner.display_name,
      }
    }

    const ws = await trx.insertInto('workspaces').values({
      name: 'Personal', kind: 'personal', owner_id: inserted.id,
    }).returning('id').executeTakeFirstOrThrow()

    await trx.insertInto('workspace_members').values({
      workspace_id: ws.id, user_id: inserted.id, role: 'admin',
    }).execute()

    return {
      id: inserted.id,
      email: inserted.email,
      displayName: inserted.display_name,
    }
  })
}
