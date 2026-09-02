import { Kysely, sql } from 'kysely'

/**
 * Move authentication to Neon Auth.
 *
 * Mira keeps its OWN users table as a local projection rather than pointing
 * foreign keys at neon_auth.users_sync. Two reasons:
 *
 *  1. users_sync is populated ASYNCHRONOUSLY (usually under a second). Signup
 *     creates a user, a personal workspace and a membership in one
 *     transaction; against an async table that transaction would
 *     intermittently fail its foreign key for brand-new users.
 *  2. Keeping our own uuid primary key means workspaces.owner_id,
 *     workspace_members.user_id, tickets.reporter_id and tickets.assignee_id
 *     do not change type or shape at all.
 *
 * neon_user_id holds the JWT `sub` claim and is how a verified token is
 * resolved to a Mira user.
 */
export async function up(db: Kysely<any>): Promise<void> {
  // Sessions were our own cookie-backed mechanism. Neon Auth issues JWTs, so
  // there is nothing left to store.
  await db.schema.dropTable('sessions').ifExists().execute()

  await db.schema.alterTable('users').dropColumn('password_hash').execute()

  await db.schema.alterTable('users')
    .addColumn('neon_user_id', 'text')
    .execute()

  // Any pre-existing local rows have no Neon identity and can never be logged
  // into again. There is no production data at this point, so they go - along
  // with the work they reported, since tickets.reporter_id is NOT NULL and has
  // no ON DELETE rule, so it would otherwise block the delete outright.
  await sql`
    DELETE FROM tickets
     WHERE reporter_id IN (SELECT id FROM users WHERE neon_user_id IS NULL)
  `.execute(db)
  // Workspaces (and their projects, and remaining tickets) cascade from here.
  await sql`DELETE FROM users WHERE neon_user_id IS NULL`.execute(db)

  await db.schema.alterTable('users')
    .alterColumn('neon_user_id', c => c.setNotNull())
    .execute()

  await db.schema
    .createIndex('users_neon_user_id_unique')
    .on('users').column('neon_user_id').unique()
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('users_neon_user_id_unique').ifExists().execute()
  await db.schema.alterTable('users').dropColumn('neon_user_id').execute()
  await db.schema.alterTable('users')
    .addColumn('password_hash', 'text', c => c.notNull().defaultTo(''))
    .execute()
}
