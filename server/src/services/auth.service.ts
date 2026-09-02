import type { Kysely } from 'kysely'
import type { LoginInput, SignupInput } from '@mira/shared'
import type { Database } from '../db/types.js'
import { AppError } from '../errors.js'
import { hashPassword, verifyPassword } from '../auth/password.js'

export type PublicUser = { id: string; email: string; displayName: string }

export async function signup(
  db: Kysely<Database>,
  input: SignupInput,
): Promise<PublicUser> {
  const existing = await db.selectFrom('users').select('id')
    .where('email', '=', input.email).executeTakeFirst()
  if (existing) {
    throw new AppError('EMAIL_TAKEN', 'That email is already registered.', 409)
  }

  const passwordHash = await hashPassword(input.password)

  // One transaction: a user without a personal workspace would have nowhere
  // to put a project, so all three rows land together or not at all.
  return db.transaction().execute(async trx => {
    const user = await trx.insertInto('users').values({
      email: input.email,
      password_hash: passwordHash,
      display_name: input.displayName,
    }).returning(['id', 'email', 'display_name']).executeTakeFirstOrThrow()

    const ws = await trx.insertInto('workspaces').values({
      name: 'Personal', kind: 'personal', owner_id: user.id,
    }).returning('id').executeTakeFirstOrThrow()

    await trx.insertInto('workspace_members').values({
      workspace_id: ws.id, user_id: user.id, role: 'admin',
    }).execute()

    return { id: user.id, email: user.email, displayName: user.display_name }
  })
}

export async function login(
  db: Kysely<Database>,
  input: LoginInput,
): Promise<PublicUser> {
  // One error for both branches, so login cannot enumerate registered emails.
  const fail = () =>
    new AppError('INVALID_CREDENTIALS', 'Email or password is incorrect.', 401)

  const row = await db.selectFrom('users')
    .select(['id', 'email', 'display_name', 'password_hash'])
    .where('email', '=', input.email).executeTakeFirst()
  if (!row) throw fail()
  if (!await verifyPassword(row.password_hash, input.password)) throw fail()

  return { id: row.id, email: row.email, displayName: row.display_name }
}
